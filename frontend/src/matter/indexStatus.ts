// One vocabulary for per-document retrieval index state, shared by the
// Documents tab rows and the chat header document popover. Statuses come
// from the backend document model: pending / indexed / failed / empty.
export function indexStatusChip(
  status: string | undefined,
): { label: string; title: string; className: string } | null {
  switch (status) {
    case "indexed":
      return {
        label: "Searchable",
        title: "Indexed for matter-wide retrieval",
        className: "text-seal",
      };
    case "pending":
      return {
        label: "Indexing…",
        title: "Being indexed for matter-wide retrieval",
        className: "text-muted",
      };
    case "failed":
      return {
        label: "Not searchable",
        title: "Indexing failed; this document is not retrievable",
        className: "text-muted",
      };
    case "empty":
      return {
        label: "No text",
        title: "No extractable text to index",
        className: "text-muted",
      };
    default:
      return null;
  }
}
