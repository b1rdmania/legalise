import { ArrowRight, Github } from "lucide-react";
import { Footer } from "../ui/Footer";

const REPO = "https://github.com/b1rdmania/legalise";

const MECHANISM = [
  {
    number: "01",
    label: "Matter boundary",
    title: "The request is scoped before execution.",
    detail:
      "Privilege posture and capability grants are read from the matter before a model or skill can run. A paused matter is a hard stop.",
  },
  {
    number: "02",
    label: "Human gate",
    title: "AI output remains a draft.",
    detail:
      "A named reviewer records the decision. Sign-off pins the exact output by hash and records whether the signer was also the author.",
  },
  {
    number: "03",
    label: "Database record",
    title: "Every consequential action enters the chain.",
    detail:
      "A PostgreSQL trigger appends one chain row for every audit row. Update and delete operations are rejected by the audit table itself.",
  },
  {
    number: "04",
    label: "Independent verification",
    title: "The record leaves with its verifier.",
    detail:
      "Each matter export carries the raw audit chain and a standard-library Python verifier that recomputes it offline.",
  },
];

const EVIDENCE = [
  {
    eyebrow: "Database enforced",
    title: "Append-only audit chain",
    copy: "The chain is written synchronously by an AFTER INSERT trigger rather than relying on every application path to remember it.",
    href: `${REPO}/blob/master/backend/alembic/versions/0030_audit_hash_chain.py`,
    link: "Read the migration",
  },
  {
    eyebrow: "Two implementations",
    title: "Drift fails in CI",
    copy: "The canonical hash recipe exists independently in PL/pgSQL and Python, with tests that detect disagreement between them.",
    href: `${REPO}/blob/master/backend/app/core/audit_chain.py`,
    link: "Inspect the verifier",
  },
  {
    eyebrow: "Portable evidence",
    title: "Offline export verification",
    copy: "The export bundle includes audit_chain.json and verify_chain.py. A recipient needs Python, not a running Legalise instance.",
    href: `${REPO}/blob/master/backend/app/core/exports.py`,
    link: "Inspect the export",
  },
  {
    eyebrow: "Claims bounded",
    title: "Threat model in public",
    copy: "Legalise distinguishes tamper-evidence from tamper-proofing and names the operator, provider, and deployment trust boundaries.",
    href: `${REPO}/blob/master/docs/THREAT_MODEL.md`,
    link: "Read the threat model",
  },
];

