/**
 * /architecture — the manifesto page (DESIGN.md P28).
 *
 * One continuous read in the register idiom: thesis, the profession
 * mapping, the matter spine, admission, the gate, the record, sign-off,
 * the stack, and an honesty section. Prose-heavy by design — this page
 * argues, it does not advertise. Doc deep-links live here as citations.
 */

import { Footer } from "../ui/Footer";
import {
  CertCard,
  CertEyebrow,
  Colophon,
  LedgerRow,
  SectionRule,
} from "../ui/certificate";

const REPO = "https://github.com/b1rdmania/legalise";

/** The regulated-profession mapping — the page's one certificate. */
const MAPPING: { primitive: string; counterpart: string }[] = [
  { primitive: "Skill manifest", counterpart: "Practicing certificate" },
  { primitive: "Trust ceremony", counterpart: "Instructing counsel" },
  { primitive: "Permission bands", counterpart: "Rights of audience" },
  { primitive: "Audit chain", counterpart: "Disciplinary record" },
  { primitive: "Professional sign-off", counterpart: "Supervised practice" },
];

const CITATIONS: { label: string; href: string }[] = [
  { label: "Trust", href: `${REPO}/blob/master/docs/TRUST.md` },
  { label: "Security", href: `${REPO}/blob/master/SECURITY.md` },
  { label: "Manifesto", href: `${REPO}/blob/master/docs/MANIFESTO.md` },
  { label: "Operations", href: `${REPO}/blob/master/docs/OPERATIONS.md` },
  { label: "Roadmap", href: `${REPO}/blob/master/docs/ROADMAP.md` },
  { label: "Apache 2.0", href: `${REPO}/blob/master/LICENSE` },
];

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 max-w-3xl space-y-5 text-base leading-relaxed text-prose">
      {children}
    </div>
  );
}

