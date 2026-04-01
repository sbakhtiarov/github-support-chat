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

interface ToolCallResult {
  content?: ToolCallContent[];
  tools?: Array<{ name: string }>;
}

export interface GithubDocSearchResult {
  chunkId: string;
  repoPath: string;
  pageTitle: string;
  sectionTitle?: string;
  url: string;
  score: number;
  quote: string;
  rawMarkdown: string;
  plainText: string;
}

export interface GithubDocChunk {
  chunkId: string;
  repoPath: string;
  pageTitle: string;
  sectionTitle?: string;
  sectionSlug?: string;
  canonicalUrl: string;
  rawMarkdown: string;
  plainText: string;
  tokenCount?: number;
  sourceCommitSha?: string;
  updatedAt?: string;
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

export class GithubDocsMcpClient {
  constructor(
    private readonly url: string,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async healthCheck() {
    await this.rpc<ToolCallResult>("tools/list", {});
  }

  async searchGithubDocs(query: string, topK = 5): Promise<GithubDocSearchResult[]> {
    const result = await this.callTool("search_github_docs", { query, topK });
    const content = this.getTextContent(result);
    return JSON.parse(content) as GithubDocSearchResult[];
  }

  async getGithubDocChunk(chunkId: string): Promise<GithubDocChunk> {
    const result = await this.callTool("get_github_doc_chunk", { chunkId });
    const content = this.getTextContent(result);

    if (content.startsWith("Chunk not found:")) {
      throw new Error(content);
    }

    return JSON.parse(content) as GithubDocChunk;
  }

  private async callTool(name: string, args: Record<string, unknown>) {
    return this.rpc<ToolCallResult>("tools/call", {
      name,
      arguments: args
    });
  }

  private getTextContent(result: ToolCallResult) {
    const textContent = result.content?.find((item) => item.type === "text")?.text;
    if (!textContent) {
      throw new Error("MCP response did not contain text content.");
    }

    return textContent;
  }

  private async rpc<T>(method: string, params: Record<string, unknown>) {
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
