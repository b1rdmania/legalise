// diff.ts — typed wrapper around diff-match-patch for inline tracked-change
// rendering. Backend resolution uses anchor substitution (Phase B W2 gotcha
// 1); this module is for visual diffs only.

import { diff_match_patch } from "diff-match-patch";

export type DiffOp = "equal" | "insert" | "delete";

export interface DiffSegment {
  op: DiffOp;
  text: string;
}

type DmpInstance = InstanceType<typeof diff_match_patch>;

let _dmp: DmpInstance | null = null;

function dmp(): DmpInstance {
  if (_dmp === null) {
    _dmp = new diff_match_patch();
  }
  return _dmp;
}

const OP_MAP: Record<number, DiffOp> = {
  [-1]: "delete",
  [0]: "equal",
  [1]: "insert",
};

/**
 * Char-level diff between two strings, post-processed by dmp's semantic
 * cleanup so the segments align to word/sentence boundaries where possible.
 * Empty strings on either side are handled: the result becomes a single
 * insert or delete segment.
 */
export function diffStrings(a: string, b: string): DiffSegment[] {
  if (!a && !b) return [];
  if (!a) return [{ op: "insert", text: b }];
  if (!b) return [{ op: "delete", text: a }];

  const engine = dmp();
  const raw = engine.diff_main(a, b);
  engine.diff_cleanupSemantic(raw);
  return raw.map((tuple: [number, string]) => ({
    op: OP_MAP[tuple[0]] ?? "equal",
    text: tuple[1],
  }));
}
