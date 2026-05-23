import { Footer } from "../ui/Footer";

// Standalone manifesto page. The repository copy is still the canonical
// long-form source; this route gives the launch thesis its own reading
// experience inside the site's typography and design language.
//
// When docs/MANIFESTO.md changes meaningfully, update this file in step.
// The "View source on GitHub" link at the foot is the receipt that the
// repository copy is authoritative.

type Section = {
  id: string;
  title: string;
  body: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    id: "wedge",
    title: "The wedge",
    body: (
      <>
        <p className="prose-p">
          UK legal AI sits under rules most products ignore. Heppner made
          it concrete. A firm using AI must show, later and on demand,
          what privileged material the AI saw, who held it, and under
          what protection.
        </p>
        <p className="prose-p">
          The audit log is not a nice-to-have. It is the canonical record.
          Privilege posture is not a preference. It is a constraint on
          dispatch.
        </p>
        <p className="prose-p">
          The market frames AI inside legal work as a chatbot problem. We
          frame it as a workspace problem. The matter is the unit of work.
          Every model call, every document mutation, every chronology
          entry exists inside one matter, owned by one user, governed by
          one privilege posture, written into one audit log.
        </p>
        <p className="prose-p">
          Outside that frame, the legal use case stops being legal. It is
          a generic question that happens to mention the law.
        </p>
      </>
    ),
  },
  {
    id: "supervised-autonomy",
    title: "Supervised autonomy, not unsupervised automation",
    body: (
      <>
        <p className="prose-p">
          The interesting question is no longer only what AI can automate.
          It is what a firm would choose not to automate, where human
          judgement must remain named, and how the system proves that
          boundary held.
        </p>
        <p className="prose-p">
          Legalise is not trying to make legal work unsupervised. It is
          trying to make supervision explicit, inspectable, and auditable.
        </p>
        <p className="prose-p">
          The unit is not a prompt. It is a matter. The control points are
          not vibes. They are permissions, privilege posture, source
          evidence, review gates, and audit rows. Audit is not the
          product. Audit is the receipt.
        </p>
      </>
    ),
  },
  {
    id: "matter-first",
    title: "Matter-first, not prompt-first",
    body: (
      <>
        <p className="prose-p">
          The workspace organises around the matter. Documents, prompts,
          outputs, audit rows. All hang off a slug, a title, a parties
          record, a privilege posture, a retention clock.
        </p>
        <p className="prose-p">
          AI tooling that operates outside the matter frame is fine for
          research. Not acceptable as the substrate for regulated
          practice.
        </p>
      </>
    ),
  },
  {
    id: "how-it-works",
    title: "How the workspace works",
    body: (
      <>
        <p className="prose-p">
          Open a matter. Ask the assistant. Install a legal module. Run it.
          See what it touched. See the audit trail.
        </p>
        <p className="prose-p">
          The product mechanic is intentionally plain. A matter carries the
          parties, documents, chronology, privilege posture, retention clock,
          module installs, capability grants, model calls, and audit rows.
          The AI does not float outside the file.
        </p>
        <p className="prose-p">
          Modules declare what they need. The workspace grants it. Runtime
          checks it. Denials are structured and audited. That is the trust
          model in one line.
        </p>
      </>
    ),
  },
  {
    id: "audit-canonical",
    title: "Audit as the canonical record",
    body: (
      <>
        <p className="prose-p">
          Every model call writes an audit row. Every matter mutation
          writes an audit row. Every disclosure-tainted chronology entry
          writes an audit row with the CPR 31.22 acknowledgement attached.
        </p>
        <p className="prose-p">
          The audit log is what a solicitor uses to answer the questions a
          regulator, a client, or opposing counsel will eventually ask.
          What did your AI see. When did it see it. Under what protection.
          What did it produce.
        </p>
      </>
    ),
  },
  {
    id: "why-audit",
    title: "Why the audit trail",
    body: (
      <>
        <p className="prose-p">
          Professional liability is boring until it is existential.
        </p>
        <p className="prose-p">
          If AI touches a matter, the solicitor remains accountable. The
          client may ask what happened. The insurer may ask what happened.
          The SRA may ask what happened. A partner may ask why a deadline,
          citation, disclosure decision, or letter went wrong.
        </p>
        <p className="prose-p">
          A solicitor cannot responsibly supervise something if they
          cannot reconstruct what material the system saw, whether
          privileged material was involved, which model or module touched
          it, what it produced, who approved or relied on it, and what
          changed after human review.
        </p>
        <p className="prose-p">
          Without that, supervised autonomy is just trust me, a lawyer was
          nearby.
        </p>
        <p className="prose-p">
          Legalise records the path. The audit trail is not the product.
          It is the receipt.
        </p>
      </>
    ),
  },
  {
    id: "privilege-posture",
    title: "Privilege posture is a dispatch constraint",
    body: (
      <>
        <p className="prose-p">
          Three states. <code className="text-sm">A_cleared</code>,{" "}
          <code className="text-sm">B_mixed</code>,{" "}
          <code className="text-sm">C_paused</code>. Each matter carries
          one. The gateway reads the posture before every model call and
          decides which providers can serve it.
        </p>
        <p className="prose-p">
          Cloud providers are commodities behind the gateway, not direct
          dependencies of any module. Local models (Ollama) exist from day
          one for <code className="text-sm">C_paused</code> matters.
        </p>
        <p className="prose-p">
          If the posture rules and the providers configured for a matter
          cannot serve a call, the gateway refuses it. The refusal is
          audited. Privilege is not a soft setting.
        </p>
      </>
    ),
  },
  {
    id: "providers-commodity",
    title: "Providers are commodity",
    body: (
      <>
        <p className="prose-p">
          Anthropic, OpenAI, Ollama, all behind one gateway interface.
          Models change. Providers come and go. The matter spine, the
          audit log, the privilege gate, the chronology surface. These
          survive any provider rotation.
        </p>
        <p className="prose-p">
          No dependencies on provider-specific features unless the gateway
          can offer a clean fallback.
        </p>
      </>
    ),
  },
  {
    id: "boring-stack",
    title: "Boring stack, ambitious composition",
    body: (
      <>
        <p className="prose-p">
          Python, FastAPI, Postgres, React 19, Tailwind. Nothing on this
          list surprises anyone in 2030.
        </p>
        <p className="prose-p">
          The novelty is the composition. Privilege-aware gateway.
          Adversarial premortem pipelines. Audit-first model dispatch.
          Matter folder represented as markdown on disk so it survives any
          future database migration. We optimise for the parts of the
          system that do not care which model you used in 2026 versus
          2030.
        </p>
      </>
    ),
  },
  {
    id: "solicitor-in-the-loop",
    title: "Solicitor-in-the-loop, permanently",
    body: (
      <>
        <p className="prose-p">
          Every output is a draft. A qualified solicitor reviews,
          verifies, and takes professional responsibility.
        </p>
        <p className="prose-p">
          Drafts and accelerants, yes. Substitutes, no. A constraint on
          the product surface, not an aspiration.
        </p>
      </>
    ),
  },
  {
    id: "what-this-is-not",
    title: "What this release is not",
    body: (
      <>
        <p className="prose-p">
          This is not a law firm. It is not legal advice. It is not for live
          client matters. The hosted site is a limited evaluation environment,
          and real model calls require the operator's own provider keys.
        </p>
        <p className="prose-p">
          The current release proves the matter workspace, modules, privilege
          posture, capability gates, BYO keys, and audit trail. The
          supervisor-gate primitive is the next step, not a claim already made.
        </p>
        <p className="prose-p">
          Some hard problems are deliberately staged: durable job recovery,
          formal WORM database roles, richer evals, hallucination controls,
          prompt shrouding, and production-grade regulator reconstruction.
          Those are engineering gates, not ignored problems.
        </p>
      </>
    ),
  },
  {
    id: "uk-jurisdiction",
    title: "UK-jurisdiction-aware, not US-shaped",
    body: (
      <>
        <p className="prose-p">
          England &amp; Wales has its own procedural shape, its own
          statutory scaffolding, its own privilege model. Most legal AI is
          US-shaped because most legal AI capital is American.
        </p>
        <p className="prose-p">
          Translating US patterns into Anglicised vocabulary produces
          software that breaks on the procedural details. We build for UK
          practice on UK rules.
        </p>
      </>
    ),
  },
  {
    id: "self-host",
    title: "Self-host without limits",
    body: (
      <>
        <p className="prose-p">
          The core is Apache-2.0 forever. Self-host on any infrastructure.
          Run any models. Fork. Modify.
        </p>
        <p className="prose-p">
          We do not gate the matter spine, audit log, plugin bridge, or
          any v0.1 module behind a commercial tier. If a commercial tier
          ever exists, it sells managed operations and certifications. Not
          functionality.
        </p>
      </>
    ),
  },
  {
    id: "wont-do",
    title: "What we won't do",
    body: (
      <>
        <ul className="list-none space-y-3 text-prose text-sm pl-0">
          <li className="flex items-start gap-4">
            <span className="font-bold text-ink">-</span>
            <span>Replace solicitor sign-off.</span>
          </li>
          <li className="flex items-start gap-4">
            <span className="font-bold text-ink">-</span>
            <span>Add a chatbot as the primary surface.</span>
          </li>
          <li className="flex items-start gap-4">
            <span className="font-bold text-ink">-</span>
            <span>
              Take dependencies on closed proprietary APIs without an open
              alternative.
            </span>
          </li>
          <li className="flex items-start gap-4">
            <span className="font-bold text-ink">-</span>
            <span>
              Ship a feature that breaks audit-row contract or
              privilege-posture dispatch.
            </span>
          </li>
        </ul>
        <p className="prose-p mt-8">Push back if we drift.</p>
      </>
    ),
  },
];

