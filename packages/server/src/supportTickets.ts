import type { SupportTicketCard } from "@github-support-chat/shared";
import type { HubspotTicketPipeline } from "./hubspotMcpClient.js";

export type SupportTicketPriority = "LOW" | "MEDIUM" | "HIGH";

export interface PendingSupportTicketDraft {
  subject?: string;
  description?: string;
  customerEmail?: string;
  priority?: SupportTicketPriority;
}

interface ReadySupportTicketDraft extends PendingSupportTicketDraft {
  subject: string;
  description: string;
  customerEmail: string;
  priority: SupportTicketPriority;
}

type PendingTicketField = "subject" | "description" | "customerEmail";

const DEFAULT_PRIORITY: SupportTicketPriority = "MEDIUM";
const DRAFT_TICKET_ID = "Pending creation";
const CREATED_TICKET_ID = "Assigned by HubSpot";
const STATUS_TICKET_ID = "Unavailable";
const DRAFT_STATUS = "Draft";
const CREATED_STATUS = "Created";
const STATUS_UNAVAILABLE = "Unavailable";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, value);
}

function readString(value: unknown, paths: string[]) {
  for (const path of paths) {
    const candidate = readPath(value, path);
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }

    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }

  return undefined;
}

export function normalizePriority(value?: string): SupportTicketPriority | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH") {
    return normalized;
  }

  return undefined;
}

export function mergePendingTicketDraft(
  current: PendingSupportTicketDraft | null,
  update: PendingSupportTicketDraft
): PendingSupportTicketDraft {
  return {
    subject: update.subject?.trim() || current?.subject,
    description: update.description?.trim() || current?.description,
    customerEmail: update.customerEmail?.trim() || current?.customerEmail,
    priority: normalizePriority(update.priority) ?? current?.priority ?? DEFAULT_PRIORITY
  };
}

export function getPendingTicketMissingFields(
  draft: PendingSupportTicketDraft
): PendingTicketField[] {
  const missing: PendingTicketField[] = [];

  if (!draft.subject?.trim()) {
    missing.push("subject");
  }

  if (!draft.description?.trim()) {
    missing.push("description");
  }

  if (!draft.customerEmail?.trim()) {
    missing.push("customerEmail");
  }

  return missing;
}

export function isPendingTicketReady(
  draft: PendingSupportTicketDraft
): draft is ReadySupportTicketDraft {
  return getPendingTicketMissingFields(draft).length === 0;
}

export function summarizeDescription(description: string) {
  const trimmed = description.trim();
  if (trimmed.length <= 180) {
    return trimmed;
  }

  return `${trimmed.slice(0, 177).trimEnd()}...`;
}

export function buildTicketCard(
  mode: SupportTicketCard["mode"],
  draft: PendingSupportTicketDraft,
  options?: {
    ticketId?: string;
    statusLabel?: string;
    nextStepMessage?: string;
  }
): SupportTicketCard {
  const defaultTicketId = mode === "draft" ? DRAFT_TICKET_ID : CREATED_TICKET_ID;
  const defaultStatusLabel = mode === "draft" ? DRAFT_STATUS : CREATED_STATUS;

  return {
    mode,
    ticketId: options?.ticketId ?? defaultTicketId,
    subject: draft.subject?.trim() || "Support request",
    customerEmail: draft.customerEmail?.trim(),
    priority: draft.priority ?? DEFAULT_PRIORITY,
    statusLabel: options?.statusLabel ?? defaultStatusLabel,
    descriptionPreview: draft.description?.trim()
      ? summarizeDescription(draft.description)
      : undefined,
    nextStepMessage: options?.nextStepMessage
  };
}

