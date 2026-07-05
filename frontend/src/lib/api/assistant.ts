// Matter assistant: messages + SSE streaming.
// Moved verbatim from `lib/api.ts` (Fluff C1 / audit M2.1).

import { API, apiFetch, jsonOrThrow } from "./_core";

export interface SuggestedAction {
  type: "view_document" | "view_audit" | "view_chronology"
      | "anonymise_document" | "view_signed_output";
  label: string;
  params: Record<string, string>;
}

// A retrieved passage the assistant relied on for an answer. Char offsets
// index into the document's extracted-text body so the reader can locate
// and highlight the exact slice for review before sign-off.
export interface AssistantSource {
  document_id: string;
  title: string;
  snippet: string;
  char_start: number;
  char_end: number;
  score: number;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggested_actions: SuggestedAction[];
  // Passages retrieved for this reply (assistant messages only). Optional:
  // older backends and user messages omit it.
  sources?: AssistantSource[];
  model_used?: string | null;
  created_at: string;
}

export type AssistantPostResponse = {
  user: AssistantMessage;
  assistant: AssistantMessage;
  // The thread this turn landed in. Present when the server created a new
  // thread for a turn that omitted thread_id.
  thread_id?: string | null;
};

// A named conversation within a matter. A matter can hold several.
export interface AssistantThread {
  id: string;
  title: string | null;
  created_at: string;
  message_count: number;
  last_message_at: string | null;
}

export type AssistantStreamEvent =
  | { event: "turn.start"; data: { slug: string } }
  | {
      event: "context.loaded";
      data: {
        history_message_count: number;
        chronology_event_count: number;
        document_count: number;
        tool_count: number;
        // Matter-wide retrieval (Wave 1-3). Optional: older backends omit them.
        retrieved_document_count?: number;
        retrieved_chunk_count?: number;
      };
    }
  | { event: "turn.accepted"; data: { user_message_id: string } }
  | { event: "turn.deterministic"; data: { assistant_message_id: string; kind: string } }
  | { event: "model.start"; data: { stage: string } }
  // A token-streamed slice of the answer being written. Only emitted for
  // providers that stream; the final `result` message stays authoritative.
  | { event: "model.delta"; data: { text: string } }
  | { event: "tool.start"; data: { module_id: string; capability_id: string } }
  | {
      event: "tool.end";
      data: { module_id: string; capability_id: string; invocation_id: string };
    }
  | {
      event: "tool.error";
      data: { module_id: string; capability_id: string; message: string };
    }
  | {
      event: "turn.end";
      data: {
        assistant_message_id: string;
        tool_invocation_id: string | null;
        tool_failed: boolean;
      };
    }
  | { event: "result"; data: AssistantPostResponse }
  | { event: "error"; data: { message: string; code?: number } };

export const listAssistantMessages = (slug: string) =>
  apiFetch(`${API}/matters/${slug}/assistant/messages`)
    .then((r) => jsonOrThrow<AssistantMessage[]>(r));

// Threads on a matter, most-recently-active first.
export const listThreads = (slug: string) =>
  apiFetch(`${API}/matters/${slug}/assistant/threads`)
    .then((r) => jsonOrThrow<AssistantThread[]>(r));

export const createThread = (slug: string, title?: string) =>
  apiFetch(`${API}/matters/${slug}/assistant/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title ?? null }),
  }).then((r) => jsonOrThrow<AssistantThread>(r));

export const getThreadMessages = (slug: string, threadId: string) =>
  apiFetch(`${API}/matters/${slug}/assistant/threads/${threadId}/messages`)
    .then((r) => jsonOrThrow<AssistantMessage[]>(r));

export const postAssistantMessage = (
  slug: string,
  body: { content: string; selected_document_ids?: string[]; thread_id?: string },
) =>
  apiFetch(`${API}/matters/${slug}/assistant/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<AssistantPostResponse>(r));

// Save an assistant reply as a draft output — a `chat_draft` matter
// artifact carrying the message's content + provenance (source message
// id, model, hashes, retrieval sources). Idempotent per message: saving
// the same reply again returns the existing draft.
export interface AssistantDraftSaveResponse {
  artifact_id: string;
  kind: string;
  already_existed: boolean;
}

export const saveMessageAsDraft = (slug: string, messageId: string) =>
  apiFetch(
    `${API}/matters/${encodeURIComponent(slug)}/assistant/messages/${encodeURIComponent(messageId)}/save-draft`,
    { method: "POST" },
  ).then((r) => jsonOrThrow<AssistantDraftSaveResponse>(r));

export async function* postAssistantMessageStream(
  slug: string,
  body: { content: string; selected_document_ids?: string[]; thread_id?: string },
  signal?: AbortSignal,
): AsyncIterableIterator<AssistantStreamEvent> {
  const resp = await apiFetch(`${API}/matters/${slug}/assistant/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const data = JSON.parse(dataLines.join("\n"));
      yield { event, data } as AssistantStreamEvent;
    }
  }
}
