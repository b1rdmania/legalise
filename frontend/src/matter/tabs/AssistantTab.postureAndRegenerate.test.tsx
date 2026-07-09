// Matter-posture and turn-management chrome: pause affordance, no-key
// header notice, and Regenerate.

import { describe, expect, it, vi } from "vitest";
import {
  api,
  fireEvent,
  matter,
  mountChat,
  registerAssistantTabHooks,
  screen,
  someDoc,
  waitFor,
  within,
} from "./AssistantTab.test-utils";
import type { AssistantMessage, Matter } from "./AssistantTab.test-utils";

registerAssistantTabHooks();

describe("AssistantTab — pause affordance in the header meta line", () => {
  it("shows Pause AI on an active matter and pauses via onPostureChange", async () => {
    const onPostureChange = vi.fn().mockResolvedValue(undefined);
    mountChat({ onPostureChange });

    const toggle = await screen.findByTestId("chat-pause-toggle");
    expect(toggle).toHaveTextContent("Pause AI");
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(onPostureChange).toHaveBeenCalledWith("C_paused");
    });
  });

  it("shows Resume AI on a paused matter and resumes to B_mixed", async () => {
    const onPostureChange = vi.fn().mockResolvedValue(undefined);
    mountChat({
      onPostureChange,
      matter: { ...matter, privilege_posture: "C_paused" } as Matter,
    });

    const toggle = await screen.findByTestId("chat-pause-toggle");
    expect(toggle).toHaveTextContent("Resume AI");
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(onPostureChange).toHaveBeenCalledWith("B_mixed");
    });
  });

  it("hides the action when no posture plumbing is provided (demo/read-only shells)", async () => {
    mountChat();
    await screen.findByTestId("docs-context-status");
    expect(screen.queryByTestId("chat-pause-toggle")).toBeNull();
  });
});

describe("AssistantTab — no-key header notice", () => {
  it("shows a passive notice when the matter's model needs a key the user lacks", async () => {
    vi.spyOn(api, "listApiKeys").mockResolvedValue([]);
    mountChat({
      matter: { ...matter, required_provider: "anthropic" } as Matter,
    });

    const notice = await screen.findByTestId("chat-no-key-notice");
    expect(notice).toHaveTextContent(/No Anthropic key yet/i);
    expect(within(notice).getByRole("link")).toHaveAttribute(
      "href",
      "/settings/keys",
    );
  });

  it("stays silent when the key is on file", async () => {
    vi.spyOn(api, "listApiKeys").mockResolvedValue([
      { provider: "anthropic", last_used_at: null, created_at: "2026-01-01" },
    ]);
    mountChat({
      matter: { ...matter, required_provider: "anthropic" } as Matter,
    });

    await screen.findByTestId("docs-context-status");
    await waitFor(() => expect(api.listApiKeys).toHaveBeenCalled());
    expect(screen.queryByTestId("chat-no-key-notice")).toBeNull();
  });

  it("does not fetch keys for keyless models", async () => {
    const spy = vi.spyOn(api, "listApiKeys").mockResolvedValue([]);
    mountChat();
    await screen.findByTestId("docs-context-status");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("AssistantTab — Regenerate", () => {
  const priorTurn: AssistantMessage[] = [
    {
      id: "u-1",
      role: "user",
      content: "When was Khan dismissed?",
      suggested_actions: [],
      created_at: "2026-07-07T09:00:00Z",
    },
    {
      id: "a-1",
      role: "assistant",
      content: "First answer.",
      suggested_actions: [],
      created_at: "2026-07-07T09:00:05Z",
    },
  ];

  it("resends the previous prompt as a new turn and keeps the earlier answer", async () => {
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* () {
        yield {
          event: "result",
          data: {
            user: {
              id: "u-2",
              role: "user",
              content: "When was Khan dismissed?",
              suggested_actions: [],
              created_at: "2026-07-07T09:01:00Z",
            },
            assistant: {
              id: "a-2",
              role: "assistant",
              content: "Second answer.",
              suggested_actions: [],
              created_at: "2026-07-07T09:01:05Z",
            },
          },
        } as never;
      },
    );
    mountChat({
      docs: [someDoc("doc-1", "note.txt")],
      initialMessages: priorTurn,
    });

    fireEvent.click(await screen.findByTestId("message-regenerate"));

    await waitFor(() =>
      expect(api.postAssistantMessageStream).toHaveBeenCalledWith(
        matter.slug,
        expect.objectContaining({ content: "When was Khan dismissed?" }),
        expect.any(AbortSignal),
      ),
    );
    // Append-only: the old answer stays in the transcript beside the new one.
    expect(await screen.findByText("Second answer.")).toBeInTheDocument();
    expect(screen.getByText("First answer.")).toBeInTheDocument();
  });

  it("renders only on the last assistant message and resends its prompt", async () => {
    mountChat({
      docs: [someDoc("doc-1", "note.txt")],
      initialMessages: [
        ...priorTurn,
        {
          id: "u-2",
          role: "user",
          content: "Draft a letter",
          suggested_actions: [],
          created_at: "2026-07-07T09:02:00Z",
        },
        {
          id: "a-2",
          role: "assistant",
          content: "Here is a letter.",
          suggested_actions: [],
          created_at: "2026-07-07T09:02:05Z",
        },
      ],
    });

    await screen.findByText("Here is a letter.");
    const actions = screen.getAllByTestId("message-regenerate");
    expect(actions).toHaveLength(1);

    fireEvent.click(actions[0]);
    await waitFor(() =>
      expect(api.postAssistantMessageStream).toHaveBeenCalledWith(
        matter.slug,
        expect.objectContaining({ content: "Draft a letter" }),
        expect.any(AbortSignal),
      ),
    );
  });

  it("hides Regenerate while a turn is in flight", async () => {
    let releaseResult!: () => void;
    const resultGate = new Promise<void>((resolve) => {
      releaseResult = resolve;
    });
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* () {
        await resultGate;
        yield {
          event: "result",
          data: {
            user: {
              id: "u-2",
              role: "user",
              content: "Another question",
              suggested_actions: [],
              created_at: "",
            },
            assistant: {
              id: "a-2",
              role: "assistant",
              content: "Another answer.",
              suggested_actions: [],
              created_at: "",
            },
          },
        } as never;
      },
    );
    mountChat({
      docs: [someDoc("doc-1", "note.txt")],
      initialMessages: priorTurn,
    });

    expect(await screen.findByTestId("message-regenerate")).toBeInTheDocument();

    const input = screen.getByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "Another question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(screen.queryByTestId("message-regenerate")).toBeNull(),
    );

    releaseResult();
    await screen.findByText("Another answer.");
    expect(screen.getAllByTestId("message-regenerate")).toHaveLength(1);
  });
});