export function Manifesto() {
  return (
    <div className="max-w-page mx-auto">
      {/* Hero: eyebrow + title + opening tagline */}
      <section className="px-4 sm:px-6 md:px-16 lg:px-24 py-20 border-b border-rule">
        <div className="max-w-3xl">
          <div className="eyebrow text-muted mb-6">Manifesto</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight2 text-ink mb-6 leading-[1.05]">
            Commitments that don't move.
          </h1>
          <p className="text-xl text-muted leading-relaxed max-w-2xl">
            What we believe. How we built it. What we will not ship.
          </p>
          <div className="mt-8">
            <a
              href="#/"
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              ← Back to Legalise
            </a>
          </div>
        </div>
      </section>

      {/* Body: flowing sections, no sidebar TOC — manifesto reads as essay */}
      <main className="px-4 sm:px-6 md:px-16 lg:px-24 py-20">
        <article className="max-w-3xl mx-auto">
          {SECTIONS.map((section, idx) => (
            <section
              key={section.id}
              id={section.id}
              className={idx === 0 ? "mb-20" : "mb-20 pt-4"}
            >
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight2 text-ink mb-8 leading-tight">
                {section.title}
              </h2>
              {section.body}
            </section>
          ))}

          {/* Source-of-truth pointer */}
          <div className="mt-16 pt-12 border-t border-rule">
            <p className="text-sm text-muted mb-6">
              The canonical copy of the manifesto lives in the repository.
              When the source-of-truth file changes, this page is updated
              to match.
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href="https://github.com/b1rdmania/legalise/blob/master/docs/MANIFESTO.md"
                target="_blank"
                rel="noreferrer"
                className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
              >
                View source on GitHub
              </a>
              <a
                href="#/"
                className="text-sm text-muted hover:text-ink transition-colors inline-flex items-center"
              >
                ← Back to Legalise
              </a>
            </div>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
