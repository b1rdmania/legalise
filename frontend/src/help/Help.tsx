/**
 * /help — one quiet screen of plain-English answers.
 *
 * Standing Order (DESIGN.md P26): masthead PageHeader, ruled Q&A list,
 * no accordions, no search. Six questions, short answers, done.
 */

import type { ReactNode } from "react";
import { PageHeader } from "../ui/primitives";

const QA: { q: string; a: ReactNode }[] = [
  {
    q: "What is a matter?",
    a: "A matter is one piece of legal work — its documents, chat, and record live together in one place.",
  },
  {
    q: "How do skills get in?",
    a: "From the library: review a skill, enable it on a matter, then run it from Chat. Every run leaves a signed record.",
  },
  {
    q: "What is the privilege posture?",
    a: "Pausing a matter blocks model calls before any content leaves. Refusals are recorded.",
  },
  {
    q: "Where is the record?",
    a: "Activity on each matter. Workspace-wide, under Admin → Audit.",
  },
  {
    q: "What models run?",
    a: "Your own provider keys, per matter.",
  },
  {
    q: "Where do I report issues?",
    a: (
      <>
        On{" "}
        <a
          href="https://github.com/b1rdmania/legalise/issues"
          target="_blank"
          rel="noreferrer"
          className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
        >
          GitHub
        </a>
        .
      </>
    ),
  },
];

export function Help() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-ink">
      <PageHeader eyebrow="How the workspace works" title="Help" />
      <dl>
        {QA.map(({ q, a }) => (
          <div key={q} className="border-b border-rule/60 py-5">
            <dt className="text-sm font-semibold text-ink">{q}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted">{a}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
