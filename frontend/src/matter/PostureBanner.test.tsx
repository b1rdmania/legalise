/**
 * Phase 14 C — PostureBanner matrix regression.
 *
 * Asserts the per-(role × posture) cell from POSTURE_GATE_UX.md. The
 * matrix is the load-bearing UX contract; this test pins it.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostureBanner } from "./PostureBanner";
import type { CurrentUser } from "../lib/api";

function user(role: string, opts: { is_superuser?: boolean } = {}): CurrentUser {
  return {
    id: "u-1",
    email: "u1@example.com",
    name: "u1",
    role,
    plan: "free",
    default_model_id: null,
    default_privilege_posture: null,
    is_active: true,
    is_verified: true,
    is_superuser: opts.is_superuser ?? false,
  };
}

describe("PostureBanner — A_cleared (always silent)", () => {
  it("renders nothing for solicitor", () => {
    const { container } = render(
      <PostureBanner posture="A_cleared" user={user("solicitor")} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for qualified_solicitor", () => {
    const { container } = render(
      <PostureBanner posture="A_cleared" user={user("qualified_solicitor")} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("PostureBanner — B_mixed", () => {
  it("renders for solicitor with required-role message", () => {
    render(<PostureBanner posture="B_mixed" user={user("solicitor")} />);
    expect(screen.getByTestId("posture-banner")).toBeInTheDocument();
    expect(screen.getByText(/B_mixed/)).toBeInTheDocument();
    expect(screen.getByText(/qualified_solicitor/)).toBeInTheDocument();
    // The actor's role appears verbatim — match exact "solicitor"
    // to avoid catching "qualified_solicitor" first.
    expect(
      screen.getByText((_, el) => el?.textContent?.trim() === "solicitor"),
    ).toBeInTheDocument();
  });

  it("renders nothing for qualified_solicitor", () => {
    const { container } = render(
      <PostureBanner posture="B_mixed" user={user("qualified_solicitor")} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("STILL renders for a superuser whose role is not qualified_solicitor", () => {
    // Substrate truth: posture_gate checks the role string verbatim;
    // is_superuser is not consulted. A superuser-but-not-qualified
    // user CANNOT smuggle past posture. Pre-redline UI gave them a
    // false pass; this test pins the fix.
    render(
      <PostureBanner
        posture="B_mixed"
        user={user("solicitor", { is_superuser: true })}
      />,
    );
    expect(screen.getByTestId("posture-banner")).toBeInTheDocument();
  });

  it("renders for a superuser whose role IS qualified_solicitor only when… no it does not", () => {
    // Sanity check the orthogonal axis: if the role string itself is
    // qualified_solicitor, the banner is silent regardless of
    // is_superuser. This is the right substrate-aligned bypass.
    const { container } = render(
      <PostureBanner
        posture="B_mixed"
        user={user("qualified_solicitor", { is_superuser: true })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders for unauth visitor (no user)", () => {
    render(<PostureBanner posture="B_mixed" user={null} />);
    expect(screen.getByTestId("posture-banner")).toBeInTheDocument();
  });
});

describe("PostureBanner — C_paused", () => {
  it("renders for any role including admin", () => {
    render(
      <PostureBanner
        posture="C_paused"
        user={user("qualified_solicitor", { is_superuser: true })}
      />,
    );
    expect(screen.getByTestId("posture-banner")).toBeInTheDocument();
    expect(screen.getByText(/matter is paused/i)).toBeInTheDocument();
    // Admins see the unpause hint.
    expect(screen.getByText(/PATCH .*\/privilege/)).toBeInTheDocument();
  });

  it("renders for solicitor without admin hint", () => {
    render(<PostureBanner posture="C_paused" user={user("solicitor")} />);
    expect(screen.getByTestId("posture-banner")).toBeInTheDocument();
    // No admin unpause hint for non-admins.
    expect(screen.queryByText(/PATCH .*\/privilege/)).toBeNull();
  });
});

describe("PostureBanner — unknown posture (fail closed)", () => {
  it("renders a block banner naming the unknown posture", () => {
    render(
      <PostureBanner
        posture="Z_experimental"
        user={user("qualified_solicitor", { is_superuser: true })}
      />,
    );
    expect(screen.getByTestId("posture-banner")).toBeInTheDocument();
    expect(screen.getByText(/unknown posture/i)).toBeInTheDocument();
    expect(screen.getByText(/Z_experimental/)).toBeInTheDocument();
  });
});

describe("PostureBanner — does NOT deep-link to reconstruction yet", () => {
  it("renders no 'View audit trail' link (Phase 14 E target)", () => {
    render(<PostureBanner posture="B_mixed" user={user("solicitor")} />);
    expect(
      screen.queryByRole("link", { name: /view.*audit/i }),
    ).toBeNull();
  });
});
