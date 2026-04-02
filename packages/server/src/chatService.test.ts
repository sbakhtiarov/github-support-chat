import { describe, expect, it, vi } from "vitest";

import { ChatService } from "./chatService.js";
import { ConversationStore } from "./conversationStore.js";

describe("ChatService", () => {
  function createSubject() {
    const conversationStore = new ConversationStore(60_000, 10);
    const githubDocsMcpClient = {
      searchGithubDocs: vi.fn(),
      getGithubDocChunk: vi.fn()
    };
    const hubspotMcpClient = {
      createSupportTicket: vi.fn(),
      getSupportTicket: vi.fn(),
      listTicketPipelines: vi.fn(async () => [])
    };
    const openAiGateway = {
      analyzeIntent: vi.fn(),
      generateGroundedAnswer: vi.fn()
    };

    const chatService = new ChatService({
      conversationStore,
      githubDocsMcpClient: githubDocsMcpClient as never,
      hubspotMcpClient: hubspotMcpClient as never,
      openAiGateway: openAiGateway as never
    });

    return {
      chatService,
      conversationStore,
      githubDocsMcpClient,
      hubspotMcpClient,
      openAiGateway
    };
  }

  it("keeps the existing docs flow for GitHub documentation questions", async () => {
    const subject = createSubject();
    subject.openAiGateway.analyzeIntent.mockResolvedValue({
      intent: "docs_answer",
      subject: "",
      description: "",
      customerEmail: "",
      priority: "",
      ticketId: ""
    });
    subject.githubDocsMcpClient.searchGithubDocs.mockResolvedValue([
      {
        chunkId: "chunk-1",
        pageTitle: "About pull requests",
        sectionTitle: "Conversation",
        url: "https://docs.github.com/pull-requests",
        quote: "Pull requests have a Conversation tab."
      }
    ]);
    subject.githubDocsMcpClient.getGithubDocChunk.mockResolvedValue({
      chunkId: "chunk-1",
      repoPath: "content/pulls.md",
      pageTitle: "About pull requests",
      sectionTitle: "Conversation",
      canonicalUrl: "https://docs.github.com/pull-requests",
      rawMarkdown: "",
      plainText: "Pull requests have a Conversation tab."
    });
    subject.openAiGateway.generateGroundedAnswer.mockResolvedValue({
      answer: "Use the Conversation tab.",
      citations: [
        {
          quote: "Pull requests have a Conversation tab.",
          url: "https://docs.github.com/pull-requests"
        }
      ]
    });

    const result = await subject.chatService.generateReply("conversation-1", "How do pull requests work?");

    expect(result.text).toContain("Use the Conversation tab.");
    expect(result.sources).toHaveLength(1);
    expect(subject.githubDocsMcpClient.searchGithubDocs).toHaveBeenCalledWith(
      "How do pull requests work?",
      5
    );
  });

  it("asks for the customer email when ticket creation is missing required identity", async () => {
    const subject = createSubject();
    subject.openAiGateway.analyzeIntent.mockResolvedValue({
      intent: "create_ticket",
      subject: "Checkout failure",
      description: "Customer sees a 500 error during checkout.",
      customerEmail: "",
      priority: "HIGH",
      ticketId: ""
    });

    const result = await subject.chatService.generateReply(
      "conversation-1",
      "Create a support ticket for a checkout bug."
    );

    expect(result.text).toContain("customer's email address");
    expect(result.ticket).toMatchObject({
      mode: "draft",
      ticketId: "Pending creation",
      statusLabel: "Draft"
    });
    expect(subject.conversationStore.getPendingTicketDraft("conversation-1")).toEqual({
      subject: "Checkout failure",
      description: "Customer sees a 500 error during checkout.",
      priority: "HIGH"
    });
  });

  it("produces a confirmation-ready draft when all required ticket fields are present", async () => {
    const subject = createSubject();
    subject.openAiGateway.analyzeIntent.mockResolvedValue({
      intent: "create_ticket",
      subject: "Checkout failure",
      description: "Customer sees a 500 error during checkout.",
      customerEmail: "octo@example.com",
      priority: "HIGH",
      ticketId: ""
    });

    const result = await subject.chatService.generateReply(
      "conversation-1",
      "Create a high priority support ticket for octo@example.com about checkout failing."
    );

    expect(result.text).toContain('Reply "confirm"');
    expect(result.ticket).toMatchObject({
      mode: "draft",
      ticketId: "Pending creation",
      subject: "Checkout failure",
      customerEmail: "octo@example.com",
      priority: "HIGH",
      statusLabel: "Draft"
    });
  });

  it("creates the ticket only after explicit confirmation", async () => {
    const subject = createSubject();
    subject.openAiGateway.analyzeIntent.mockResolvedValueOnce({
      intent: "create_ticket",
      subject: "Checkout failure",
      description: "Customer sees a 500 error during checkout.",
      customerEmail: "octo@example.com",
      priority: "HIGH",
      ticketId: ""
    });
    subject.hubspotMcpClient.createSupportTicket.mockResolvedValue({
      id: "TICKET-42",
      subject: "Checkout failure",
      customerEmail: "octo@example.com",
      status: "NEW",
      priority: "HIGH"
    });

    await subject.chatService.generateReply(
      "conversation-1",
      "Create a high priority support ticket for octo@example.com about checkout failing."
    );
    const result = await subject.chatService.generateReply("conversation-1", "confirm");

    expect(subject.hubspotMcpClient.createSupportTicket).toHaveBeenCalledTimes(1);
    expect(result.ticket).toMatchObject({
      mode: "created",
      ticketId: "TICKET-42",
      statusLabel: "NEW"
    });
    expect(subject.conversationStore.getPendingTicketDraft("conversation-1")).toBeNull();
  });

  it("clears the pending draft when the user cancels", async () => {
    const subject = createSubject();
    subject.openAiGateway.analyzeIntent.mockResolvedValueOnce({
      intent: "create_ticket",
      subject: "Checkout failure",
      description: "Customer sees a 500 error during checkout.",
      customerEmail: "octo@example.com",
      priority: "HIGH",
      ticketId: ""
    });

    await subject.chatService.generateReply(
      "conversation-1",
      "Create a high priority support ticket for octo@example.com about checkout failing."
    );
    const result = await subject.chatService.generateReply("conversation-1", "cancel");

    expect(result.text).toContain("canceled");
    expect(subject.conversationStore.getPendingTicketDraft("conversation-1")).toBeNull();
  });

  it("asks for a ticket ID when checking status without one", async () => {
    const subject = createSubject();
    subject.openAiGateway.analyzeIntent.mockResolvedValue({
      intent: "get_ticket_status",
      subject: "",
      description: "",
      customerEmail: "",
      priority: "",
      ticketId: ""
    });

    const result = await subject.chatService.generateReply(
      "conversation-1",
      "Can you check my support ticket status?"
    );

    expect(result.text).toContain("share the ticket ID");
    expect(subject.hubspotMcpClient.getSupportTicket).not.toHaveBeenCalled();
  });

  it("returns a normalized status card when a ticket ID is provided", async () => {
    const subject = createSubject();
    subject.openAiGateway.analyzeIntent.mockResolvedValue({
      intent: "get_ticket_status",
      subject: "",
      description: "",
      customerEmail: "",
      priority: "",
      ticketId: "TICKET-42"
    });
    subject.hubspotMcpClient.getSupportTicket.mockResolvedValue({
      id: "TICKET-42",
      properties: {
        subject: "Checkout failure",
        hs_ticket_priority: "HIGH",
        hs_pipeline_stage: "Waiting on support"
      }
    });

    const result = await subject.chatService.generateReply(
      "conversation-1",
      "Check support ticket TICKET-42."
    );

    expect(result.text).toContain("TICKET-42");
    expect(result.ticket).toMatchObject({
      mode: "status",
      ticketId: "TICKET-42",
      subject: "Checkout failure",
      priority: "HIGH",
      statusLabel: "Waiting on support"
    });
  });

  it("normalizes nested HubSpot ticket payloads before falling back to placeholders", async () => {
    const subject = createSubject();
    subject.openAiGateway.analyzeIntent.mockResolvedValue({
      intent: "get_ticket_status",
      subject: "",
      description: "",
      customerEmail: "",
      priority: "",
      ticketId: "TICKET-88"
    });
    subject.hubspotMcpClient.getSupportTicket.mockResolvedValue({
      ticket: {
        id: 88,
        properties: {
          hs_ticket_subject: "Billing issue",
          hs_ticket_priority: "MEDIUM",
          hs_pipeline_stage: "2",
          hs_pipeline: "0"
        }
      }
    });
    subject.hubspotMcpClient.listTicketPipelines.mockResolvedValue([
      {
        id: "0",
        label: "Support Pipeline",
        stages: [
          {
            id: "1",
            label: "New"
          },
          {
            id: "2",
            label: "Waiting on customer"
          }
        ]
      }
    ]);

    const result = await subject.chatService.generateReply(
      "conversation-1",
      "Check support ticket TICKET-88."
    );

    expect(result.ticket).toMatchObject({
      mode: "status",
      ticketId: "88",
      subject: "Billing issue",
      priority: "MEDIUM",
      statusLabel: "Waiting on customer"
    });
  });
});
