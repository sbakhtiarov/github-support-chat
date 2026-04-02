import type { DependencyHealth } from "@github-support-chat/shared";

import { McpRpcClient, getTextToolContent } from "./mcpRpcClient.js";

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

export class GithubDocsMcpClient {
  private readonly rpcClient: McpRpcClient;

  constructor(
    private readonly url: string,
    fetchFn: typeof fetch = fetch
  ) {
    this.rpcClient = new McpRpcClient(url, fetchFn);
  }

  async getHealth(): Promise<DependencyHealth> {
    try {
      await this.rpcClient.listTools();
      return {
        reachable: true,
        ok: true
      };
    } catch (error) {
      return {
        reachable: false,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "GitHub docs MCP is unreachable."
      };
    }
  }

  async searchGithubDocs(query: string, topK = 5): Promise<GithubDocSearchResult[]> {
    const result = await this.rpcClient.callTool("search_github_docs", { query, topK });
    const content = getTextToolContent(result);
    return JSON.parse(content) as GithubDocSearchResult[];
  }

  async getGithubDocChunk(chunkId: string): Promise<GithubDocChunk> {
    const result = await this.rpcClient.callTool("get_github_doc_chunk", { chunkId });
    const content = getTextToolContent(result);

    if (content.startsWith("Chunk not found:")) {
      throw new Error(content);
    }

    return JSON.parse(content) as GithubDocChunk;
  }
}
