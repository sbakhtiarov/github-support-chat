import { ConversationStore } from "./conversationStore.js";
import { HubspotMcpClient } from "./hubspotMcpClient.js";
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
const githubDocsMcpClient = new GithubDocsMcpClient(config.mcpUrl);
const hubspotMcpClient = new HubspotMcpClient(config.hubspotMcpUrl);
const openAiGateway = new OpenAiChatGateway(
  config.openAiApiKey,
  config.openAiModel
);
const chatService = new ChatService({
  conversationStore,
  githubDocsMcpClient,
  hubspotMcpClient,
  openAiGateway
});

const app = createApp({
  config,
  chatService,
  githubDocsMcpClient,
  hubspotMcpClient
});

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
