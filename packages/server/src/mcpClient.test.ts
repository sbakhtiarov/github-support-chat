import { describe, expect, it, vi } from "vitest";

import { GithubDocsMcpClient } from "./mcpClient.js";

describe("GithubDocsMcpClient", () => {
  it("sends streamable HTTP MCP headers and parses search results", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://localhost:3000/mcp");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      });

      const body = JSON.parse(String(init?.body));
      expect(body.method).toBe("tools/call");
      expect(body.params.name).toBe("search_github_docs");
      expect(body.params.arguments).toEqual({
        query: "pull requests",
        topK: 5
      });

      return new Response(
        `event: message\ndata: ${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify([
                  {
                    chunkId: "chunk-1",
                    repoPath: "content/pull-requests.md",
                    pageTitle: "Pull Requests",
                    sectionTitle: "About",
                    url: "https://docs.github.com/pull-requests",
                    score: 0.9,
                    quote: "Pull requests let you tell others about changes.",
                    rawMarkdown: "raw",
                    plainText: "plain"
                  }
                ])
              }
            ]
          }
        })}\n\n`,
        {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        }
      );
    });

    const client = new GithubDocsMcpClient("http://localhost:3000/mcp", fetchMock as typeof fetch);
    const results = await client.searchGithubDocs("pull requests");

    expect(results).toHaveLength(1);
    expect(results[0]?.chunkId).toBe("chunk-1");
  });
});
