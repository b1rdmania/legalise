/**
 * Supervised exports — the pack certificate states the honesty boundary
 * as counts: verified-at-source / attested-at-ingest / claimed-by-source
 * (labelled unchecked), mismatches in seal, sign-offs tallied.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PackCertificate } from "./ExternalPacks";
import type { ExternalPack } from "../lib/api";

afterEach(() => cleanup());

function pack(overrides: Partial<ExternalPack> = {}): ExternalPack {
  return {
    matter_id: "m-1",
    matter_slug: "external-mike-abc12345",
    title: "External pack — mike: Hart v Mercia Logistics",
    adapter: "mike",
    source: "mike",
    exported_at: "2026-06-12T09:00:00.000Z",
    ingested_at: "2026-06-12T10:00:00.000Z",
    counts: {
      documents: 3,
      versions: 5,
      edits: 2,
      verified_at_source: 2,
      attested_at_ingest: 1,
      claimed_by_source: 0,
      unhashed: 0,
      hash_mismatches: 0,
    },
    manifest_artifact_id: "a-1",
    document_artifact_ids: ["a-2", "a-3", "a-4"],
    signoffs: { total: 0, signed: 0, signed_with_observations: 0, rejected: 0 },
    ...overrides,
  };
}

// Router Link needs a router context in real pages; for the unit test we
// stub it by rendering inside a plain DOM — TanStack's Link throws
// without a router, so the certificate is tested through its testids
// with the title link asserted by text only.
import { vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

describe("PackCertificate", () => {
  it("grades the hash claims and shows no sign-offs yet", () => {
    render(<PackCertificate pack={pack()} index={0} />);
    expect(screen.getByTestId("pack-doc-count")).toHaveTextContent("3");
    expect(screen.getByTestId("pack-verified-count")).toHaveTextContent("2");
    expect(screen.getByTestId("pack-attested-count")).toHaveTextContent("1");
    expect(screen.queryByTestId("pack-claimed-count")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pack-mismatch-count")).not.toBeInTheDocument();
    expect(screen.getByTestId("pack-signoffs")).toHaveTextContent("none yet");
    expect(
      screen.getByText("External pack — mike: Hart v Mercia Logistics"),
    ).toBeInTheDocument();
  });

  it("labels manifest-only hashes as claimed and unchecked", () => {
    render(
      <PackCertificate
        pack={pack({
          counts: {
            documents: 2,
            versions: 2,
            edits: 0,
            verified_at_source: 0,
            attested_at_ingest: 0,
            claimed_by_source: 2,
            unhashed: 0,
            hash_mismatches: 0,
          },
        })}
        index={0}
      />,
    );
    expect(screen.getByTestId("pack-verified-count")).toHaveTextContent("0");
    expect(screen.getByTestId("pack-claimed-count")).toHaveTextContent("2");
    expect(
      screen.getByText("Claimed by source — unchecked"),
    ).toBeInTheDocument();
  });

  it("surfaces hash mismatches in seal and tallies sign-offs", () => {
    render(
      <PackCertificate
        pack={pack({
          counts: {
            documents: 2,
            versions: 2,
            edits: 0,
            verified_at_source: 1,
            attested_at_ingest: 1,
            claimed_by_source: 0,
            unhashed: 0,
            hash_mismatches: 1,
          },
          signoffs: {
            total: 2,
            signed: 1,
            signed_with_observations: 0,
            rejected: 1,
          },
        })}
        index={1}
      />,
    );
    expect(screen.getByTestId("pack-mismatch-count")).toHaveTextContent("1");
    expect(screen.getByTestId("pack-signoffs")).toHaveTextContent(
      "1 signed · 1 refused",
    );
  });
});
