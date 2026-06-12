/**
 * Counsel Register — track-record block (M13 extension).
 *
 * The per-skill track record adds median review latency and the n,
 * with the sub-n=30 honesty label. "—" for no derivable window.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TrackRecord } from "./CounselRegister";

afterEach(() => cleanup());

describe("TrackRecord", () => {
  it("shows median latency with the honesty label under n=30", () => {
    render(
      <TrackRecord
        record={{ signed: 3, rejected: 1 }}
        medianReviewSeconds={240}
        latencyN={4}
      />,
    );
    const latency = screen.getByTestId("track-record-latency");
    expect(latency).toHaveTextContent("median review 4 minutes");
    expect(latency).toHaveTextContent("n=4");
    expect(screen.getByTestId("track-record-low-n")).toHaveTextContent(
      "too few to mean much",
    );
  });

  it("drops the honesty label at n=30 and above", () => {
    render(
      <TrackRecord
        record={{ signed: 28, rejected: 2 }}
        medianReviewSeconds={600}
        latencyN={30}
      />,
    );
    expect(screen.getByTestId("track-record-latency")).toHaveTextContent("n=30");
    expect(screen.queryByTestId("track-record-low-n")).not.toBeInTheDocument();
  });

  it("renders an em-dash, never 0, when no review window is derivable", () => {
    render(
      <TrackRecord record={{ signed: 2 }} medianReviewSeconds={null} latencyN={0} />,
    );
    expect(screen.getByTestId("track-record-latency")).toHaveTextContent(
      "median review —",
    );
  });

  it("keeps the empty state when nothing is signed", () => {
    render(<TrackRecord record={{}} />);
    expect(screen.queryByTestId("track-record-latency")).not.toBeInTheDocument();
    expect(screen.getByText(/No supervised work signed yet/)).toBeInTheDocument();
  });
});
