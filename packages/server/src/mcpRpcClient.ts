interface JsonRpcMessage<T> {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

interface ToolCallContent {
  type: string;
  text?: string;
}

export interface ToolCallResult {
  content?: ToolCallContent[];
  tools?: Array<{ name: string }>;
  isError?: boolean;
}

function parseSseDataBlocks(raw: string): string[] {
  return raw
    .split(/\r?\n\r?\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
    )
    .filter(Boolean);
}

export function getTextToolContent(result: ToolCallResult) {
  const textContent = result.content?.find((item) => item.type === "text")?.text;
  if (!textContent) {
    throw new Error("MCP response did not contain text content.");
  }

  return textContent;
}

export function parseToolTextContent(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      message: text
    };
  }
}

export class McpRpcClient {
  constructor(
    private readonly url: string,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async listTools() {
    return this.rpc<ToolCallResult>("tools/list", {});
  }

  async callTool(name: string, args: object) {
    const result = await this.rpc<ToolCallResult>("tools/call", {
      name,
      arguments: args
    });

    if (result.isError) {
      const message = getTextToolContent(result).trim();
      throw new Error(message || `MCP tool "${name}" failed.`);
    }

    return result;
  }

  private async rpc<T>(method: string, params: object) {
    const response = await this.fetchFn(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params
      })
    });

    if (!response.ok) {
      throw new Error(`MCP request failed with status ${response.status}.`);
    }

    const rawBody = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const messages = contentType.includes("text/event-stream")
      ? parseSseDataBlocks(rawBody)
      : [rawBody];

    const lastMessage = messages.at(-1);
    if (!lastMessage) {
      throw new Error("MCP response was empty.");
    }

    const payload = JSON.parse(lastMessage) as JsonRpcMessage<T>;

    if (payload.error) {
      throw new Error(payload.error.message);
    }

    if (!payload.result) {
      throw new Error("MCP response did not include a result.");
    }

    return payload.result;
  }
}
