export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

interface ConversationRecord {
  turns: ConversationTurn[];
  updatedAt: number;
}

export class ConversationStore {
  private readonly conversations = new Map<string, ConversationRecord>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxTurns: number
  ) {}

  getRecentTurns(conversationId: string): ConversationTurn[] {
    this.cleanupExpired();
    return this.conversations.get(conversationId)?.turns ?? [];
  }

  appendTurn(conversationId: string, turn: ConversationTurn) {
    this.cleanupExpired();

    const existing = this.conversations.get(conversationId);
    const turns = [...(existing?.turns ?? []), turn].slice(-this.maxTurns);

    this.conversations.set(conversationId, {
      turns,
      updatedAt: Date.now()
    });
  }

  private cleanupExpired() {
    const now = Date.now();

    for (const [conversationId, record] of this.conversations.entries()) {
      if (now - record.updatedAt > this.ttlMs) {
        this.conversations.delete(conversationId);
      }
    }
  }
}
