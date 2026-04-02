import OpenAI from "openai";

import type { ConversationTurn } from "./conversationStore.js";
import type { GithubDocChunk } from "./mcpClient.js";
import type { PendingSupportTicketDraft } from "./supportTickets.js";

export interface IntentAnalysisResult {
  intent: "docs_answer" | "create_ticket" | "get_ticket_status" | "clarify";
  subject: string;
  description: string;
  customerEmail: string;
  priority: string;
  ticketId: string;
}

export interface ModelCitationDraft {
  quote: string;
  url: string;
}

export interface ModelAnswerDraft {
  answer: string;
  citations: ModelCitationDraft[];
}

export interface OpenAiGateway {
  generateGroundedAnswer(input: {
    question: string;
    conversation: ConversationTurn[];
    chunks: GithubDocChunk[];
  }): Promise<ModelAnswerDraft>;
  analyzeIntent(input: {
    message: string;
    conversation: ConversationTurn[];
    pendingTicketDraft?: PendingSupportTicketDraft | null;
  }): Promise<IntentAnalysisResult>;
}

const SYSTEM_PROMPT = `You are a GitHub support assistant that answers only from provided GitHub documentation excerpts.
Rules:
- Never use outside knowledge.
- If the documentation is insufficient, say so plainly in the answer and return an empty citations array.
- Return valid JSON with keys "answer" and "citations".
- "answer" must be plain text only, concise, and grounded in the docs.
- "citations" must contain 1 to 3 exact quotes copied verbatim from the provided plain text excerpts when the docs support an answer.
- Each citation item must include "quote" and "url".
- Never invent URLs or quotes.`;

const INTENT_SYSTEM_PROMPT = `You classify support-chat messages for a GitHub docs assistant that can also manage HubSpot support tickets.
Return valid JSON with keys:
- "intent": one of "docs_answer", "create_ticket", "get_ticket_status", "clarify"
- "subject": string
- "description": string
- "customerEmail": string
- "priority": "", "LOW", "MEDIUM", or "HIGH"
- "ticketId": string

Rules:
- Use "docs_answer" for normal GitHub documentation questions.
- Use "create_ticket" when the user wants to open, create, file, report, or submit a support issue.
- Use "get_ticket_status" when the user asks about a specific existing ticket's status or details.
- Use "clarify" only when the user's intent is genuinely unclear.
- Extract only details supported by the message and conversation; otherwise return empty strings.
- If a pending ticket draft exists, treat the new message as likely providing missing ticket details or edits.
- Do not invent ticket IDs, emails, subject lines, or descriptions.`;

export class OpenAiChatGateway implements OpenAiGateway {
  private readonly client: OpenAI | null;

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = apiKey.trim().length > 0 ? new OpenAI({ apiKey }) : null;
  }

  async generateGroundedAnswer(input: {
    question: string;
    conversation: ConversationTurn[];
    chunks: GithubDocChunk[];
  }): Promise<ModelAnswerDraft> {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.1,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: JSON.stringify({
            question: input.question,
            conversation: input.conversation,
            docs: input.chunks.map((chunk) => ({
              url: chunk.canonicalUrl,
              pageTitle: chunk.pageTitle,
              sectionTitle: chunk.sectionTitle,
              plainText: chunk.plainText
            }))
          })
        }
      ]
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error("OpenAI did not return any content.");
    }

    const parsed = JSON.parse(rawContent) as Partial<ModelAnswerDraft>;
    return {
      answer: typeof parsed.answer === "string" ? parsed.answer : "",
      citations: Array.isArray(parsed.citations)
        ? parsed.citations
            .filter(
              (citation): citation is ModelCitationDraft =>
                typeof citation?.quote === "string" &&
                typeof citation?.url === "string"
            )
            .slice(0, 3)
        : []
    };
  }

  async analyzeIntent(input: {
    message: string;
    conversation: ConversationTurn[];
    pendingTicketDraft?: PendingSupportTicketDraft | null;
  }): Promise<IntentAnalysisResult> {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: INTENT_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: JSON.stringify(input)
        }
      ]
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error("OpenAI did not return any content.");
    }

    const parsed = JSON.parse(rawContent) as Partial<IntentAnalysisResult>;
    return {
      intent:
        parsed.intent === "create_ticket" ||
        parsed.intent === "get_ticket_status" ||
        parsed.intent === "clarify"
          ? parsed.intent
          : "docs_answer",
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      description: typeof parsed.description === "string" ? parsed.description : "",
      customerEmail: typeof parsed.customerEmail === "string" ? parsed.customerEmail : "",
      priority: typeof parsed.priority === "string" ? parsed.priority : "",
      ticketId: typeof parsed.ticketId === "string" ? parsed.ticketId : ""
    };
  }
}
