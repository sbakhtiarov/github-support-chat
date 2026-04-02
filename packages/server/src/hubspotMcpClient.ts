import type { DependencyHealth } from "@github-support-chat/shared";

import { McpRpcClient, getTextToolContent, parseToolTextContent } from "./mcpRpcClient.js";

export interface CreateSupportTicketInput {
  customerEmail: string;
  subject: string;
  description: string;
  priority?: string;
}

export interface HubspotTicketPipelineStage {
  id: string;
  label: string;
  ticketState?: string;
}

export interface HubspotTicketPipeline {
  id: string;
  label: string;
  archived?: boolean;
  stages: HubspotTicketPipelineStage[];
}

export class HubspotMcpClient {
  private readonly rpcClient: McpRpcClient;

  constructor(
    private readonly url: string,
    fetchFn: typeof fetch = fetch
  ) {
    this.rpcClient = new McpRpcClient(url, fetchFn);
  }

  async getHealth(): Promise<DependencyHealth> {
    try {
      await this.rpcClient.listTools();
    } catch (error) {
      return {
        reachable: false,
        ok: false,
        error: error instanceof Error ? error.message : "HubSpot MCP is unreachable."
      };
    }

    try {
      await this.rpcClient.callTool("list_ticket_pipelines", {});
      return {
        reachable: true,
        ok: true
      };
    } catch (error) {
      return {
        reachable: true,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "HubSpot MCP responded with an unexpected error."
      };
    }
  }

  async createSupportTicket(input: CreateSupportTicketInput) {
    const result = await this.rpcClient.callTool("create_support_ticket", input);
    return parseToolTextContent(getTextToolContent(result));
  }

  async getSupportTicket(ticketId: string) {
    const result = await this.rpcClient.callTool("get_support_ticket", { ticketId });
    return parseToolTextContent(getTextToolContent(result));
  }

  async listTicketPipelines(): Promise<HubspotTicketPipeline[]> {
    const result = await this.rpcClient.callTool("list_ticket_pipelines", {});
    const parsed = parseToolTextContent(getTextToolContent(result));

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "pipelines" in parsed &&
      Array.isArray((parsed as { pipelines?: unknown[] }).pipelines)
    ) {
      return (parsed as { pipelines: HubspotTicketPipeline[] }).pipelines;
    }

    return [];
  }
}
