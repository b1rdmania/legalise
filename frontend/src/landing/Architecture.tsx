/**
 * /architecture — the manifesto page (DESIGN.md P28, restructured P36).
 *
 * Plain before persuasive: what this is, why, how it is built — then
 * standing, design-and-data, admission, the gate, the record, sign-off,
 * honesty. Prose-heavy by design; stamps and seal wayfinding per P35.
 */

import { useState } from "react";
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

/** Rubber stamp — rotated, seal-inked, used only where something was
 * decided. The P35 "fun stuff": stamps, not decoration. */
function Stamp({ children, rotate = -6 }: { children: React.ReactNode; rotate?: number }) {
  return (
    <span
      className="inline-block border-2 border-seal px-3 py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-seal"
      style={{ transform: `rotate(${rotate}deg)` }}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/** Muted looping clip in figure chrome — the demo proving a section's
 * claim in motion. */
function VideoFigure({
  src,
  index,
  caption,
}: {
  src: string;
  index: number;
  caption: string;
}) {
  return (
    <figure className="mt-8 max-w-3xl border border-ink/70 bg-paper p-2">
      <video
        src={src}
        className="block w-full border border-rule/60"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        // React doesn't reliably write the muted ATTRIBUTE before the
        // autoplay policy check runs; set it imperatively so the clips
        // actually start.
        ref={(el) => {
          if (el) {
            el.muted = true;
            void el.play().catch(() => undefined);
          }
        }}
      />
      <figcaption className="px-1 pt-2 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted">
        <span className="text-seal">Fig. {String(index).padStart(2, "0")}</span> · {caption}
      </figcaption>
    </figure>
  );
}

/** Bordered figure with a clerk's caption — the page's only image chrome. */
function Figure({
  src,
  alt,
  index,
  caption,
}: {
  src: string;
  alt: string;
  index: number;
  caption: string;
}) {
  return (
    <figure className="mt-8 max-w-3xl border border-ink/70 bg-paper p-2">
      <img src={src} alt={alt} className="block w-full border border-rule/60" loading="lazy" />
      <figcaption className="px-1 pt-2 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted">
        <span className="text-seal">Fig. {String(index).padStart(2, "0")}</span> · {caption}
      </figcaption>
    </figure>
  );
}

/** The matter spine, drawn flat: six stations over one record rail.
 * Ink hairlines; the gate's tick is the one seal mark — refusals land
 * on the record like everything else. */
function SpineDiagram() {
  const stations = [
    "DOCUMENTS",
    "THE MATTER",
    "THE GATE",
    "THE MODEL",
    "OUTPUT",
    "SIGN-OFF",
  ];
  const W = 720;
  const boxW = 96;
  const boxH = 34;
  const y = 28;
  const railY = 132;
  const gap = (W - stations.length * boxW) / (stations.length - 1);
  return (
    <figure className="mt-8 max-w-3xl border border-ink/70 bg-paper p-4">
      <svg viewBox={`0 0 ${W} 170`} role="img" aria-label="The matter spine: documents, matter, gate, model, output, and sign-off, each writing to one hash-chained record" className="block w-full">
        {stations.map((label, i) => {
          const x = i * (boxW + gap);
          const cx = x + boxW / 2;
          const isGate = label === "THE GATE";
          return (
            <g key={label}>
              <rect
                x={x + 0.5}
                y={y + 0.5}
                width={boxW}
                height={boxH}
                fill="none"
                stroke={isGate ? "#8B0000" : "#181818"}
                strokeWidth="1"
              />
              <text
                x={cx}
                y={y + boxH / 2 + 3}
                textAnchor="middle"
                fontSize="9"
                letterSpacing="1.5"
                fill="#181818"
                fontFamily="ui-monospace, monospace"
              >
                {label}
              </text>
              {i < stations.length - 1 && (
                <line
                  x1={x + boxW}
                  y1={y + boxH / 2}
                  x2={x + boxW + gap}
                  y2={y + boxH / 2}
                  stroke="#181818"
                  strokeWidth="1"
                />
              )}
              {/* every station writes down to the record */}
              <line
                x1={cx}
                y1={y + boxH}
                x2={cx}
                y2={railY}
                stroke={isGate ? "#8B0000" : "#9b9b93"}
                strokeWidth="1"
                strokeDasharray={isGate ? undefined : "2 3"}
              />
            </g>
          );
        })}
        <text
          x={stations.indexOf("THE GATE") * (boxW + gap) + boxW / 2 + 6}
          y={railY - 8}
          fontSize="8"
          letterSpacing="1.2"
          fill="#8B0000"
          fontFamily="ui-monospace, monospace"
        >
          REFUSALS TOO
        </text>
        <line x1="0" y1={railY + 0.5} x2={W} y2={railY + 0.5} stroke="#181818" strokeWidth="1.5" />
        <text
          x={W / 2}
          y={railY + 22}
          textAnchor="middle"
          fontSize="9"
          letterSpacing="2"
          fill="#181818"
          fontFamily="ui-monospace, monospace"
        >
          THE RECORD · HASH-CHAINED · EXPORTABLE
        </text>
      </svg>
      <figcaption className="px-1 pt-3 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted">
        Fig. 02 · The matter spine · every station writes to one record
      </figcaption>
    </figure>
  );
}

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
      {/* P35: the schedule labels carry the seal — the page's wayfinding
          runs in oxblood. */}
      <SectionRule label={<span className="text-seal">{label}</span>} right={right} />
      <h2 className="mt-6 text-2xl md:text-3xl font-bold tracking-tight2 text-ink leading-tight max-w-2xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Architecture() {
  const [tab, setTab] = useState<"why" | "technical">("why");
  return (
    <div className="max-w-page mx-auto">
      <div className="px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
        {/* Masthead — the monument carries the page alone (P30). */}
        <header>
          <h1 className="font-redaction35 text-[52px] sm:text-[72px] leading-none tracking-tight2 text-ink">
            Standing
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-seal">
            over capability
          </p>
          <div className="mt-6">
            <Stamp>Open experiment</Stamp>
          </div>
        </header>

        {/* Why / Technical — one page, two readers. Why = the argument and
            what we're running at; Technical = the full build article. */}
        <nav className="mt-12 flex gap-1 border-b border-rule" aria-label="Architecture sections">
          {(
            [
              ["why", "Why"],
              ["technical", "Technical"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? "true" : undefined}
              className={
                "-mb-px border-b-2 px-4 py-3 text-[11px] uppercase tracking-[0.2em] transition-colors " +
                (tab === key
                  ? "border-seal text-ink font-semibold"
                  : "border-transparent text-muted hover:text-seal")
              }
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "why" && (
          <>
        {/* The founder note — why this exists and what we're running at. */}
        <div className="mt-12 max-w-xl space-y-4 text-sm leading-relaxed text-prose">
          <p>
            This started as an experiment on a problem that, possibly,
            nobody has. Regulators seem comfortable enough with the big
            AI-led platforms firms already use. To say nothing of the grey
            area of every other solicitor running litigation questions
            through a personal GPT or Claude account.
          </p>
          <p>
            The question I am actually chasing: what shape would AI take,
            integrated at the base of a new SRA-regulated firm, or a
            sandbox for one, that regulators and PI insurers would be
            comfortable with? And underneath that: where is AI strong,
            where is it weak, where must human expertise stay in the loop,
            and how is responsibility for the decisions that matter
            actually held?
          </p>
          <p>
            What I have built is bigger than I intended, because every
            stone I overturned needed more surface or more backend. It is
            not a finished product. It is an open experiment, and it
            welcomes contributors.
          </p>
          <p>
            As the field moves toward world models, local inference, and
            the stranger problems of aggregating knowledge, strategy, and
            intelligence, a genuinely interesting space is opening up: how
            experienced lawyers entwine with this technology.
          </p>
          <p>
            I am not a snake oil salesman, and I am not a legal domain
            expert. I am not looking for an unbounded consultancy
            retainer, and I will not be running Zoom training for your
            legal team. What I have is a keen sense of the limits and the
            possibilities of AI.
          </p>
          <p>
            The angle worth exploring: limited pilots, designed for
            regulatory approval, with monetisation potential.{" "}
            <a
              href="/about"
              className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
            >
              My DMs are open
            </a>
            .
          </p>
        </div>

        {/* Exhibit: the cost of unsupervised capability, already in the
            law reports. Early by design — this is why the page exists. */}
        <section className="mt-16">
          <SectionRule
            label={<span className="text-seal">Exhibit · the cost of capability alone</span>}
            right="1,500+ cases"
          />
          <Prose>
            <p>
              None of this is hypothetical. Damien Charlotin's database of
              AI hallucination cases has identified{" "}
              <a
                href="https://www.damiencharlotin.com/hallucinations/"
                target="_blank"
                rel="noreferrer"
                className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
              >
                1,500+ legal decisions
              </a>{" "}
              where generative AI put hallucinated content, typically fake
              citations, in front of a court. Lawyers are being sanctioned
              for unsupervised capability now, in public, with their names
              on the orders. Supervision is not a compliance garnish. It is
              the product.
            </p>
          </Prose>
          <Figure
            src="/architecture/fig-hallucinations.png"
            alt="Damien Charlotin's AI Hallucination Cases database: 1,600 legal decisions involving hallucinated AI content"
            index={1}
            caption="The hallucination case database · damiencharlotin.com · 1,500+ decisions and counting"
          />
        </section>

        <Section label="01 · What this is" title="A matter workspace where the AI works under supervision.">
          <Prose>
            <p>
              Legalise is an open-source workspace for legal AI work in
              England and Wales. A solicitor opens a matter, uploads its
              documents, and works in chat. The model answers with its
              sources attached, and it can run skills: small, vetted units
              of legal work. A letter before claim. A disclosure list. A
              summary of a witness statement.
            </p>
            <p>
              Every output is a draft until a named person reviews it,
              amends it with tracked changes, and signs it. Everything the
              system does, including what it refuses to do, lands on one
              tamper-evident record. That is the whole product: chat,
              governed skills, sign-off, and the record.
            </p>
          </Prose>
        </Section>

        <Section label="02 · Why" title="Because capability is not the hard part. Proof is.">
          <Prose>
            <p>
              The hard question in legal AI is not whether the model can do
              the work. It is whether a firm can show, later and on demand,
              what the AI saw, under whose supervision it acted, and who
              took responsibility for the output. Regulators and PI
              insurers think in those terms. So does Heppner, the privilege
              ruling that made it concrete: that answer has to be
              structural. It cannot be reconstructed from a chat history.
            </p>
            <p>
              The matter is the unit that makes proof possible. Documents,
              model calls, outputs, signatures, and the record all hang off
              one matter, owned by one user, governed by one privilege
              posture, written into one audit log. Outside that frame the
              legal use case stops being legal. It is a generic question
              that happens to mention the law.
            </p>
          </Prose>
        </Section>

          </>
        )}

        {tab === "technical" && (
          <>
        <Section label="01 · How it is built" title="Boring stack, ambitious composition.">
          <Prose>
            <p>
              Python, FastAPI, and Postgres behind. React in front. Nothing
              on that list will surprise anyone in 2030, which is the
              point: the novelty is the composition, and the parts that
              matter survive any provider rotation.
            </p>
          </Prose>
          <SpineDiagram />
          <Prose>
            <p>
              A request runs left to right. Documents belong to a matter.
              The gate reads the matter's privilege posture before any
              model is called. The model runs on your own keys. The output
              waits for human sign-off. And every station writes to the
              same hash-chained, exportable record, refusals included.
              Skills arrive only by import, from the Lawve catalogue or any
              public GitHub repository, read at a pinned commit and
              admitted through a ceremony.
            </p>
          </Prose>
          <div className="mt-10 max-w-3xl">
            <SectionRule label={<span className="text-seal">The documents</span>} right="On the record" />
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
          </>
        )}

        {tab === "why" && (
          <>
        <Section label="03 · Standing" title="Capability is a commodity. Standing is the institution.">
          <Prose>
            <p>
              The frontier models are available to everyone, including your
              opponent. What does not commodify is the apparatus around the
              work: who was permitted to do it, what they were permitted to
              see, who signed it, and what the record says when someone
              asks later. The profession solved this centuries ago, not
              with better lawyers but with standing: a practicing
              certificate, rights of audience, a disciplinary record,
              supervised practice. Legalise applies that structure to AI
              counsel. The mapping is literal:
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
          <Figure
            src="/architecture/fig-certificates.png"
            alt="Two skills rendered as certificates in the demo workspace, each declaring what it reads and writes"
            index={3}
            caption="Skills in a matter, rendered as their certificates"
          />
        </Section>

          </>
        )}

        {tab === "technical" && (
          <>
        <Section label="02 · Design and data" title="Model-agnostic by design. Claude-tight for the demo.">
          <Prose>
            <p>
              The architecture was drawn model-agnostic from the start. The
              gateway treats providers as commodities, and the original build
              ran against local models, GPT, DeepSeek, and Claude
              interchangeably. For the demonstration, that breadth added more
              complexity than it earned, so the working build is honed
              tightly to Anthropic and the Claude skills format.
            </p>
            <p>
              That choice has a known cost: demo traffic touches Anthropic's
              API, with the data questions that carries. This is a proof of
              concept and the trade is deliberate. A firm building a shell
              around this substrate can tune it to run entirely on local
              models as they strengthen. At that point it is viable for no
              client data to leave the building.
            </p>
          </Prose>
        </Section>

        <Section label="03 · Admission" title="Skills arrive by ceremony, not by upload.">
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
          {/* A real capability from examples/modules/contract_review —
              what a skill declares before it is allowed to exist. */}
          <div className="mt-8 max-w-3xl border border-ink/70 bg-paper p-2">
            <pre className="tech-token overflow-x-auto whitespace-pre border border-rule/60 bg-wash p-4 text-[11px] leading-5 text-prose">
{`{
  "id": "review",
  "kind": "skill",
  "scope": "matter",
  "reads":  ["matter.document.read"],
  "writes": ["matter.artifact.write"],
  "gates":  ["privilege_posture"],
  "model_access": "required",
  "external_network": false,
  "data_movement": { "local_only": true, "external_destinations": [] },
  "advice_tier_max": "draft_advice"
}`}
            </pre>
            <p className="px-1 pt-2 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted">
              A capability from the contract-review manifest · declared, checked, then admitted
            </p>
          </div>
        </Section>

        <Section label="04 · The gate" title="The gate refuses, and the record keeps the refusal.">
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
          <div className="mt-6">
            <Stamp rotate={-4}>Refused · gate held</Stamp>
          </div>
          <VideoFigure
            src="/architecture/clip-refusal.mp4"
            index={4}
            caption="The refusal, in conversation · pause, refusal, resume · live from the demo"
          />
        </Section>

        <Section label="05 · The record" title="Audit is not the product. Audit is the receipt.">
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
          <Figure
            src="/architecture/fig-refusal-record.png"
            alt="The matter record with the blocked entry struck in seal red and its detail drawer open, leading with a plain-English account"
            index={5}
            caption="The blocked entry on the record, struck and kept"
          />
        </Section>

        <Section label="06 · Sign-off" title="Supervised practice, with a track record.">
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
          <VideoFigure
            src="/architecture/clip-signature.mp4"
            index={6}
            caption="The signature · tracked changes, a named signer, output.signed on the ledger"
          />
        </Section>

        <Section label="07 · Honesty" title="What is not solved.">
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
            <p>
              If any of this is wrong, or you can break it, the repository is
              open:{" "}
              <a
                href={`${REPO}/issues`}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 decoration-rule transition-colors hover:text-seal hover:decoration-seal"
              >
                issues and contributions welcome
              </a>
              .
            </p>
          </Prose>
        </Section>

          </>
        )}

        <Colophon>
          The register does not say what counsel can do. It says what counsel
          has done under supervision.
        </Colophon>

        <Footer />
      </div>
    </div>
  );
}