export function Landing() {
  return (
    <div className="max-w-page mx-auto">
      <section className="relative min-h-[680px] overflow-hidden border-b border-rule md:min-h-[760px]">
        <div
          className="pointer-events-none absolute inset-0 z-0 hidden md:block"
          aria-hidden="true"
          style={{
            opacity: 0.12,
            filter: "sepia(1) saturate(7) hue-rotate(-30deg) brightness(0.55)",
          }}
        >
          <lottie-player
            src="/animations/signature.json"
            autoplay
            speed="0.5"
            background="transparent"
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        <div className="relative z-10 flex min-h-[680px] max-w-4xl flex-col justify-center px-4 py-20 sm:px-6 md:min-h-[760px] md:px-16 lg:px-24">
          <p className="eyebrow mb-7">
            Open-source governance infrastructure · Evaluation release
          </p>
          <h1 className="max-w-4xl font-redaction35 text-[44px] leading-[1.02] tracking-tight2 text-ink sm:text-[62px] md:text-[76px]">
            The machine signs its record. The human signs the work.
          </h1>
          <div className="my-8 h-[3px] w-16 bg-seal" aria-hidden="true" />
          <p className="max-w-2xl text-lg leading-relaxed text-prose md:text-xl">
            Legalise is an open-source governance layer for AI-assisted legal
            work: human sign-off, a database-enforced audit chain, and exports
            that can be verified offline.
          </p>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted">
            Built for England &amp; Wales solicitor practice. Self-hosted.
            Not for live client matters.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href="/architecture"
              className="inline-flex min-h-[44px] items-center gap-2 bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-seal"
            >
              Inspect the architecture
              <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </a>
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 border border-rule px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-wash"
            >
              <Github size={16} strokeWidth={1.75} aria-hidden="true" />
              View source
            </a>
          </div>

          <a
            href="#mechanism"
            className="mt-14 inline-flex min-h-[44px] w-fit items-center gap-3 text-sm text-muted transition-colors hover:text-seal"
          >
            <span aria-hidden="true">↓</span>
            Inspect the mechanism
          </a>
        </div>
      </section>

      <section aria-label="Project status" className="border-b border-rule px-4 sm:px-6 md:px-16 lg:px-24">
        <dl className="grid divide-y divide-rule md:grid-cols-4 md:divide-x md:divide-y-0">
          {[
            ["Status", "Open evaluation release"],
            ["Deployment", "Self-hosted"],
            ["Jurisdiction", "England & Wales"],
            ["Licence", "Apache 2.0"],
          ].map(([term, value]) => (
            <div key={term} className="py-5 md:px-5 md:first:pl-0 md:last:pr-0">
              <dt className="eyebrow-sm">{term}</dt>
              <dd className="mt-2 text-sm text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="mechanism" className="scroll-mt-8 px-4 py-20 sm:px-6 md:px-16 md:py-28 lg:px-24">
        <div className="max-w-3xl">
          <p className="eyebrow mb-5">Enforced mechanism</p>
          <h2 className="font-redaction35 text-[38px] leading-tight tracking-tight2 text-ink sm:text-[52px]">
            A record you can inspect, not a promise you have to trust.
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-prose">
            The governance path is deliberately narrow. Each stage either
            produces reviewable evidence or stops the request.
          </p>
        </div>

        <ol className="mt-14 border-t border-ink">
          {MECHANISM.map((item) => (
            <li
              key={item.number}
              className="grid gap-4 border-b border-rule py-7 md:grid-cols-[64px_180px_minmax(0,1fr)] md:gap-7"
            >
              <span className="tech-token text-xs text-seal">{item.number}</span>
              <span className="eyebrow-sm pt-0.5">{item.label}</span>
              <div>
                <h3 className="text-lg font-semibold leading-snug text-ink">
                  {item.title}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-prose">
                  {item.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <a
          href="/architecture"
          className="mt-8 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-ink underline decoration-rule underline-offset-4 transition-colors hover:text-seal hover:decoration-seal"
        >
          Read the implementation architecture
          <ArrowRight size={15} strokeWidth={1.75} aria-hidden="true" />
        </a>
      </section>

      <section className="border-y border-rule bg-wash px-4 py-20 sm:px-6 md:px-16 md:py-28 lg:px-24">
        <div className="max-w-3xl">
          <p className="eyebrow mb-5">Evidence in the repository</p>
          <h2 className="font-redaction35 text-[38px] leading-tight tracking-tight2 text-ink sm:text-[52px]">
            The mechanism is the presentation.
          </h2>
        </div>

        <div className="mt-12 grid border-l border-t border-rule md:grid-cols-2">
          {EVIDENCE.map((item) => (
            <article key={item.title} className="flex min-h-[270px] flex-col border-b border-r border-rule bg-paper p-6 md:p-8">
              <p className="eyebrow-sm">{item.eyebrow}</p>
              <h3 className="mt-5 text-xl font-semibold leading-tight text-ink">
                {item.title}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-prose">
                {item.copy}
              </p>
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="mt-auto inline-flex min-h-[44px] items-end pt-6 text-sm font-semibold text-ink underline decoration-rule underline-offset-4 transition-colors hover:text-seal hover:decoration-seal"
              >
                {item.link} ↗
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 md:px-16 md:py-28 lg:px-24">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)] lg:gap-20">
          <div>
            <p className="eyebrow mb-5">Trust boundary</p>
            <h2 className="font-redaction35 text-[38px] leading-tight tracking-tight2 text-ink sm:text-[52px]">
              Tamper-evident, not tamper-proof.
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-prose">
              The chain detects edit, deletion, and reordering while its
              database controls remain intact. A privileged operator can still
              disable those controls and rewrite unanchored history. External
              anchoring is not built.
            </p>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-prose">
              Legalise is an evaluation release and a reference implementation,
              not a regulated legal service or a claim that governance is solved.
            </p>
          </div>

          <aside className="border border-ink bg-paper p-6 md:p-8">
            <p className="eyebrow-sm">Start with the record</p>
            <p className="mt-5 text-lg leading-relaxed text-ink">
              Read the architecture, test the assumptions, and take the parts
              that belong in your own stack.
            </p>
            <div className="mt-8 flex flex-col items-start gap-3">
              <a
                href="/architecture"
                className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-ink underline decoration-rule underline-offset-4 hover:text-seal hover:decoration-seal"
              >
                Architecture <ArrowRight size={15} aria-hidden="true" />
              </a>
              <a
                href={REPO}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-ink underline decoration-rule underline-offset-4 hover:text-seal hover:decoration-seal"
              >
                GitHub <Github size={15} aria-hidden="true" />
              </a>
            </div>
          </aside>
        </div>

        <Footer />
      </section>
    </div>
  );
}