function Section({
  label,
  right,
  title,
  children,
}: {
  label: string;
  right?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16">
      <SectionRule label={label} right={right} />
      <h2 className="mt-6 text-2xl md:text-3xl font-bold tracking-tight2 text-ink leading-tight max-w-2xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Architecture() {
  return (
    <div className="max-w-page mx-auto">
      <div className="px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
        {/* Masthead — the monument carries the page alone (P30). */}
        <header>
          <h1 className="font-redaction35 text-[52px] sm:text-[72px] leading-none tracking-tight2 text-ink">
            Standing
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-muted">
            over capability
          </p>
          <p className="mt-8 max-w-xl text-sm leading-relaxed text-prose">
            This page sets out how Legalise is built and why. Read it in one
            sitting. The short version: every legal AI product can do the
            work. Almost none can prove what it did, under whose supervision,
            and what it was refused.
          </p>
        </header>

        <Section label="01 · The thesis" title="Capability is a commodity. Standing is the institution.">
          <Prose>
            <p>
              The frontier models do the legal reasoning. They are available to
              everyone, including your opponent. Within a year of any capability
              shipping, it is table stakes. What does not commodify is the
              apparatus around the work: who was permitted to do it, what they
              were permitted to see, who reviewed it, who signed it, and what
              the record says when someone asks later.
            </p>
            <p>
              The legal profession solved this problem centuries ago. Not with
              better lawyers. With standing: a practicing certificate, rights
              of audience, a disciplinary record, supervised practice. Legalise
              applies that structure to AI counsel. The product is not the model.
              The product is the register.
            </p>
          </Prose>
        </Section>

        <Section label="02 · The mapping" title="The primitives are the profession's, made mechanical.">
          <Prose>
            <p>
              Each primitive in the system is the direct, enforced counterpart
              of an institution the profession already trusts:
            </p>
          </Prose>
          <div className="mt-8 max-w-xl">
            <CertCard>
              <CertEyebrow left="Schedule 01" right="The correspondence" />
              <dl className="mt-4 space-y-1 text-[11px] text-muted">
                {MAPPING.map((m) => (
                  <LedgerRow key={m.primitive} label={m.primitive} tone="ink">
                    {m.counterpart}
                  </LedgerRow>
                ))}
              </dl>
            </CertCard>
          </div>
          <Prose>
            <p>
              A skill cannot run because it is clever. It runs because it was
              admitted, and everything it does afterwards lands in a record it
              cannot edit.
            </p>
          </Prose>
        </Section>

        <Section label="03 · The matter spine" title="Matter-first, not prompt-first.">
          <Prose>
            <p>
              The unit of work is not a prompt. It is a matter. Documents,
              skills, model calls, outputs, signatures, and the record all hang
              off one matter, owned by one user, governed by one privilege
              posture, written into one audit log. Outside that frame the legal
              use case stops being legal. It is a generic question that happens
              to mention the law.
            </p>
            <p>
              This is the lesson of Heppner, the privilege ruling that made it
              concrete: a firm using AI must show, later and on demand, what
              privileged material the AI saw, who held it, and under what
              protection. That answer has to be structural. It cannot be
              reconstructed from a chat history.
            </p>
          </Prose>
        </Section>

        <Section label="04 · Admission" title="Skills arrive by ceremony, not by upload.">
          <Prose>
            <p>
              Any public GitHub repository with a SKILL.md can be proposed. The
              importer reads it at a pinned commit, sniffs the licence, and
              produces a governed draft. Admission is a live scan of manifest
              structure, permission declarations, and source integrity, halting
              at one human decision: approve and enable, or refuse. The record
              keeps both outcomes with the same fidelity.
            </p>
            <p>
              Publishers can sign manifests with ed25519 keys held in the
              registry. A verified signature is a higher grade of standing than
              structural checks alone: the difference between a document that
              parses and a document someone put their name to.
            </p>
          </Prose>
        </Section>

        <Section label="05 · The gate" title="The gate refuses, and the record keeps the refusal.">
          <Prose>
            <p>
              Every matter carries a privilege posture: a declared state that
              says whether its material is cleared for cloud providers, mixed,
              or paused while privilege is live. The gateway reads it before
              every model call and decides which providers, if any, can serve
              the call. When a skill attempts a read the posture forbids, the
              gate refuses, and the refusal lands in the record as a struck
              entry: same row anatomy, same ledger, seal red.
            </p>
            <p>
              The refusal is the soul of the system. A register that only
              records approvals is advertising. A register that testifies
              against itself when it must is evidence. You can watch this
              happen in the demo: the paused matter refuses a privileged
              read, in public, and the record keeps it.
            </p>
          </Prose>
        </Section>

        <Section label="06 · The record" title="Audit is not the product. Audit is the receipt.">
          <Prose>
            <p>
              Every model call writes an audit row. Every matter mutation writes
              an audit row. The rows are hash-chained, and a third party can
              verify the chain against the matter's export. There is an
              endpoint for exactly that, because a record you have to take our
              word for is not a record.
            </p>
            <p>
              The working pack carries the outputs, the source context, the
              signatures, and the audit trail. It is what a solicitor uses to
              answer the questions a regulator, a client, or opposing counsel
              will eventually ask: what did your AI see, when, under what
              protection, and what did it produce.
            </p>
          </Prose>
        </Section>

        <Section label="07 · Sign-off" title="Supervised practice, with a track record.">
          <Prose>
            <p>
              Every output is a draft until a named human reviews it, changes it
              where needed, and signs what they are prepared to stand behind.
              Edits arrive as inline tracked changes: deletions struck,
              insertions underlined, each acceptance or rejection its own audit
              row. The system can require that the signer is not the author.
            </p>
            <p>
              Sign-off decisions accumulate per skill: signed, signed with
              observations, rejected. A supervised track
              record generated by the architecture itself. Not a benchmark, a
              practice history. Closed platforms have not published theirs,
              and have no incentive to start.
            </p>
          </Prose>
        </Section>

        <Section label="08 · The stack" title="Boring stack, ambitious composition." >
          <Prose>
            <p>
              Python, FastAPI, Postgres, React. Nothing on this list will
              surprise anyone in 2030, which is the point. The novelty is the
              composition, and the parts that matter survive any provider
              rotation.
            </p>
          </Prose>
          <div className="mt-10 max-w-3xl">
            <SectionRule label="The documents" right="On the record" />
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {CITATIONS.map((c) => (
                <a
                  key={c.label}
                  href={c.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs uppercase tracking-[0.18em] text-muted underline underline-offset-4 decoration-rule transition-colors hover:text-seal hover:decoration-seal"
                >
                  {c.label}
                </a>
              ))}
            </div>
          </div>
        </Section>

        <Section label="09 · Honesty" title="What is not solved.">
          <Prose>
            <p>
              The hosted site is an evaluation environment, not a practice
              environment. It is not a law firm and it does not give legal
              advice. Real model calls require your own provider keys; we do
              not pay for, or sit between, your model usage.
            </p>
            <p>
              One deployment is one workspace. Multi-tenancy is deliberately
              out of scope for the beta. Firm-grade isolation deserves its own
              design pass, not a column on a table. Manifest signing is young:
              the scheme works, the web of trust around it does not exist yet.
              Durable job recovery, formal WORM storage roles, and
              production-grade regulator reconstruction are staged engineering
              gates, not solved problems.
            </p>
            <p>
              And the models hallucinate. Citations give the reviewer somewhere
              concrete to check; they are not a guarantee. The system makes
              review explicit and recorded. It does not make review optional,
              and it never will. That constraint is the product surface, not
              an aspiration.
            </p>
          </Prose>
        </Section>

        <Colophon>
          The register does not say what counsel can do. It says what counsel
          has done under supervision.
        </Colophon>

        <Footer />
      </div>
    </div>
  );
}
