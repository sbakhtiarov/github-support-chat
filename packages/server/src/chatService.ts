import type { SourceItem, SupportTicketCard } from "@github-support-chat/shared";

import type { ConversationStore } from "./conversationStore.js";
import type { HubspotMcpClient } from "./hubspotMcpClient.js";
import type { GithubDocsMcpClient, GithubDocSearchResult } from "./mcpClient.js";
import type { IntentAnalysisResult, OpenAiGateway } from "./openAiGateway.js";
import { validateCitations } from "./quoteValidation.js";
import {
  buildTicketCard,
  formatCreatedTicketMessage,
  formatDraftConfirmationMessage,
  formatMissingTicketFieldsMessage,
  formatStatusTicketMessage,
  getPendingTicketMissingFields,
  isTicketPlaceholderValue,
  isPendingTicketReady,
  mergePendingTicketDraft,
  normalizeHubspotTicketCard,
  normalizePriority,
  resolveTicketStageLabel,
  type PendingSupportTicketDraft
} from "./supportTickets.js";

interface ChatServiceDependencies {
  conversationStore: ConversationStore;
  githubDocsMcpClient: GithubDocsMcpClient;
  hubspotMcpClient: HubspotMcpClient;
  openAiGateway: OpenAiGateway;
}

export interface ChatServiceResult {
  text: string;
  sources: SourceItem[];
  ticket?: SupportTicketCard;
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

    const conversation = this.deps.conversationStore.getRecentTurns(conversationId);
    const pendingDraft = this.deps.conversationStore.getPendingTicketDraft(conversationId);
    const result = pendingDraft
      ? await this.handlePendingTicketDraft(conversationId, question, conversation, pendingDraft)
      : await this.handleNewRequest(conversationId, question, conversation);

    this.deps.conversationStore.appendTurn(conversationId, {
      role: "assistant",
      content: result.text
    });

