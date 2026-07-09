// Message-composition/streaming lifecycle: composer send keys, failed send,
// token-streamed draft, Stop mid-stream, and the long-wait honesty line.

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

registerAssistantTabHooks();

describe("AssistantTab — composer send keys", () => {
  it("sends on Enter and keeps Shift+Enter as newline", async () => {
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "First line" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(api.postAssistantMessageStream).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(api.postAssistantMessageStream).toHaveBeenCalledWith(
        matter.slug,
        expect.objectContaining({ content: "First line" }),
        expect.any(AbortSignal),
      ),
    );
  });

  it("still sends on Cmd/Ctrl+Enter", async () => {
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "Meta send" } });
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    await waitFor(() =>
      expect(api.postAssistantMessageStream).toHaveBeenCalledWith(
        matter.slug,
        expect.objectContaining({ content: "Meta send" }),
        expect.any(AbortSignal),
      ),
    );
  });
});

describe("AssistantTab — failed send", () => {
  it("restores the typed prompt into the composer on error", async () => {
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      // eslint-disable-next-line require-yield
      async function* () {
        throw new Error("boom");
      },
    );
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "Do not lose me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/Could not send message/i)).toBeInTheDocument();
    // The prompt is back in the composer — a failed send never eats the text.
    expect(input).toHaveValue("Do not lose me");
  });
});

describe("AssistantTab — token-streamed draft", () => {
  it("renders deltas in a draft bubble, then the final message replaces it", async () => {
    let releaseResult!: () => void;
    const resultGate = new Promise<void>((resolve) => {
      releaseResult = resolve;
    });
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* () {
        yield { event: "model.start", data: { stage: "assistant" } } as never;
        yield { event: "model.delta", data: { text: "Khan was " } } as never;
        yield { event: "model.delta", data: { text: "dismissed." } } as never;
        await resultGate;
        yield {
          event: "result",
          data: {
            user: {
              id: "u-1",
              role: "user",
              content: "When was Khan dismissed?",
              suggested_actions: [],
              created_at: "",
            },
            assistant: {
              id: "a-1",
              role: "assistant",
              content: "Khan was dismissed.",
              suggested_actions: [],
              created_at: "",
            },
          },
        } as never;
      },
    );
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "When was Khan dismissed?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const bubble = await screen.findByTestId("chat-draft-bubble");
    expect(bubble).toHaveTextContent("Khan was dismissed.");
    // Draft is plain text with no per-message actions — those belong to
    // the final message only.
    expect(within(bubble).queryByTestId("message-actions")).toBeNull();
    // Streaming is visible progress, so the honesty line stays hidden.
    expect(screen.queryByTestId("chat-long-wait-note")).toBeNull();

    releaseResult();
    await waitFor(() =>
      expect(screen.queryByTestId("chat-draft-bubble")).toBeNull(),
    );
    expect(await screen.findByText("Khan was dismissed.")).toBeInTheDocument();
    expect(await screen.findByTestId("message-actions")).toBeInTheDocument();
  });

  it("resets the draft when a tool turn starts a second model call", async () => {
    let releaseResult!: () => void;
    const resultGate = new Promise<void>((resolve) => {
      releaseResult = resolve;
    });
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* () {
        yield { event: "model.start", data: { stage: "assistant" } } as never;
        yield { event: "model.delta", data: { text: "I'll run the tool." } } as never;
        yield {
          event: "model.start",
          data: { stage: "assistant.final" },
        } as never;
        yield { event: "model.delta", data: { text: "Final answer." } } as never;
        await resultGate;
        yield {
          event: "result",
          data: {
            user: {
              id: "u-1",
              role: "user",
              content: "Run it",
              suggested_actions: [],
              created_at: "",
            },
            assistant: {
              id: "a-1",
              role: "assistant",
              content: "Final answer.",
              suggested_actions: [],
              created_at: "",
            },
          },
        } as never;
      },
    );
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "Run it" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const bubble = await screen.findByTestId("chat-draft-bubble");
    await waitFor(() => expect(bubble).toHaveTextContent("Final answer."));
    expect(bubble).not.toHaveTextContent(/I'll run the tool\./);

    releaseResult();
    await waitFor(() =>
      expect(screen.queryByTestId("chat-draft-bubble")).toBeNull(),
    );
  });

  it("discards a partial draft and restores the prompt when the stream fails", async () => {
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* () {
        yield { event: "model.start", data: { stage: "assistant" } } as never;
        yield { event: "model.delta", data: { text: "Half an ans" } } as never;
        yield {
          event: "error",
          data: { message: "provider fell over" },
        } as never;
      },
    );
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "Do not lose me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/Could not send message/i)).toBeInTheDocument();
    expect(screen.queryByTestId("chat-draft-bubble")).toBeNull();
    expect(screen.queryByText("Half an ans")).toBeNull();
    expect(input).toHaveValue("Do not lose me");
  });
});

describe("AssistantTab — long-wait honesty line", () => {
  it("does not show the note for a fast turn", async () => {
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
              id: "u-1",
              role: "user",
              content: "Slow question",
              suggested_actions: [],
              created_at: "",
            },
            assistant: {
              id: "a-1",
              role: "assistant",
              content: "Slow answer",
              suggested_actions: [],
              created_at: "",
            },
          },
        } as never;
      },
    );
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "Slow question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // The ticker appears immediately; the honesty line waits for the timer.
    expect(await screen.findByText("Working...")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-long-wait-note")).toBeNull();

    releaseResult();
    expect(await screen.findByText("Slow answer")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-long-wait-note")).toBeNull();
  });
});

