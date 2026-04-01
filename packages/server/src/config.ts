import { config as loadEnv } from "dotenv";

loadEnv();

export interface AppConfig {
  port: number;
  mcpUrl: string;
  openAiApiKey: string;
  openAiModel: string;
  conversationTtlMs: number;
  maxConversationTurns: number;
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 4000),
    mcpUrl: env.MCP_URL ?? "http://localhost:3000/mcp",
    openAiApiKey: env.OPENAI_API_KEY ?? "",
    openAiModel: env.OPENAI_MODEL ?? "gpt-4.1-mini",
    conversationTtlMs: Number(env.CONVERSATION_TTL_MS ?? 1000 * 60 * 30),
    maxConversationTurns: Number(env.MAX_CONVERSATION_TURNS ?? 12)
  };
}