export function normalizeHubspotTicketCard(
  mode: Extract<SupportTicketCard["mode"], "created" | "status">,
  rawTicket: unknown,
  fallback: PendingSupportTicketDraft,
  resolvedStatusLabel?: string,
  nextStepMessage?: string
): SupportTicketCard {
  const ticketId = readString(rawTicket, [
    "ticketId",
    "id",
    "ticketId.value",
    "ticket.id",
    "ticket.ticketId",
    "ticket.properties.hs_object_id",
    "ticket.properties.hs_ticket_id",
    "data.id",
    "data.ticketId",
    "data.ticket.id",
    "data.properties.hs_object_id",
    "data.properties.hs_ticket_id",
    "result.ticket.id",
    "result.ticket.ticketId",
    "result.ticket.properties.hs_object_id",
    "result.data.id",
    "result.data.ticketId",
    "properties.hs_object_id",
    "properties.hs_ticket_id",
    "results.0.id",
    "results.0.ticketId",
    "results.0.properties.hs_object_id",
    "tickets.0.id",
    "tickets.0.ticketId",
    "tickets.0.properties.hs_object_id",
    "result.ticketId",
    "result.id"
  ]);
  const subject = readString(rawTicket, [
    "subject",
    "title",
    "ticket.subject",
    "ticket.title",
    "ticket.properties.subject",
    "ticket.properties.hs_ticket_subject",
    "data.subject",
    "data.title",
    "data.ticket.subject",
    "data.properties.subject",
    "data.properties.hs_ticket_subject",
    "result.ticket.subject",
    "result.ticket.title",
    "result.ticket.properties.subject",
    "result.ticket.properties.hs_ticket_subject",
    "result.data.subject",
    "properties.subject",
    "properties.hs_ticket_subject",
    "results.0.subject",
    "results.0.properties.subject",
    "tickets.0.subject",
    "tickets.0.properties.subject",
    "result.subject"
  ]);
  const customerEmail = readString(rawTicket, [
    "customerEmail",
    "email",
    "contact.email",
    "ticket.customerEmail",
    "ticket.email",
    "ticket.contact.email",
    "ticket.properties.customerEmail",
    "ticket.properties.customer_email",
    "data.customerEmail",
    "data.email",
    "data.contact.email",
    "data.ticket.customerEmail",
    "data.ticket.contact.email",
    "data.properties.customerEmail",
    "data.properties.customer_email",
    "result.ticket.customerEmail",
    "result.ticket.email",
    "result.ticket.contact.email",
    "result.ticket.properties.customerEmail",
    "result.ticket.properties.customer_email",
    "result.data.customerEmail",
    "properties.customerEmail",
    "properties.customer_email"
  ]);
  const priority = normalizePriority(
    readString(rawTicket, [
      "priority",
      "ticket.priority",
      "ticket.properties.priority",
      "ticket.properties.hs_ticket_priority",
      "data.priority",
      "data.ticket.priority",
      "data.properties.priority",
      "data.properties.hs_ticket_priority",
      "result.ticket.priority",
      "result.ticket.properties.priority",
      "result.ticket.properties.hs_ticket_priority",
      "result.data.priority",
      "properties.priority",
      "properties.hs_ticket_priority",
      "results.0.priority",
      "results.0.properties.hs_ticket_priority",
      "tickets.0.priority",
      "tickets.0.properties.hs_ticket_priority",
      "result.priority"
    ])
  );
  const statusLabel = readString(rawTicket, [
    "status",
    "statusLabel",
    "stageLabel",
    "pipelineStageLabel",
    "ticket.status",
    "ticket.statusLabel",
    "ticket.stageLabel",
    "ticket.pipelineStageLabel",
    "ticket.properties.status",
    "ticket.properties.hs_pipeline_stage",
    "ticket.properties.hs_pipeline_stage_label",
    "ticket.properties.hs_ticket_status",
    "ticket.properties.ticket_status",
    "data.status",
    "data.statusLabel",
    "data.ticket.status",
    "data.ticket.statusLabel",
    "data.properties.status",
    "data.properties.hs_pipeline_stage",
    "data.properties.hs_pipeline_stage_label",
    "data.properties.hs_ticket_status",
    "result.ticket.status",
    "result.ticket.statusLabel",
    "result.ticket.stageLabel",
    "result.ticket.pipelineStageLabel",
    "result.ticket.properties.status",
    "result.ticket.properties.hs_pipeline_stage",
    "result.ticket.properties.hs_pipeline_stage_label",
    "result.ticket.properties.hs_ticket_status",
    "result.data.status",
    "properties.status",
    "properties.hs_pipeline_stage",
    "properties.hs_pipeline_stage_label",
    "properties.hs_ticket_status",
    "properties.ticket_status",
    "results.0.status",
    "results.0.statusLabel",
    "results.0.properties.hs_pipeline_stage",
    "tickets.0.status",
    "tickets.0.statusLabel",
    "tickets.0.properties.hs_pipeline_stage",
    "result.status"
  ]);
  const description = readString(rawTicket, [
    "description",
    "content",
    "ticket.description",
    "ticket.content",
    "ticket.properties.description",
    "ticket.properties.content",
    "ticket.properties.subject",
    "data.description",
    "data.content",
    "data.ticket.description",
    "data.ticket.content",
    "data.properties.description",
    "data.properties.content",
    "result.ticket.description",
    "result.ticket.content",
    "result.ticket.properties.description",
    "result.ticket.properties.content",
    "result.data.description",
    "properties.description",
    "properties.content",
    "results.0.description",
    "results.0.content",
    "tickets.0.description",
    "tickets.0.content",
    "result.description"
  ]);

  return {
    mode,
    ticketId:
      ticketId ??
      (mode === "created" ? CREATED_TICKET_ID : STATUS_TICKET_ID),
    subject: subject ?? fallback.subject?.trim() ?? "Support request",
    customerEmail: customerEmail ?? fallback.customerEmail?.trim(),
    priority: priority ?? fallback.priority ?? DEFAULT_PRIORITY,
    statusLabel:
      resolvedStatusLabel ??
      statusLabel ??
      (mode === "created" ? CREATED_STATUS : STATUS_UNAVAILABLE),
    descriptionPreview: description
      ? summarizeDescription(description)
      : fallback.description?.trim()
        ? summarizeDescription(fallback.description)
        : undefined,
    nextStepMessage
  };
}

