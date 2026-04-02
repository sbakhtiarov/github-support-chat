import { describe, expect, it, vi } from "vitest";

import { HubspotMcpClient } from "./hubspotMcpClient.js";

describe("HubspotMcpClient", () => {
  it("calls create_support_ticket with the provided payload", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));

      if (body.method === "tools/call") {
        expect(body.params.name).toBe("create_support_ticket");
        expect(body.params.arguments).toEqual({
          customerEmail: "octo@example.com",
          subject: "Checkout failure",
          description: "Customer sees a 500 error during checkout.",
          priority: "HIGH"
        });
      }

      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  id: "TICKET-42",
                  subject: "Checkout failure"
                })
              }
            ]
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    });

    const client = new HubspotMcpClient("http://localhost:3100/mcp", fetchMock as typeof fetch);
    const result = await client.createSupportTicket({
      customerEmail: "octo@example.com",
      subject: "Checkout failure",
      description: "Customer sees a 500 error during checkout.",
      priority: "HIGH"
    });

    expect(result).toEqual({
      id: "TICKET-42",
      subject: "Checkout failure"
    });
  });

  it("reports auth failures in health checks when the server is reachable", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));

      if (body.method === "tools/list") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
              tools: []
            }
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: "The OAuth token used to make this call expired 1 day ago."
              }
            ]
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    });

    const client = new HubspotMcpClient("http://localhost:3100/mcp", fetchMock as typeof fetch);
    const health = await client.getHealth();

    expect(health).toEqual({
      reachable: true,
      ok: false,
      error: "The OAuth token used to make this call expired 1 day ago."
    });
  });

  it("parses list_ticket_pipelines responses", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: true,
                  pipelines: [
                    {
                      id: "0",
                      label: "Support Pipeline",
                      stages: [
                        {
                          id: "1",
                          label: "New",
                          ticketState: "OPEN"
                        }
                      ]
                    }
                  ]
                })
              }
            ]
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    );

    const client = new HubspotMcpClient("http://localhost:3100/mcp", fetchMock as typeof fetch);
    const pipelines = await client.listTicketPipelines();

    expect(pipelines).toEqual([
      {
        id: "0",
        label: "Support Pipeline",
        stages: [
          {
            id: "1",
            label: "New",
            ticketState: "OPEN"
          }
        ]
      }
    ]);
  });
});
