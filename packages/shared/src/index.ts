export interface ChatRequest {
  conversationId: string;
  message: string;
}

export interface SourceItem {
  title: string;
  url: string;
  quote: string;
}

export interface HealthResponse {
  ok: boolean;
  mcpReachable: boolean;
  openAiConfigured: boolean;
}

export type ChatStreamEvent =
  | { type: "meta"; conversationId: string }
  | { type: "token"; text: string }
  | { type: "sources"; items: SourceItem[] }
  | { type: "done" }
  | { type: "error"; message: string };

export interface ParsedSseEvent {
  event: string;
  data: string;
}

export function encodeSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createSseEventParser(onEvent: (event: ParsedSseEvent) => void) {
  let buffer = "";

  const flushBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    let event = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim() || "message";
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length > 0) {
      onEvent({ event, data: dataLines.join("\n") });
    }
  };

  return {
    feed(chunk: string) {
      buffer += chunk;

      while (true) {
        const boundary = buffer.search(/\r?\n\r?\n/);
        if (boundary === -1) {
          break;
        }

        const block = buffer.slice(0, boundary);
        const separatorLength = buffer[boundary] === "\r" ? 4 : 2;
        buffer = buffer.slice(boundary + separatorLength);

        if (block.trim().length > 0) {
          flushBlock(block);
        }
      }
    },
    end() {
      if (buffer.trim().length > 0) {
        flushBlock(buffer);
      }
      buffer = "";
    }
  };
}