export function formatMissingTicketFieldsMessage(missingFields: PendingTicketField[]) {
  if (missingFields.length === 1 && missingFields[0] === "customerEmail") {
    return "I can draft that support ticket. I still need the customer's email address before I can prepare it.";
  }

  const labels = missingFields.map((field) => {
    if (field === "customerEmail") {
      return "customer email";
    }

    return field;
  });

  return `I can draft that support ticket. I still need the ${labels.join(
    ", "
  )} before I can prepare it.`;
}

export function formatDraftConfirmationMessage() {
  return 'I drafted the support ticket. Reply "confirm" to create it in HubSpot, or send changes and I will update the draft.';
}

export function formatCreatedTicketMessage(ticket: SupportTicketCard) {
  const idText = ticket.ticketId ? ` ${ticket.ticketId}` : "";
  return `I created support ticket${idText} in HubSpot.`;
}

export function formatStatusTicketMessage(ticket: SupportTicketCard) {
  const idText = ticket.ticketId ? ` ${ticket.ticketId}` : "";
  const statusText = ticket.statusLabel ? ` It is currently ${ticket.statusLabel}.` : "";
  return `Here is the current status for support ticket${idText}.${statusText}`.trim();
}

export function isTicketPlaceholderValue(value: string) {
  return [DRAFT_TICKET_ID, CREATED_TICKET_ID, STATUS_TICKET_ID, DRAFT_STATUS, CREATED_STATUS, STATUS_UNAVAILABLE].includes(
    value
  );
}

export function resolveTicketStageLabel(
  rawTicket: unknown,
  pipelines: HubspotTicketPipeline[]
) {
  const pipelineId = readString(rawTicket, [
    "pipelineId",
    "ticket.pipelineId",
    "ticket.properties.pipelineId",
    "ticket.properties.hs_pipeline",
    "data.pipelineId",
    "data.ticket.pipelineId",
    "data.properties.hs_pipeline",
    "result.ticket.pipelineId",
    "result.ticket.properties.hs_pipeline",
    "properties.pipelineId",
    "properties.hs_pipeline",
    "result.pipelineId"
  ]);
  const stageId = readString(rawTicket, [
    "stageId",
    "ticket.stageId",
    "ticket.properties.stageId",
    "ticket.properties.hs_pipeline_stage",
    "data.stageId",
    "data.ticket.stageId",
    "data.properties.hs_pipeline_stage",
    "result.ticket.stageId",
    "result.ticket.properties.hs_pipeline_stage",
    "properties.stageId",
    "properties.hs_pipeline_stage",
    "result.stageId"
  ]);

  if (!stageId) {
    return undefined;
  }

  const candidatePipelines =
    pipelineId && pipelines.some((pipeline) => pipeline.id === pipelineId)
      ? pipelines.filter((pipeline) => pipeline.id === pipelineId)
      : pipelines;

  for (const pipeline of candidatePipelines) {
    const matchingStage = pipeline.stages.find((stage) => stage.id === stageId);
    if (matchingStage?.label) {
      return matchingStage.label;
    }
  }

  return undefined;
}
