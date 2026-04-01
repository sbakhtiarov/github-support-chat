import type { ChatRequest, ChatStreamEvent, SourceItem } from "@github-support-chat/shared";
import { createSseEventParser } from "@github-support-chat/shared";

type ChatEventHandler = (event: ChatStreamEvent) => void;

export async function streamChatResponse(
  payload: ChatRequest,
  onEvent: ChatEventHandler
) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok || !response.body) {
    throw new Error("Chat request failed.");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  const parser = createSseEventParser((event) => {
    const data = JSON.parse(event.data) as
      | { conversationId: string }
      | { text: string }
      | { items: SourceItem[] }
      | { message: string };

    switch (event.event) {
      case "meta":
        onEvent({
          type: "meta",
          conversationId: (data as { conversationId: string }).conversationId
        });
        break;
      case "token":
        onEvent({
          type: "token",
          text: (data as { text: string }).text
        });
        break;
      case "sources":
        onEvent({
          type: "sources",
          items: (data as { items: SourceItem[] }).items
        });
        break;
      case "done":
        onEvent({ type: "done" });
        break;
      case "error":
        onEvent({
          type: "error",
          message: (data as { message: string }).message
        });
        break;
    }
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    parser.feed(decoder.decode(value, { stream: true }));
  }

  parser.end();
}
