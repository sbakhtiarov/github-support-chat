import { ConversationStore } from "./conversationStore.js";
import { ChatService } from "./chatService.js";
import { getConfig } from "./config.js";
import { GithubDocsMcpClient } from "./mcpClient.js";
import { OpenAiChatGateway } from "./openAiGateway.js";
import { createApp } from "./app.js";

const config = getConfig();
const conversationStore = new ConversationStore(
  config.conversationTtlMs,
  config.maxConversationTurns
);
const mcpClient = new GithubDocsMcpClient(config.mcpUrl);
const openAiGateway = new OpenAiChatGateway(
  config.openAiApiKey,
  config.openAiModel
);
const chatService = new ChatService({
  conversationStore,
  mcpClient,
  openAiGateway
});

const app = createApp({
  config,
  chatService,
  mcpClient
});

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
