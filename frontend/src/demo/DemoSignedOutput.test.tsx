import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DemoSignedOutput } from "./DemoSignedOutput";
import { DEMO_SNAPSHOT } from "./snapshot";
import { narrateEntry } from "../matter/auditNarrate";

describe("DemoSignedOutput (P34)", () => {
  it("renders the signature block in the register idiom", () => {
    render(<DemoSignedOutput />);

    expect(
      screen.getByText("R. Patel, supervising solicitor"),
    ).toBeInTheDocument();
    expect(screen.getByText("assistant (skill run)")).toBeInTheDocument();
    expect(screen.getByText("Signer is not the author")).toBeInTheDocument();
    expect(screen.getByText("2026-04-06")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /See output\.signed on the record/ }),
    ).toHaveAttribute("href", "/demo/audit");
  });

  it("renders the two tracked changes as static spans", () => {
    render(<DemoSignedOutput />);

    const deletion = screen.getByTestId("demo-signed-output-deletion");
    expect(deletion).toHaveTextContent("roughly fifty followers");
    expect(deletion.className).toContain("line-through");
    expect(deletion.className).toContain("decoration-seal");

    const insertion = screen.getByTestId("demo-signed-output-insertion");
    expect(insertion).toHaveTextContent("47 approved followers");
    expect(insertion.className).toContain("underline");
  });
});

describe("demo snapshot sign-off scene (P34)", () => {
  it("closes the record with an accepted edit and a signed output", () => {
    const accepted = DEMO_SNAPSHOT.audit.find(
      (e) => e.action === "document.edit.accepted",
    );
    expect(accepted).toBeDefined();
    expect(narrateEntry(accepted!)).toBe(
      "Accepted a tracked change in the document.",
    );

    const signed = DEMO_SNAPSHOT.audit.find(
      (e) => e.action === "output.signed",
    );
    expect(signed).toBeDefined();
    expect(signed!.payload).toMatchObject({
      signer: "R. Patel",
      signer_is_author: false,
      decision: "signed",
      artifact_kind: "skill_response",
    });
  });

  it("the chat closes on the signed output", () => {
    const last = DEMO_SNAPSHOT.assistantMessages.at(-1)!;
    expect(last.role).toBe("assistant");
    expect(last.suggested_actions[0]).toMatchObject({
      type: "view_signed_output",
      label: "See the signed output",
    });
  });
});
