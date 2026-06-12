// Matter assistant: messages + SSE streaming.
// Moved verbatim from `lib/api.ts` (Fluff C1 / audit M2.1).

import { API, apiFetch, jsonOrThrow } from "./_core";

export interface SuggestedAction {
  type: "view_document" | "view_audit" | "view_chronology"
      | "anonymise_document";
  label: string;
  params: Record<string, string>;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggested_actions: SuggestedAction[];
  model_used?: string | null;
  created_at: string;
}

export type AssistantPostResponse = {
  user: AssistantMessage;
  assistant: AssistantMessage;
};

export type AssistantStreamEvent =
  | { event: "turn.start"; data: { slug: string } }
  | {
      event: "context.loaded";
      data: {
        history_message_count: number;
        chronology_event_count: number;
        document_count: number;
        tool_count: number;
      };
    }
  | { event: "turn.accepted"; data: { user_message_id: string } }
  | { event: "turn.deterministic"; data: { assistant_message_id: string; kind: string } }
  | { event: "model.start"; data: { stage: string } }
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

export const postAssistantMessage = (slug: string, body: { content: string; selected_document_ids?: string[] }) =>
  apiFetch(`${API}/matters/${slug}/assistant/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<AssistantPostResponse>(r));

export async function* postAssistantMessageStream(
  slug: string,
  body: { content: string; selected_document_ids?: string[] },
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
