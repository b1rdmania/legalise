// Pins the assistant-turn rendering contract: markdown renders as real
// elements (not literal asterisks), the [doc:]/[chron:] citation
// strip-and-chip pre-pass still runs BEFORE markdown, and user turns stay
// plain text.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";
import type { AssistantMessage, MatterDocument } from "../lib/api";

const doc: MatterDocument = {
  id: "doc-1",
  matter_id: "m-1",
  filename: "witness-statement.docx",
  mime_type:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  size_bytes: 1200,
  sha256: "a".repeat(64),
  tag: "draft",
  from_disclosure: false,
  uploaded_at: "2026-06-03T10:00:00",
  uploaded_by_id: "u-1",
} as never;

function message(overrides: Partial<AssistantMessage>): AssistantMessage {
  return {
    id: "a-1",
    role: "assistant",
    content: "",
    suggested_actions: [],
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as AssistantMessage;
}

function mount(m: AssistantMessage) {
  return render(
    <MessageBubble
      message={m}
      docs={[doc]}
      chronology={[]}
      onDocChip={vi.fn()}
      onChronChip={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("MessageBubble — assistant markdown", () => {
  it("renders markdown as elements, not literal asterisks", async () => {
    mount(
      message({
        content:
          "The claim is **strong** on the facts.\n\n- late disclosure\n- no fair procedure",
      }),
    );

    // The markdown chunk is lazy — findBy waits for it to mount.
    const bold = await screen.findByText("strong");
    expect(bold.tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*strong\*\*/)).toBeNull();

    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "late disclosure",
      "no fair procedure",
    ]);
  });

  it("strips citation markers before markdown and still renders the chips", async () => {
    mount(
      message({
        content: "The dismissal letter is **key** [doc:doc-1].",
      }),
    );

    const chip = await screen.findByRole("button", {
      name: /Document.*witness-statement\.docx/i,
    });
    expect(chip).toBeInTheDocument();
    // The raw marker never reaches the prose.
    expect(screen.queryByText(/\[doc:doc-1\]/)).toBeNull();
    const bold = await screen.findByText("key");
    expect(bold.tagName).toBe("STRONG");
  });

  it("renders GFM tables through remark-gfm", async () => {
    mount(
      message({
        content:
          "| Event | Date |\n| --- | --- |\n| Dismissal | 2026-01-10 |",
      }),
    );

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Event" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Dismissal" })).toBeInTheDocument();
  });

  it("keeps user messages as plain text", () => {
    mount(message({ id: "u-1", role: "user", content: "**not markdown**" }));

    // Literal asterisks survive: user turns are never markdown-rendered.
    expect(screen.getByText("**not markdown**")).toBeInTheDocument();
  });
});