// WI-1 (2026-07-06): chat turn control. Stop is client-side only — the
// stream endpoint runs the turn in a detached task, so aborting the fetch
// never cancels the turn; the persisted reply lands on the record and the
// thread refresh swaps it in. Regenerate resends the last prompt as a
// brand-new turn; the earlier answer stays (append-only record).
describe("AssistantTab — Stop mid-stream", () => {
  const heldStream = (onSignal?: (signal: AbortSignal | undefined) => void) =>
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* (_slug, _body, signal) {
        onSignal?.(signal);
        yield {
          event: "turn.start",
          data: { slug: matter.slug, thread_id: "t-1" },
        } as never;
        yield { event: "model.start", data: { stage: "assistant" } } as never;
        yield { event: "model.delta", data: { text: "Khan was dis" } } as never;
        // Hold the stream open until the client aborts, then fail the
        // read the way fetch does.
        await new Promise<never>((_, reject) => {
          const fail = () =>
            reject(new DOMException("The operation was aborted.", "AbortError"));
          if (signal?.aborted) fail();
          else signal?.addEventListener("abort", fail);
        });
      },
    );

  it(
    "aborts the fetch, freezes the draft with a stopped line, then swaps in the persisted turn",
    async () => {
      let capturedSignal: AbortSignal | undefined;
      heldStream((signal) => {
        capturedSignal = signal;
      });
      vi.spyOn(api, "getThreadMessages").mockResolvedValue([
        {
          id: "u-p",
          role: "user",
          content: "When was Khan dismissed?",
          suggested_actions: [],
          created_at: "2026-07-07T10:00:00Z",
        },
        {
          id: "a-p",
          role: "assistant",
          content: "Khan was dismissed on 10 March 2026.",
          suggested_actions: [],
          created_at: "2026-07-07T10:00:05Z",
        },
      ]);
      mountChat({ docs: [someDoc("doc-1", "note.txt")] });

      const input = await screen.findByTestId("chat-composer-input");
      fireEvent.change(input, { target: { value: "When was Khan dismissed?" } });
      fireEvent.click(screen.getByRole("button", { name: "Send" }));

      // Stop replaces Send only once deltas are arriving.
      fireEvent.click(await screen.findByTestId("chat-composer-stop"));

      await waitFor(() => expect(capturedSignal?.aborted).toBe(true));
      const frozen = await screen.findByTestId("chat-stopped-bubble");
      expect(frozen).toHaveTextContent("Khan was dis");
      expect(screen.getByTestId("chat-stopped-note")).toHaveTextContent(
        "Stopped. The full answer is still being recorded.",
      );
      // A stop is not a failure: no error banner, prompt not restored.
      expect(screen.queryByText(/Could not send message/i)).toBeNull();
      expect(screen.getByTestId("chat-composer-send")).toBeInTheDocument();

      // ~2s later the thread refresh replaces the frozen draft with the
      // persisted turn.
      await waitFor(
        () => expect(screen.queryByTestId("chat-stopped-bubble")).toBeNull(),
        { timeout: 4000 },
      );
      expect(
        screen.getByText("Khan was dismissed on 10 March 2026."),
      ).toBeInTheDocument();
      expect(api.getThreadMessages).toHaveBeenCalledWith(matter.slug, "t-1");
    },
    10_000,
  );

  it("never offers Stop for a non-streaming turn", async () => {
    let releaseResult!: () => void;
    const resultGate = new Promise<void>((resolve) => {
      releaseResult = resolve;
    });
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* () {
        yield { event: "model.start", data: { stage: "assistant" } } as never;
        // No model.delta events — a keyless/stub turn.
        await resultGate;
        yield {
          event: "result",
          data: {
            user: {
              id: "u-1",
              role: "user",
              content: "Hello",
              suggested_actions: [],
              created_at: "",
            },
            assistant: {
              id: "a-1",
              role: "assistant",
              content: "Stub answer",
              suggested_actions: [],
              created_at: "",
            },
          },
        } as never;
      },
    );
    mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Working...")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-composer-stop")).toBeNull();

    releaseResult();
    expect(await screen.findByText("Stub answer")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-composer-stop")).toBeNull();
  });

  it("aborts the in-flight stream on unmount without state warnings", async () => {
    let capturedSignal: AbortSignal | undefined;
    heldStream((signal) => {
      capturedSignal = signal;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = mountChat({ docs: [someDoc("doc-1", "note.txt")] });

    const input = await screen.findByTestId("chat-composer-input");
    fireEvent.change(input, { target: { value: "When was Khan dismissed?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByTestId("chat-composer-stop");

    unmount();

    await waitFor(() => expect(capturedSignal?.aborted).toBe(true));
    // Give the rejected stream a beat to run its catch/finally paths.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const logged = errorSpy.mock.calls.flat().map(String).join(" ");
    expect(logged).not.toMatch(/unmounted component|not wrapped in act/i);
  });
});

