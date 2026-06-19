// Legalise — our own build. Mirrors the company detail-page sections (header,
// screenshot, take, facts-style blocks) but carries no scores: it isn't a
// scored teardown subject, it's the thing we're building to address the space.

const LOGO = "https://www.google.com/s2/favicons?domain=legalise.dev&sz=128";
const SHOT =
  "https://s.wordpress.com/mshots/v1/https%3A%2F%2Flegalise.dev%2F?w=1200&h=750";
const SITE = "https://legalise.dev/";
const DEMO = "https://legalise.dev/guided-demo";
const GITHUB = "https://github.com/b1rdmania/legalise";

const WHAT: [string, string][] = [
  ["Matter files", "AI work lives inside the matter file, not in a side chat — so the record and the work are the same object."],
  ["Legal modules", "Task-specific modules rather than one open-ended chatbot, so the AI is scoped to a job."],
  ["Privilege posture", "Privilege is modelled explicitly — who can see what, and what stays protected."],
  ["Capability gates", "The AI is only allowed to do what it's been granted; everything else is gated."],
  ["Audit trail", "Every human review, edit, approval and sign-off is recorded and inspectable."],
];

export function LegalisePage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-12">
      <a
        href="#space"
        className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink"
      >
        ← back to the space
      </a>

      <div className="mt-6 flex items-center gap-3">
        <img
          src={LOGO}
          alt=""
          width={40}
          height={40}
          className="rounded bg-paper shrink-0"
        />
        <h1 className="font-redaction35 text-3xl md:text-4xl tracking-tight2 flex-1">
          Legalise
        </h1>
        <span className="text-[10px] uppercase tracking-track1 text-seal border border-seal px-1.5 py-0.5">
          ours · beta
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>Compliance & guardrails</span>
        <a href={SITE} target="_blank" rel="noopener noreferrer" className="underline decoration-rule underline-offset-4 hover:text-ink">
          visit site ↗
        </a>
        <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="underline decoration-rule underline-offset-4 hover:text-ink">
          GitHub ↗
        </a>
        {["Open source", "England & Wales", "v0.1"].map((t) => (
          <span key={t} className="text-[10px] uppercase tracking-track1 text-muted border border-rule px-1.5 py-0.5">
            {t}
          </span>
        ))}
      </div>

      <img
        src={SHOT}
        alt="Legalise website"
        className="mt-6 w-full rounded-card border border-rule bg-wash"
        loading="lazy"
      />

      {/* The little explainer. */}
      <div className="mt-8 text-[1.05rem] leading-[1.7] text-prose">
        <p className="font-redaction35 text-2xl tracking-tight2 text-ink mb-4">
          AI can draft the case. It cannot sign it.
        </p>
        <p className="!mb-0">
          Legalise keeps AI work inside the matter file, with a record of every
          human review, edit, approval and sign-off. It&apos;s the
          guardrails-and-documentation layer this whole section is about —
          accountability built in, so a regulator or an insurer can see exactly
          what the AI did and who stood behind it.
        </p>
      </div>

      {/* My take — why it's here. */}
      <section className="mt-10">
        <h2 className="eyebrow mb-4">Why it&apos;s here</h2>
        <p className="prose-p text-[1.05rem] leading-[1.7]">
          Full disclosure: this is ours. After walking the floor and deciding the
          guardrails layer is the most important space nobody&apos;s serving, it
          felt dishonest not to say we&apos;re building into it. It&apos;s early —
          v0.1, open-source, unfinished, experimental. Not a pitch; a working
          attempt at the thing I think the flip will force everyone to need.
        </p>
      </section>

      {/* What it does — facts-style, no scores. */}
      <section className="mt-10">
        <h2 className="eyebrow mb-4">What it does</h2>
        <dl className="divide-y divide-rule border-y border-rule">
          {WHAT.map(([k, v]) => (
            <div key={k} className="py-3 flex gap-4">
              <dt className="w-32 shrink-0 font-bold">{k}</dt>
              <dd className="prose-p !mb-0 text-sm flex-1">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Where it's at — honest status. */}
      <section className="mt-10">
        <h2 className="eyebrow mb-4">Where it&apos;s at</h2>
        <p className="prose-p text-sm">
          Open source, England &amp; Wales, v0.1. Unfinished and experimental —
          come break it. The fastest way to get it is the 30-second guided demo.
        </p>
      </section>

      {/* CTA. */}
      <div className="mt-8 flex flex-wrap gap-3">
        <a href={DEMO} target="_blank" rel="noopener noreferrer" className="bg-ink text-paper rounded-card px-5 py-3 text-sm font-bold hover:opacity-90 transition-opacity">
          See it work ↗
        </a>
        <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="border border-rule rounded-card px-5 py-3 text-sm font-bold hover:border-ink transition-colors">
          View on GitHub ↗
        </a>
      </div>

      <div className="mt-12 border-t border-rule pt-6">
        <a href="#space" className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink">
          ← back to the space
        </a>
      </div>
    </article>
  );
}
