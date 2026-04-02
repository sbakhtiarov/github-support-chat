import { describe, expect, it, vi } from "vitest";

import { McpRpcClient, getTextToolContent } from "./mcpRpcClient.js";

describe("McpRpcClient", () => {
  it("parses SSE responses for tool calls", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://localhost:3000/mcp");
      expect(init?.headers).toMatchObject({
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      });

      return new Response(
        `event: message\ndata: ${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({ ok: true })
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

    const client = new McpRpcClient("http://localhost:3000/mcp", fetchMock as typeof fetch);
    const result = await client.callTool("demo_tool", { value: 1 });

    expect(getTextToolContent(result)).toBe('{"ok":true}');
  });

  it("surfaces tool errors from isError responses", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: "The OAuth token used to make this call expired."
              }
            ]
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    );

    const client = new McpRpcClient("http://localhost:3100/mcp", fetchMock as typeof fetch);

    await expect(client.callTool("list_ticket_pipelines", {})).rejects.toThrow(
      "The OAuth token used to make this call expired."
    );
  });
});
