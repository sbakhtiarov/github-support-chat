import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ChatRequest, HealthResponse } from "@github-support-chat/shared";
import { encodeSseEvent } from "@github-support-chat/shared";

import type { AppConfig } from "./config.js";
import type { ChatService } from "./chatService.js";
import type { GithubDocsMcpClient } from "./mcpClient.js";
import type { HubspotMcpClient } from "./hubspotMcpClient.js";

interface CreateAppDependencies {
  config: AppConfig;
  chatService: ChatService;
  githubDocsMcpClient: GithubDocsMcpClient;
  hubspotMcpClient: HubspotMcpClient;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, "../../client/dist");

function writeChunkedText(res: express.Response, text: string) {
  const chunkSize = 36;

  for (let start = 0; start < text.length; start += chunkSize) {
    res.write(
      encodeSseEvent("token", {
        text: text.slice(start, start + chunkSize)
      })
    );
  }
}

export function createApp({
  config,
  chatService,
  githubDocsMcpClient,
  hubspotMcpClient
}: CreateAppDependencies) {
  const app = express();

  app.use(express.json());

  app.get("/api/health", async (_req, res) => {
    const [githubDocsMcp, hubspotMcp] = await Promise.all([
      githubDocsMcpClient.getHealth(),
      hubspotMcpClient.getHealth()
    ]);

    const body: HealthResponse = {
      ok: githubDocsMcp.ok && hubspotMcp.ok && config.openAiApiKey.trim().length > 0,
      openAiConfigured: config.openAiApiKey.trim().length > 0,
      githubDocsMcp,
      hubspotMcp
    };

    res.status(body.ok ? 200 : 503).json(body);
  });

  app.post("/api/chat", async (req, res) => {
    const body = req.body as Partial<ChatRequest>;

    if (typeof body?.conversationId !== "string" || typeof body?.message !== "string") {
      res.status(400).json({
        error: "conversationId and message are required."
      });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    res.write(
      encodeSseEvent("meta", {
        conversationId: body.conversationId
      })
    );

    if (config.openAiApiKey.trim().length === 0) {
      res.write(
        encodeSseEvent("error", {
          message:
            "The server is missing OPENAI_API_KEY, so it cannot generate grounded answers yet."
        })
      );
      res.end();
      return;
    }

    try {
      const reply = await chatService.generateReply(body.conversationId, body.message);
      writeChunkedText(res, reply.text);
      res.write(
        encodeSseEvent("sources", {
          items: reply.sources
        })
      );
      if (reply.ticket) {
        res.write(
          encodeSseEvent("ticket", {
            ticket: reply.ticket
          })
        );
      }
      res.write(encodeSseEvent("done", {}));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected server error.";

      console.error("Chat request failed", error);
      res.write(
        encodeSseEvent("error", {
          message
        })
      );
    } finally {
      res.end();
    }
  });

  app.use(express.static(clientDistPath));

  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });

  return app;
}