    return result;
  }

  private async handleNewRequest(
    conversationId: string,
    question: string,
    conversation: ReturnType<ConversationStore["getRecentTurns"]>
  ): Promise<ChatServiceResult> {
    const analysis = await this.deps.openAiGateway.analyzeIntent({
      message: question,
      conversation
    });

    if (analysis.intent === "create_ticket") {
      return this.handleTicketDraftUpdate(conversationId, analysis);
    }

    if (analysis.intent === "get_ticket_status") {
      return this.handleTicketStatusLookup(analysis);
    }

    return this.generateDocsReply(question, conversation);
  }

  private async handlePendingTicketDraft(
    conversationId: string,
    question: string,
    conversation: ReturnType<ConversationStore["getRecentTurns"]>,
    pendingDraft: PendingSupportTicketDraft
  ): Promise<ChatServiceResult> {
    const normalized = question.trim().toLowerCase();

    if (["confirm", "yes", "yes please", "create it", "submit it"].includes(normalized)) {
      return this.createPendingTicket(conversationId, pendingDraft);
    }

    if (["cancel", "stop", "never mind", "nevermind"].includes(normalized)) {
      this.deps.conversationStore.clearPendingTicketDraft(conversationId);
      return {
        text: "I canceled the pending support ticket draft.",
        sources: []
      };
    }

    const analysis = await this.deps.openAiGateway.analyzeIntent({
      message: question,
      conversation,
      pendingTicketDraft: pendingDraft
    });

    return this.handleTicketDraftUpdate(conversationId, analysis, pendingDraft);
  }

  private async handleTicketDraftUpdate(
    conversationId: string,
    analysis: IntentAnalysisResult,
    currentDraft: PendingSupportTicketDraft | null = null
  ): Promise<ChatServiceResult> {
    const nextDraft = mergePendingTicketDraft(currentDraft, {
      subject: analysis.subject,
      description: analysis.description,
      customerEmail: analysis.customerEmail,
      priority: normalizePriority(analysis.priority)
    });
    this.deps.conversationStore.setPendingTicketDraft(conversationId, nextDraft);

    const missingFields = getPendingTicketMissingFields(nextDraft);
    if (missingFields.length > 0) {
      return {
        text: formatMissingTicketFieldsMessage(missingFields),
        sources: [],
        ticket: buildTicketCard("draft", nextDraft, {
          nextStepMessage: "Send the missing details and I will update the draft."
        })
      };
    }

    return {
      text: formatDraftConfirmationMessage(),
      sources: [],
      ticket: buildTicketCard("draft", nextDraft, {
        nextStepMessage: 'Reply "confirm" to create this ticket in HubSpot.'
      })
    };
  }

  private async createPendingTicket(
    conversationId: string,
    pendingDraft: PendingSupportTicketDraft
  ): Promise<ChatServiceResult> {
    if (!isPendingTicketReady(pendingDraft)) {
      return {
        text: formatMissingTicketFieldsMessage(getPendingTicketMissingFields(pendingDraft)),
        sources: [],
        ticket: buildTicketCard("draft", pendingDraft, {
          nextStepMessage: "Send the missing details and I will update the draft."
        })
      };
    }

    try {
      const rawTicket = await this.deps.hubspotMcpClient.createSupportTicket({
        customerEmail: pendingDraft.customerEmail,
        subject: pendingDraft.subject,
        description: pendingDraft.description,
        priority: pendingDraft.priority
      });
      const resolvedStatusLabel = await this.resolveHubspotStageLabel(rawTicket);
      this.deps.conversationStore.clearPendingTicketDraft(conversationId);

      const ticket = normalizeHubspotTicketCard(
        "created",
        rawTicket,
        pendingDraft,
        resolvedStatusLabel,
        "You can ask me for this ticket's status any time with the ticket ID."
      );
      this.logTicketNormalizationFallback("create_support_ticket", rawTicket, ticket);

      return {
        text: formatCreatedTicketMessage(ticket),
        sources: [],
        ticket
      };
    } catch (error) {
      return {
        text: `I couldn't create the HubSpot ticket yet: ${
          error instanceof Error ? error.message : "Unexpected HubSpot error."
        }`,
        sources: [],
        ticket: buildTicketCard("draft", pendingDraft, {
          nextStepMessage:
            'The draft is still saved. Reply "confirm" to retry after the HubSpot connection is fixed, or send edits.'
        })
      };
    }
  }

  private async handleTicketStatusLookup(
    analysis: IntentAnalysisResult
  ): Promise<ChatServiceResult> {
    const ticketId = analysis.ticketId.trim();
    if (!ticketId) {
      return {
        text: "I can check a support ticket once you share the ticket ID.",
        sources: []
      };
    }

    const rawTicket = await this.deps.hubspotMcpClient.getSupportTicket(ticketId);
    const resolvedStatusLabel = await this.resolveHubspotStageLabel(rawTicket);
    const fallbackDraft: PendingSupportTicketDraft = {
      subject: analysis.subject,
      customerEmail: analysis.customerEmail,
      priority: normalizePriority(analysis.priority)
    };
    const ticket = normalizeHubspotTicketCard(
      "status",
      rawTicket,
      fallbackDraft,
      resolvedStatusLabel,
      "Ask about another ticket ID any time if you want me to check it too."
    );
    this.logTicketNormalizationFallback("get_support_ticket", rawTicket, ticket);

    return {
      text: formatStatusTicketMessage(ticket),
      sources: [],
      ticket
    };
  }

  private async generateDocsReply(
    question: string,
    conversation: ReturnType<ConversationStore["getRecentTurns"]>
  ): Promise<ChatServiceResult> {
    let sources: SourceItem[] = [];
    let replyText = buildFallbackReply(question);

    const searchResults = await this.deps.githubDocsMcpClient.searchGithubDocs(question, 5);
    const topResults = searchResults.slice(0, 3);

    if (topResults.length > 0) {
      const chunks = await Promise.all(
        topResults.map((result) =>
          this.deps.githubDocsMcpClient.getGithubDocChunk(result.chunkId)
        )
      );

      const draft = await this.deps.openAiGateway.generateGroundedAnswer({
        question,
        conversation,
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

    return {
      text: replyText,
      sources
    };
  }

  private logTicketNormalizationFallback(
    operation: "create_support_ticket" | "get_support_ticket",
    rawTicket: unknown,
    ticket: SupportTicketCard
  ) {
    if (
      !isTicketPlaceholderValue(ticket.ticketId) &&
      !isTicketPlaceholderValue(ticket.statusLabel)
    ) {
      return;
    }

    console.warn("HubSpot ticket normalization used placeholder values", {
      operation,
      normalizedTicket: ticket,
      rawTicket: this.safeSerialize(rawTicket)
    });
  }

  private safeSerialize(value: unknown) {
    try {
      return JSON.stringify(value);
    } catch {
      return "[unserializable ticket payload]";
    }
  }

  private async resolveHubspotStageLabel(rawTicket: unknown) {
    try {
      const pipelines = await this.deps.hubspotMcpClient.listTicketPipelines();
      return resolveTicketStageLabel(rawTicket, pipelines);
    } catch (error) {
      console.warn("Failed to resolve HubSpot stage label from pipeline metadata", {
        error: error instanceof Error ? error.message : "Unexpected pipeline lookup error."
      });
      return undefined;
    }
  }
}
