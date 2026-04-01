import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChatWidget } from "./ChatWidget";

function buildStreamResponse(chunks: string[]) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      }
    }),
    {
      status: 200,
      headers: {
        "content-type": "text/event-stream"
      }
    }
  );
}

describe("ChatWidget", () => {
  it("opens, sends a message, and renders streamed answer plus source links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        buildStreamResponse([
          'event: meta\ndata: {"conversationId":"conversation-1"}\n\n',
          'event: token\ndata: {"text":"Use the Conversation tab."}\n\n',
          'event: sources\ndata: {"items":[{"title":"About pull requests","url":"https://docs.github.com/pull-requests","quote":"The Conversation tab of a pull request displays a description of the changes."}]}\n\n',
          "event: done\ndata: {}\n\n"
        ])
      )
    );

    render(<ChatWidget />);

    await userEvent.click(screen.getByRole("button", { name: /ask github support/i }));
    await userEvent.type(screen.getByPlaceholderText(/ask about github docs/i), "How do pull requests work?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("Use the Conversation tab.")).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: /about pull requests/i })).toHaveAttribute(
      "href",
      "https://docs.github.com/pull-requests"
    );
  });

  it("toggles open and closed", async () => {
    render(<ChatWidget />);

    const toggle = screen.getByRole("button", { name: /ask github support/i });
    await userEvent.click(toggle);
    expect(screen.getByLabelText(/github support chat/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /close support/i }));
    expect(screen.queryByLabelText(/github support chat/i)).not.toBeInTheDocument();
  });

  it("shows a server error message in the transcript when the stream errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        buildStreamResponse([
          'event: meta\ndata: {"conversationId":"conversation-1"}\n\n',
          'event: error\ndata: {"message":"The server is missing OPENAI_API_KEY."}\n\n'
        ])
      )
    );

    render(<ChatWidget />);

    await userEvent.click(screen.getByRole("button", { name: /ask github support/i }));
    await userEvent.type(screen.getByPlaceholderText(/ask about github docs/i), "How do pull requests work?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/missing openai_api_key/i)).toHaveLength(2);
    });
  });
});
