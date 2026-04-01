import type { SourceItem } from "@github-support-chat/shared";

import type { ConversationStore } from "./conversationStore.js";
import type { GithubDocsMcpClient, GithubDocSearchResult } from "./mcpClient.js";
import type { OpenAiGateway } from "./openAiGateway.js";
import { validateCitations } from "./quoteValidation.js";

interface ChatServiceDependencies {
  conversationStore: ConversationStore;
  mcpClient: GithubDocsMcpClient;
  openAiGateway: OpenAiGateway;
}

export interface ChatServiceResult {
  text: string;
  sources: SourceItem[];
}

function formatAssistantReply(answer: string, sources: SourceItem[]) {
  const directAnswer = answer.trim();
  const quotesSection = sources
    .map(
      (source) =>
        `> ${source.quote}\n>\n> Source: [${source.title}](${source.url})`
    )
    .join("\n\n");

  const sourceLinks = Array.from(
    new Map(sources.map((source) => [source.url, source])).values()
  )
    .map((source) => `- [${source.title}](${source.url})`)
    .join("\n");

  return `${directAnswer}\n\n## Documentation quotes\n\n${quotesSection}\n\n## Sources\n\n${sourceLinks}`;
}

function buildFallbackReply(question: string) {
  return `I couldn't verify a supported answer for "${question}" from the retrieved GitHub documentation. Please try a more specific GitHub docs question so I can answer with exact quotes and links.`;
}

function mapSearchResultsToSources(results: GithubDocSearchResult[]): SourceItem[] {
  const seen = new Set<string>();
  const sources: SourceItem[] = [];

  for (const result of results) {
    const quote = result.quote.trim();
    if (!quote) {
      continue;
    }

    const key = `${result.url}::${quote}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    sources.push({
      title: result.sectionTitle
        ? `${result.pageTitle} - ${result.sectionTitle}`
        : result.pageTitle,
      url: result.url,
      quote
    });
  }

  return sources;
}

export class ChatService {
  constructor(private readonly deps: ChatServiceDependencies) {}

  async generateReply(
    conversationId: string,
    message: string
  ): Promise<ChatServiceResult> {
    const question = message.trim();
    this.deps.conversationStore.appendTurn(conversationId, {
      role: "user",
      content: question
    });

    let sources: SourceItem[] = [];
    let replyText = buildFallbackReply(question);

    const searchResults = await this.deps.mcpClient.searchGithubDocs(question, 5);
    const topResults = searchResults.slice(0, 3);

    if (topResults.length > 0) {
      const chunks = await Promise.all(
        topResults.map((result) =>
          this.deps.mcpClient.getGithubDocChunk(result.chunkId)
        )
      );

      const draft = await this.deps.openAiGateway.generateGroundedAnswer({
        question,
        conversation: this.deps.conversationStore.getRecentTurns(conversationId),
        chunks
      });

      sources = validateCitations(draft.citations, chunks);
      if (sources.length === 0) {
        sources = mapSearchResultsToSources(topResults);
      }

      if (draft.answer.trim() && sources.length > 0) {
        replyText = formatAssistantReply(draft.answer, sources);
      }
    }

    this.deps.conversationStore.appendTurn(conversationId, {
      role: "assistant",
      content: replyText
    });

    return {
      text: replyText,
      sources
    };
  }
}
