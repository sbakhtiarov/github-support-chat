import { useState } from "react";
import ReactMarkdown from "react-markdown";

import type { SourceItem } from "@github-support-chat/shared";

import { streamChatResponse } from "../lib/chatApi";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceItem[];
  streaming?: boolean;
}

const STORAGE_KEY = "github-support-chat-conversation-id";

function getConversationId() {
  const existing = sessionStorage.getItem(STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const nextId = crypto.randomUUID();
  sessionStorage.setItem(STORAGE_KEY, nextId);
  return nextId;
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSubmittedMessage, setLastSubmittedMessage] = useState<string | null>(null);
  const [conversationId] = useState(() => getConversationId());

  const submitMessage = async (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message || isPending) {
      return;
    }

    setError(null);
    setInput("");
    setLastSubmittedMessage(message);

    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        sources: []
      },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        sources: [],
        streaming: true
      }
    ]);

    setIsPending(true);

    try {
      await streamChatResponse(
        {
          conversationId,
          message
        },
        (event) => {
          if (event.type === "token") {
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantId
                  ? { ...item, content: item.content + event.text }
                  : item
              )
            );
          }

          if (event.type === "sources") {
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantId
                  ? { ...item, sources: event.items }
                  : item
              )
            );
          }

          if (event.type === "error") {
            setError(event.message);
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantId && item.content.length === 0
                  ? {
                      ...item,
                      content: event.message,
                      streaming: false
                    }
                  : item
              )
            );
          }

          if (event.type === "done") {
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantId
                  ? { ...item, streaming: false }
                  : item
              )
            );
          }
        }
      );
    } catch (streamError) {
      setError(
        streamError instanceof Error
          ? streamError.message
          : "Network error while contacting the chat service."
      );
    } finally {
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? { ...item, streaming: false }
            : item
        )
      );
      setIsPending(false);
    }
  };

  return (
    <>
      <button
        className="launcher-button"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? "Close support" : "Ask GitHub support"}
      </button>

      {isOpen ? (
        <section className="chat-widget" aria-label="GitHub support chat">
          <header className="chat-header">
            <div>
              <p className="chat-kicker">Grounded by docs</p>
              <h2>GitHub support chat</h2>
            </div>
          </header>

          <div className="chat-body">
            {messages.length === 0 ? (
              <div className="empty-state">
                <p>Ask a question about GitHub documentation.</p>
                <p>
                  Example: How do pull requests work, or how do GitHub Actions
                  workflow triggers behave?
                </p>
              </div>
            ) : null}

            {messages.map((message) => (
              <article
                key={message.id}
                className={`message-bubble message-${message.role}`}
              >
                {message.role === "assistant" ? (
                  <ReactMarkdown>{message.content || "Thinking..."}</ReactMarkdown>
                ) : (
                  <p>{message.content}</p>
                )}

                {message.role === "assistant" && message.sources.length > 0 ? (
                  <div className="source-list">
                    <p>Sources</p>
                    <ul>
                      {message.sources.map((source) => (
                        <li key={`${source.url}-${source.quote}`}>
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {source.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          {error ? (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              {lastSubmittedMessage ? (
                <button
                  type="button"
                  onClick={() => void submitMessage(lastSubmittedMessage)}
                  disabled={isPending}
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          <form
            className="chat-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitMessage(input);
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about GitHub docs..."
              rows={3}
              disabled={isPending}
            />
            <button type="submit" disabled={isPending || input.trim().length === 0}>
              {isPending ? "Answering..." : "Send"}
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
