import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app.js";

describe("chat API", () => {
  const config = {
    port: 4000,
    mcpUrl: "http://localhost:3000/mcp",
    hubspotMcpUrl: "http://localhost:3100/mcp",
    openAiApiKey: "test-key",
    openAiModel: "test-model",
    conversationTtlMs: 60_000,
    maxConversationTurns: 10
  };

  function createDependencies() {
    return {
      chatService: {
        generateReply: vi.fn()
      },
      githubDocsMcpClient: {
        getHealth: vi.fn(async () => ({
          reachable: true,
          ok: true
        }))
      },
      hubspotMcpClient: {
        getHealth: vi.fn(async () => ({
          reachable: true,
          ok: true
        }))
      }
    };
  }

  it("streams meta, tokens, sources, and done for a grounded answer", async () => {
    const deps = createDependencies();
    deps.chatService.generateReply.mockResolvedValue({
      text: "Use the Conversation tab to follow the discussion.",
      sources: [
        {
          title: "About pull requests",
          url: "https://docs.github.com/pull-requests",
          quote: "The Conversation tab of a pull request displays a description of the changes."
        }
      ]
    });

    const app = createApp({
      config,
      chatService: deps.chatService as never,
      githubDocsMcpClient: deps.githubDocsMcpClient as never,
      hubspotMcpClient: deps.hubspotMcpClient as never
    });

    const response = await request(app)
      .post("/api/chat")
      .send({
        conversationId: "conversation-1",
        message: "How do pull requests work?"
      })
      .expect(200);

    expect(response.text).toContain("event: meta");
    expect(response.text).toContain("event: token");
    expect(response.text).toContain("event: sources");
    expect(response.text).toContain("event: done");
    expect(response.text).toContain("https://docs.github.com/pull-requests");
  });

  it("streams ticket events for ticket actions", async () => {
    const deps = createDependencies();
    deps.chatService.generateReply.mockResolvedValue({
      text: "I drafted the support ticket.",
      sources: [],
      ticket: {
        mode: "draft",
        ticketId: "Pending creation",
        subject: "Checkout failure",
        customerEmail: "octo@example.com",
        priority: "HIGH",
        statusLabel: "Draft"
      }
    });

    const app = createApp({
      config,
      chatService: deps.chatService as never,
      githubDocsMcpClient: deps.githubDocsMcpClient as never,
      hubspotMcpClient: deps.hubspotMcpClient as never
    });

    const response = await request(app)
      .post("/api/chat")
      .send({
        conversationId: "conversation-1",
        message: "Create a support ticket."
      })
      .expect(200);

    expect(response.text).toContain("event: ticket");
    expect(response.text).toContain("Checkout failure");
  });

  it("returns separate health states for both MCP dependencies", async () => {
    const deps = createDependencies();
    deps.hubspotMcpClient.getHealth.mockResolvedValue({
      reachable: true,
      ok: false,
      error: "The OAuth token used to make this call expired."
    });

    const app = createApp({
      config,
      chatService: deps.chatService as never,
      githubDocsMcpClient: deps.githubDocsMcpClient as never,
      hubspotMcpClient: deps.hubspotMcpClient as never
    });

    const response = await request(app).get("/api/health").expect(503);

    expect(response.body).toMatchObject({
      ok: false,
      openAiConfigured: true,
      githubDocsMcp: {
        reachable: true,
        ok: true
      },
      hubspotMcp: {
        reachable: true,
        ok: false,
        error: "The OAuth token used to make this call expired."
      }
    });
  });

  it("streams an explicit error when OpenAI is not configured", async () => {
    const deps = createDependencies();
    const app = createApp({
      config: {
        ...config,
        openAiApiKey: ""
      },
      chatService: deps.chatService as never,
      githubDocsMcpClient: deps.githubDocsMcpClient as never,
      hubspotMcpClient: deps.hubspotMcpClient as never
    });

    const response = await request(app)
      .post("/api/chat")
      .send({
        conversationId: "conversation-1",
        message: "How do pull requests work?"
      })
      .expect(200);

    expect(response.text).toContain("event: error");
    expect(response.text).toContain("OPENAI_API_KEY");
    expect(deps.chatService.generateReply).not.toHaveBeenCalled();
  });
});
