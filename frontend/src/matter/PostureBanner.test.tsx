/**
 * PostureBanner matrix regression.
 *
 * Asserts the per-(role × posture) cell from POSTURE_GATE_UX.md. The
 * matrix is the load-bearing UX contract; this test pins it.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(
      screen.getByText(/only qualified solicitors can run skills/i),
    ).toBeInTheDocument();
    // Role tokens render as display words in banner copy (WI-5.1):
    // "qualified solicitor" / "solicitor", never the raw substrate token.
    expect(
      screen.getByText(/requires the qualified solicitor role/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/your role: solicitor\./i)).toBeInTheDocument();
    expect(screen.queryByText(/qualified_solicitor/)).toBeNull();
  });

  it("maps every role token to display words in banner copy", () => {
    // workspace_admin does not satisfy B_mixed (substrate truth), so the
    // banner shows — and its role reads as words, not the enum token.
    render(<PostureBanner posture="B_mixed" user={user("workspace_admin")} />);
    expect(
      screen.getByText(/your role: workspace admin\./i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/workspace_admin/)).toBeNull();
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

  it("renders nothing for superuser when role is qualified_solicitor", () => {
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
  it("renders the banner for an admin", () => {
    // No admin-only inline hint anymore — Phase 14 G replaced the
    // copy-only PATCH hint with the ChangePostureControl. Hint
    // behaviour is now in the change-posture-CTA describe block.
    render(
      <PostureBanner
        posture="C_paused"
        user={user("qualified_solicitor", { is_superuser: true })}
      />,
    );
    expect(screen.getByTestId("posture-banner")).toBeInTheDocument();
    expect(screen.getByText(/paused on this matter/i)).toBeInTheDocument();
  });

  it("renders for solicitor", () => {
    render(<PostureBanner posture="C_paused" user={user("solicitor")} />);
    expect(screen.getByTestId("posture-banner")).toBeInTheDocument();
    // Without an onChangePosture callback, no control renders for
    // any viewer including admins.
    expect(screen.queryByTestId("change-posture-control")).toBeNull();
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
    expect(screen.getByText(/unknown privilege/i)).toBeInTheDocument();
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

describe("PostureBanner — admin pause/resume toggle", () => {
  it("shows the pause toggle to superusers on an active matter and forwards C_paused", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <PostureBanner
        posture="B_mixed"
        user={user("solicitor", { is_superuser: true })}
        onChangePosture={onChange}
      />,
    );
    // Superuser still sees the banner (P1 from C ratification — no
    // posture bypass) AND now sees the admin toggle.
    expect(screen.getByTestId("posture-banner")).toBeInTheDocument();
    expect(
      screen.getByTestId("change-posture-control"),
    ).toBeInTheDocument();
    const submit = screen.getByTestId(
      "change-posture-submit",
    ) as HTMLButtonElement;
    expect(submit.textContent).toMatch(/pause ai on this matter/i);
    fireEvent.click(submit);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("C_paused");
    });
  });

  it("shows Resume AI on a paused matter and forwards B_mixed", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <PostureBanner
        posture="C_paused"
        user={user("solicitor", { is_superuser: true })}
        onChangePosture={onChange}
      />,
    );
    const submit = screen.getByTestId(
      "change-posture-submit",
    ) as HTMLButtonElement;
    expect(submit.textContent).toMatch(/resume ai/i);
    fireEvent.click(submit);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("B_mixed");
    });
  });

  it("hides change-posture control from non-superusers", () => {
    const onChange = vi.fn();
    render(
      <PostureBanner
        posture="B_mixed"
        user={user("solicitor")}
        onChangePosture={onChange}
      />,
    );
    expect(screen.queryByTestId("change-posture-control")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders change-posture control on C_paused for admins too", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <PostureBanner
        posture="C_paused"
        user={user("workspace_admin", { is_superuser: true })}
        onChangePosture={onChange}
      />,
    );
    expect(
      screen.getByTestId("change-posture-control"),
    ).toBeInTheDocument();
  });

  it("omits the control when onChangePosture is not provided (caller opt-in)", () => {
    render(
      <PostureBanner
        posture="B_mixed"
        user={user("solicitor", { is_superuser: true })}
      />,
    );
    expect(screen.queryByTestId("change-posture-control")).toBeNull();
  });
});
