import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { ConversationStore } from "./conversationStore.js";
import { ChatService } from "./chatService.js";
import { createApp } from "./app.js";

describe("chat API", () => {
  const config = {
    port: 4000,
    mcpUrl: "http://localhost:3000/mcp",
    openAiApiKey: "test-key",
    openAiModel: "test-model",
    conversationTtlMs: 60_000,
    maxConversationTurns: 10
  };

  it("streams meta, tokens, sources, and done for a grounded answer", async () => {
    const mcpClient = {
      healthCheck: vi.fn(),
      searchGithubDocs: vi.fn(async () => [
        {
          chunkId: "chunk-1"
        }
      ]),
      getGithubDocChunk: vi.fn(async () => ({
        chunkId: "chunk-1",
        repoPath: "content/pull-requests.md",
        pageTitle: "About pull requests",
        sectionTitle: "Working with pull requests",
        canonicalUrl: "https://docs.github.com/pull-requests",
        rawMarkdown: "",
        plainText:
          "The Conversation tab of a pull request displays a description of the changes."
      }))
    };

    const openAiGateway = {
      generateGroundedAnswer: vi.fn(async () => ({
        answer: "Use the Conversation tab to follow the discussion.",
        citations: [
          {
            quote: "The Conversation tab of a pull request displays a description of the changes.",
            url: "https://docs.github.com/pull-requests"
          }
        ]
      }))
    };

    const chatService = new ChatService({
      conversationStore: new ConversationStore(60_000, 10),
      mcpClient: mcpClient as never,
      openAiGateway
    });

    const app = createApp({
      config,
      chatService,
      mcpClient: mcpClient as never
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

  it("falls back instead of inventing an answer when retrieval is empty", async () => {
    const mcpClient = {
      healthCheck: vi.fn(),
      searchGithubDocs: vi.fn(async () => []),
      getGithubDocChunk: vi.fn()
    };

    const openAiGateway = {
      generateGroundedAnswer: vi.fn()
    };

    const chatService = new ChatService({
      conversationStore: new ConversationStore(60_000, 10),
      mcpClient: mcpClient as never,
      openAiGateway
    });

    const app = createApp({
      config,
      chatService,
      mcpClient: mcpClient as never
    });

    const response = await request(app)
      .post("/api/chat")
      .send({
        conversationId: "conversation-1",
        message: "Tell me something unsupported"
      })
      .expect(200);

    expect(response.text).toContain("I couldn't verify a supported answer");
    expect(response.text).toContain("event: sources");
    expect(openAiGateway.generateGroundedAnswer).not.toHaveBeenCalled();
  });

  it("streams an explicit error when OpenAI is not configured", async () => {
    const mcpClient = {
      healthCheck: vi.fn(),
      searchGithubDocs: vi.fn(),
      getGithubDocChunk: vi.fn()
    };

    const openAiGateway = {
      generateGroundedAnswer: vi.fn()
    };

    const chatService = new ChatService({
      conversationStore: new ConversationStore(60_000, 10),
      mcpClient: mcpClient as never,
      openAiGateway
    });

    const app = createApp({
      config: {
        ...config,
        openAiApiKey: ""
      },
      chatService,
      mcpClient: mcpClient as never
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
    expect(openAiGateway.generateGroundedAnswer).not.toHaveBeenCalled();
  });
});
