import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DocumentsTab } from "./DocumentsTab";

afterEach(() => cleanup());

describe("DocumentsTab — document ingress", () => {
  it("uploads multiple selected files through the existing per-document audit path", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<DocumentsTab slug="khan" docs={[]} onUpload={onUpload} />);

    fireEvent.change(screen.getByLabelText("Upload documents"), {
      target: {
        files: [
          new File(["one"], "one.txt", { type: "text/plain" }),
          new File(["two"], "two.txt", { type: "text/plain" }),
        ],
      },
    });

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    expect(onUpload).toHaveBeenNthCalledWith(1, expect.any(File), undefined, undefined);
    expect(onUpload).toHaveBeenNthCalledWith(2, expect.any(File), undefined, undefined);
    expect(screen.getByTestId("document-ingress-status")).toHaveTextContent(
      "2 documents uploaded",
    );
  });

  it("uses valid backend tag values instead of free-text tags", () => {
    render(<DocumentsTab slug="khan" docs={[]} onUpload={vi.fn()} />);

    expect(screen.getByLabelText(/tag/i)).toHaveDisplayValue("No tag");
    expect(screen.getByRole("option", { name: "Disclosure" })).toHaveValue(
      "disclosure",
    );
    expect(screen.getByRole("option", { name: "Signed" })).toHaveValue("signed");
  });
});
