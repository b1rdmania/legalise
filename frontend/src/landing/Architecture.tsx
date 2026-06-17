/**
 * /architecture — the MACHINE page, for the technical reader (firm IT /
 * security / infra, or a builder evaluating the design). The founder
 * narrative moved to /about; this page is grounded entirely in what the
 * code does, every claim sourced from the repo.
 *
 * Order: tight masthead → exhibit (why it matters) → what/why/how →
 * identity & access → inference gateway → privilege gate → anonymisation →
 * standing → admission → the refusal → the record → sign-off →
 * sovereignty → honesty (gaps stated, not buried) → colophon.
 * Prose-heavy by design; stamps and seal wayfinding per P35.
 *
 * Diagrams (all hand-drawn inline SVG, no deps): SpineDiagram (the flat
 * spine), RequestPathDiagram (nodes + the check at each, refusal in
 * seal), GatewayDiagram (the single-egress internals). Every section
 * that makes a code claim ends in a SourceRow of GitHub deep-links.
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
const BLOB = `${REPO}/blob/master`;

/** Deep-links to the files that actually implement each claim. The page
 * names a file in prose, then links straight to the line of code, so a
 * reader can check the claim instead of trusting it. */
const SRC = {
  gateway: `${BLOB}/backend/app/core/model_gateway.py`,
  gatewayCall: `${BLOB}/backend/app/core/model_gateway.py#L319`,
  gatewaySelect: `${BLOB}/backend/app/core/model_gateway.py#L281`,
  invokeTool: `${BLOB}/backend/app/core/model_gateway.py#L179`,
  providers: `${REPO}/tree/master/backend/app/providers`,
  anthropic: `${BLOB}/backend/app/providers/anthropic_provider.py`,
  ollama: `${BLOB}/backend/app/providers/ollama_provider.py`,
  openai: `${BLOB}/backend/app/providers/openai_provider.py`,
  postureGate: `${BLOB}/backend/app/core/posture_gate.py`,
  userKeys: `${BLOB}/backend/app/core/user_keys.py`,
  encryption: `${BLOB}/backend/app/core/encryption.py`,
  signing: `${BLOB}/backend/app/core/signing.py`,
  publishers: `${BLOB}/backend/app/core/publishers.py`,
  githubImport: `${BLOB}/backend/app/core/github_import.py`,
  auditChain: `${BLOB}/backend/app/core/audit_chain.py`,
  auditChainEndpoint: `${BLOB}/backend/app/api/matters.py#L663`,
  signoff: `${BLOB}/backend/app/core/signoff.py`,
  config: `${BLOB}/backend/app/core/config.py`,
  presidio: `${BLOB}/backend/app/modules/anonymisation/presidio_engine.py`,
  presidioPipeline: `${BLOB}/backend/app/modules/anonymisation/pipeline.py`,
  capabilities: `${BLOB}/backend/app/core/capabilities.py`,
  trustCeremony: `${BLOB}/backend/app/core/trust_ceremony.py`,
  matterAccess: `${BLOB}/backend/app/core/matter_access.py`,
};

/** A small inline "read the code" pointer, set right under the prose that
 * makes the claim. Monospace, seal underline on hover — looks like a
 * citation, behaves like one. */
function Src({ file, children }: { file: string; children: React.ReactNode }) {
  return (
    <a
      href={file}
      target="_blank"
      rel="noreferrer"
      className="tech-token text-[11px] text-muted underline underline-offset-4 decoration-rule transition-colors hover:text-seal hover:decoration-seal"
    >
      {children}
    </a>
  );
}

/** A cluster of source pointers under a section — "here is every file
 * behind what you just read." */
function SourceRow({ items }: { items: { label: string; file: string }[] }) {
  return (
    <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-rule/50 pt-4">
      <span className="tech-token text-[10px] uppercase tracking-[0.2em] text-muted">
        Read the source:
      </span>
      {items.map((it) => (
        <Src key={it.label} file={it.file}>
          {it.label}
        </Src>
      ))}
    </div>
  );
}

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

/** The request path drawn as nodes, top to bottom, with the checks
 * written beside each node and the one refusal branch in seal red. This
 * is the "what actually happens to a request" diagram. Same hand-drawn
 * idiom as SpineDiagram: ink hairlines, monospace labels, seal for the
 * gate and the refusal. */
function RequestPathDiagram() {
  const W = 720;
  const boxW = 300;
  const boxX = 60;
  const boxH = 40;
  const stepGap = 30;
  const y0 = 20;

  // Each node: label, the check it runs, and (optional) what it refuses.
  const nodes = [
    { label: "REQUEST", check: "authenticated session · HttpOnly cookie", refuse: null },
    { label: "MATTER", check: "owned by this user? cross-user → 404", refuse: null },
    {
      label: "THE GATE",
      check: "read posture from DB row, this session",
      refuse: "C_paused → refuse · 403 · struck audit row",
      seal: true,
    },
    { label: "INFERENCE GATEWAY", check: "decrypt your key at call time · single egress", refuse: null },
    { label: "PROVIDER", check: "Anthropic · Ollama (local) · stub", refuse: null },
    { label: "OUTPUT (DRAFT)", check: "nothing ships unreviewed", refuse: null },
    { label: "SIGN-OFF", check: "named human · optional four-eyes", refuse: null },
    { label: "THE RECORD", check: "hash-chained row · model + SHA-256 only", refuse: null, rail: true },
  ];

  const rowH = boxH + stepGap;
  const totalH = y0 + nodes.length * rowH;

  return (
    <figure className="mt-8 max-w-3xl border border-ink/70 bg-paper p-4">
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        role="img"
        aria-label="The request path: an authenticated request runs through matter ownership, the privilege gate (which can refuse), the inference gateway, a provider, a draft, human sign-off, and finally the hash-chained record"
        className="block w-full"
      >
        {nodes.map((n, i) => {
          const y = y0 + i * rowH;
          const cy = y + boxH / 2;
          const isSeal = Boolean(n.seal);
          return (
            <g key={n.label}>
              <rect
                x={boxX + 0.5}
                y={y + 0.5}
                width={boxW}
                height={boxH}
                fill="none"
                stroke={isSeal ? "#8B0000" : "#181818"}
                strokeWidth="1"
              />
              <text
                x={boxX + 14}
                y={cy + 4}
                fontSize="11"
                letterSpacing="1.5"
                fill={isSeal ? "#8B0000" : "#181818"}
                fontFamily="ui-monospace, monospace"
              >
                {n.label}
              </text>
              {/* the check, written to the right of the node */}
              <text
                x={boxX + boxW + 16}
                y={cy - 2}
                fontSize="8.5"
                fill="#6b6b63"
                fontFamily="ui-monospace, monospace"
              >
                {n.check}
              </text>
              {n.refuse && (
                <text
                  x={boxX + boxW + 16}
                  y={cy + 11}
                  fontSize="8.5"
                  fill="#8B0000"
                  fontFamily="ui-monospace, monospace"
                >
                  {n.refuse}
                </text>
              )}
              {/* connector down to the next node */}
              {i < nodes.length - 1 && (
                <line
                  x1={boxX + boxW / 2}
                  y1={y + boxH}
                  x2={boxX + boxW / 2}
                  y2={y + rowH}
                  stroke={isSeal ? "#8B0000" : "#181818"}
                  strokeWidth="1"
                  markerEnd="url(#arrowhead)"
                />
              )}
            </g>
          );
        })}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="7"
            markerHeight="7"
            refX="3.5"
            refY="3.5"
            orient="auto"
          >
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#181818" />
          </marker>
        </defs>
      </svg>
      <figcaption className="px-1 pt-3 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted">
        Fig. 07 · The request path · what runs, and what is checked, at every node
      </figcaption>
    </figure>
  );
}

/** The inference gateway, drawn from the inside: many callers, one box,
 * the key decrypted at the last moment, one wire out to a provider. The
 * point of the picture is the single egress — everything funnels through
 * one component before anything can leave. */
function GatewayDiagram() {
  const W = 720;
  const H = 320;
  const gx = 250;
  const gy = 70;
  const gw = 220;
  const gh = 180;

  const callers = ["chat turn", "a skill", "anonymiser fallback"];
  const providers = [
    { name: "Anthropic", note: "your key", keyed: true },
    { name: "Ollama (local)", note: "keyless", keyed: false },
    { name: "stub-echo", note: "dev only", keyed: false },
  ];

  return (
    <figure className="mt-8 max-w-3xl border border-ink/70 bg-paper p-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="The inference gateway: every caller funnels into one gateway component, which reads the privilege posture, decrypts the user's key at call time, and is the only component that talks to a model provider"
        className="block w-full"
      >
        {/* callers on the left */}
        {callers.map((c, i) => {
          const cy = 70 + i * 60;
          return (
            <g key={c}>
              <rect x={20} y={cy} width={150} height={36} fill="none" stroke="#181818" strokeWidth="1" />
              <text x={95} y={cy + 22} textAnchor="middle" fontSize="9" fill="#181818" fontFamily="ui-monospace, monospace">
                {c}
              </text>
              <line x1={170} y1={cy + 18} x2={gx} y2={gy + gh / 2} stroke="#9b9b93" strokeWidth="1" markerEnd="url(#gw-arrow)" />
            </g>
          );
        })}

        {/* the gateway box */}
        <rect x={gx} y={gy} width={gw} height={gh} fill="none" stroke="#181818" strokeWidth="1.5" />
        <text x={gx + gw / 2} y={gy + 24} textAnchor="middle" fontSize="11" letterSpacing="1.5" fill="#181818" fontFamily="ui-monospace, monospace">
          THE GATEWAY
        </text>
        {[
          "1 · read posture (DB)",
          "2 · C_paused → refuse",
          "3 · pick provider",
          "4 · decrypt key (now)",
          "5 · call · hash · audit",
        ].map((step, i) => (
          <text
            key={step}
            x={gx + 16}
            y={gy + 54 + i * 24}
            fontSize="9"
            fill={i === 1 ? "#8B0000" : "#181818"}
            fontFamily="ui-monospace, monospace"
          >
            {step}
          </text>
        ))}

        {/* the single egress line */}
        <line x1={gx + gw} y1={gy + gh / 2} x2={560} y2={gy + gh / 2} stroke="#181818" strokeWidth="1.5" markerEnd="url(#gw-arrow)" />
        <text x={(gx + gw + 560) / 2} y={gy + gh / 2 - 8} textAnchor="middle" fontSize="8" letterSpacing="1" fill="#8B0000" fontFamily="ui-monospace, monospace">
          ONLY WIRE OUT
        </text>

        {/* providers on the right */}
        {providers.map((p, i) => {
          const py = 60 + i * 64;
          return (
            <g key={p.name}>
              <rect
                x={560}
                y={py}
                width={140}
                height={42}
                fill="none"
                stroke={p.keyed ? "#181818" : "#9b9b93"}
                strokeWidth="1"
              />
              <text x={630} y={py + 18} textAnchor="middle" fontSize="9" fill="#181818" fontFamily="ui-monospace, monospace">
                {p.name}
              </text>
              <text x={630} y={py + 32} textAnchor="middle" fontSize="7.5" fill="#6b6b63" fontFamily="ui-monospace, monospace">
                {p.note}
              </text>
            </g>
          );
        })}

        <defs>
          <marker id="gw-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#181818" />
          </marker>
        </defs>
      </svg>
      <figcaption className="px-1 pt-3 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted">
        Fig. 08 · The inference gateway · many callers in, one wire out
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
  return (
    <div className="max-w-page mx-auto">
      <div className="px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
        {/* Masthead — the monument carries the page alone (P30). The
            technical reader's orientation, not the founder's story (that
            lives on /about). */}
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
          <div className="mt-6 max-w-xl space-y-4 text-sm leading-relaxed text-prose">
            <p>
              This page is for the technical reader — the firm's IT,
              security, or infrastructure person, or a builder evaluating the
              design. It describes the system as it is actually built:
              identity, the inference gateway, the privilege gate, the
              record. Every claim here is grounded in the code. Where the
              page names a file, it links straight to it on GitHub, so you
              can check the claim instead of trusting it. The open gaps are
              listed at the end, not buried.
            </p>
            <p>
              The personal account of why this exists lives on{" "}
              <a
                href="/about"
                className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
              >
                the about page
              </a>
              . What follows is the machine.
            </p>
          </div>
        </header>

        {/* Exhibit: the cost of unsupervised capability, already in the
            law reports. Early by design — this is why the page exists. */}
        <section className="mt-16">
          <SectionRule
            label={<span className="text-seal">Exhibit · the cost of capability alone</span>}
            right="1,600 cases"
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
                1,600 legal decisions
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
            caption="The hallucination case database · damiencharlotin.com · 1,600 decisions and counting"
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

        <Section label="03 · How it is built" title="Boring stack, ambitious composition.">
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
              The spine above is the shape. The diagram below is the
              detail: the same path drawn as the nodes a request passes
              through, with the check each node runs written beside it. Read
              it top to bottom. A request only reaches the next node if the
              current one lets it.
            </p>
          </Prose>
          <RequestPathDiagram />
          <Prose>
            <p>
              Documents belong to a matter. The gate reads the matter's
              privilege posture from the database before any model is
              called, and a paused matter stops the request there. The model
              runs on your own keys. The output is a draft until a person
              signs it. Every node writes to the same hash-chained,
              exportable record, refusals included. Skills arrive only by
              import: from the Lawve catalogue or any public GitHub
              repository, read at a pinned commit and admitted through a
              ceremony.
            </p>
            <p>
              The rest of the page walks each node and links the file that
              implements it. If a claim here is wrong, the code is one click
              away.
            </p>
          </Prose>
          <SourceRow
            items={[
              { label: "model_gateway.py", file: SRC.gateway },
              { label: "posture_gate.py", file: SRC.postureGate },
              { label: "audit_chain.py", file: SRC.auditChain },
              { label: "signoff.py", file: SRC.signoff },
              { label: "github_import.py", file: SRC.githubImport },
            ]}
          />
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

        <Section label="04 · Identity and access" title="Per-user matters, real session revocation, an audit row per action.">
          <Prose>
            <p>
              Authentication is fastapi-users with cookie sessions
              (HttpOnly, Secure, SameSite=Lax) backed by a server-side{" "}
              <code className="tech-token">access_token</code> table, so
              sign-out is a real server-side revocation, not just a cleared
              cookie. Passwords hash under the library's Argon2/bcrypt
              scheme. Email verification runs through Resend; password reset
              is a one-time, short-lived token. The unauthenticated surface
              is per-IP rate limited at the application layer — five
              registrations and ten verification or reset requests per IP per
              hour, counted from a sliding window recomputed from Postgres so
              the limit holds across instances. The first rejection in a
              window writes an <code className="tech-token">auth.rate_limited</code>{" "}
              row.
            </p>
            <p>
              Matters are scoped per user, not globally. A matter slug is
              unique per <code className="tech-token">(slug, created_by_id)</code>,
              so two users can each hold a matter at the same slug without
              collision. A cross-user read returns 404, not 403, so user A
              cannot even learn that user B holds a matter at a given slug.
              Access decisions, mutations, and model calls each land as their
              own audit row.
            </p>
            <p>
              Be precise about the limits: this is the sole-practitioner and
              small-firm case. There is no organisation or team object, no
              SSO, no MFA, and one deployment is one workspace. Those are v0.2
              and enterprise milestones, not shipped. The honesty section
              repeats this; it is a v0.2 item and the page says so.
            </p>
          </Prose>
          <div className="mt-6">
            <Stamp rotate={-5}>Auth · v0.2 hardening</Stamp>
          </div>
          <SourceRow
            items={[
              { label: "matter_access.py", file: SRC.matterAccess },
              { label: "config.py", file: SRC.config },
              { label: "AUTH.md", file: `${BLOB}/docs/AUTH.md` },
            ]}
          />
        </Section>

        <Section label="05 · The inference gateway" title="One egress boundary. Your keys, encrypted, decrypted only at call time.">
          <Prose>
            <p>
              Every model call goes through one gateway. Providers
              (Anthropic, OpenAI, local Ollama, and a keyless deterministic
              stub for keyless dev) are registered behind a single interface,
              and the gateway is the only component that talks to a model
              provider. That makes it the single egress boundary: if you want
              to know what can leave for a third party, you read one file.
            </p>
            <p>
              Keys are bring-your-own. Each user stores an Anthropic or OpenAI
              key under Settings, held AES-256-GCM-encrypted — ciphertext,
              a 12-byte nonce, and the auth tag, serialised together — under
              a master key supplied to the backend by environment variable.
              Production refuses to boot if that master key is missing,
              wrongly sized, or not valid hex. A stored key is decrypted only
              at call time, inside the gateway, and never enters logs, audit
              rows, or the prompt-response payload. If a user has no key for a
              keyed provider, the call fails closed with a structured error
              and an audit row; there is no silent server-key fallback in
              production.
            </p>
            <p>
              The honest cost: we do not pay for, sit between, or resell
              model usage. The hosted site is an evaluation environment, and
              real calls require your own provider credentials.
            </p>
          </Prose>
          <GatewayDiagram />
          <Prose>
            <p>
              Inside the box, every call runs the same five steps in order.
              Read the matter's posture from the database. Refuse outright if
              the matter is paused. Pick the provider for the requested
              model. Decrypt your key, at this moment and not before. Make
              the call, hash the prompt and response, write the audit row.
              The decrypted key lives only for the length of the call and
              never touches a log or the audit row.
            </p>
            <p>
              One small thing that matters more than it looks: the gateway
              maps the model name to a provider in one helper, used both by
              the gateway and by any pre-flight check. So a check can never
              be stricter than the call it is checking. If a renamed model id
              would change routing, both sides change together.
            </p>
          </Prose>
          <SourceRow
            items={[
              { label: "ModelGateway.call", file: SRC.gatewayCall },
              { label: "_select_provider", file: SRC.gatewaySelect },
              { label: "user_keys.py", file: SRC.userKeys },
              { label: "encryption.py", file: SRC.encryption },
              { label: "providers/", file: SRC.providers },
            ]}
          />
        </Section>

        <Section label="06 · The privilege gate" title="The matter's posture is read from the database before every call.">
          <Prose>
            <p>
              Every matter carries one of three privilege postures.{" "}
              <code className="tech-token">A_cleared</code> permits all
              providers. <code className="tech-token">B_mixed</code>, the
              default, prefers a local Ollama provider when one is registered
              and a frontier model was requested, and otherwise permits the
              frontier providers under their no-training contractual posture.{" "}
              <code className="tech-token">C_paused</code> permits no model
              call at all.
            </p>
            <p>
              The critical property is where the posture is read. The gateway
              reads it from the matter row, in the same session as the
              request, never from a value the caller passed in. That closes
              the race where a caller reads <code className="tech-token">B_mixed</code>,
              an administrator flips the matter to{" "}
              <code className="tech-token">C_paused</code>, and the stale
              value is used for dispatch. On a paused matter the gateway
              raises before any network traffic. The same gate guards
              posture-gated tools, and a posture-gated tool with no matter
              scope is refused rather than allowed to bypass the check by
              omitting its matter. The change of posture is itself audited.
            </p>
            <p>
              The gate is two layers, not one. The gateway blocks model
              calls on a paused matter. A second gate,{" "}
              <code className="tech-token">check_posture</code>, runs before
              any capability does, so even a non-model action is stopped on a
              paused matter, and a non-solicitor on a privileged matter gets a
              posture-shaped refusal rather than a grant-shaped one. The whole
              policy is six lines of a constant table in one file. Changing it
              is a reviewable diff, not a config knob someone can flip in
              production.
            </p>
            <p>
              Skill-attributed calls carry a further check: a call made on
              behalf of a <code className="tech-token">(plugin, skill)</code>{" "}
              pair must hold the{" "}
              <code className="tech-token">model.invoke</code> grant for that
              pair, and a tool that writes a privileged resource needs its
              matching write capability too. A skill runs because it was
              admitted, not because it is clever. A posture-gated tool called
              with no matter is refused outright, so the paused-matter check
              cannot be dodged by leaving the matter off the request.
            </p>
          </Prose>
          <SourceRow
            items={[
              { label: "posture_gate.py", file: SRC.postureGate },
              { label: "gateway.call (DB read)", file: SRC.gatewayCall },
              { label: "invoke_tool", file: SRC.invokeTool },
              { label: "capabilities.py", file: SRC.capabilities },
            ]}
          />
        </Section>

        <Section label="07 · Anonymisation" title="An optional pseudonymisation layer, with its limits stated.">
          <Prose>
            <p>
              Before sending a document body to a model, a solicitor can
              pseudonymise it. The layer runs Microsoft Presidio with three
              UK-specific recognisers added on top of the spaCy defaults:
              postcodes, National Insurance numbers, and GBP amounts — the
              shapes the base recognisers miss in UK correspondence. Detected
              spans are replaced with stable tokens (PARTY_1, ORG_1, and so
              on) and the mapping is stored so re-runs are idempotent.
            </p>
            <p>
              Two honest limits. First, Presidio is an optional install: the
              slim deployment image does not ship it, and a real run in that
              state fails clean with install guidance rather than silently
              passing text through. Second, in <code className="tech-token">auto</code>{" "}
              mode, when Presidio's recall on a long document looks low, the
              layer can fall back to a Claude pass through the same gateway —
              which means that fallback is a model call, under the same
              privilege gate and the same audit row. Pseudonymisation reduces
              what a provider sees; it is not a guarantee, and the gate above
              it still decides whether the provider may be called at all.
            </p>
          </Prose>
          <SourceRow
            items={[
              { label: "presidio_engine.py", file: SRC.presidio },
              { label: "pipeline.py", file: SRC.presidioPipeline },
            ]}
          />
        </Section>

        <Section label="08 · Standing" title="Capability is a commodity. Standing is the institution.">
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

        <Section label="09 · Admission" title="Skills arrive by ceremony, not by upload.">
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
              Signatures come in two honest grades.{" "}
              <code className="tech-token">verified</code> means the manifest
              carries an ed25519 signature that cryptographically checks out
              against the publisher's registered public key — only the holder
              of that private key could have produced it.{" "}
              <code className="tech-token">structure_verified</code> means
              shape only: the signature is present and plausible, the
              publisher is in the registry, but no cryptography was performed
              and a well-formed forgery would pass. The status string says
              exactly which check ran, and a publisher with no registered key
              can never reach <code className="tech-token">verified</code>.
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
          <Prose>
            <p>
              The two grades come from one rule, in one file. If the
              publisher has a registered ed25519 public key, the signature is
              checked against it with real cryptography, and the result is{" "}
              <code className="tech-token">verified</code> or{" "}
              <code className="tech-token">invalid</code>. If there is no
              registered key, the verifier checks shape only and reports{" "}
              <code className="tech-token">structure_verified</code>. The name
              is deliberately not <code className="tech-token">verified</code>,
              because shape is not proof. The signing input is a canonical
              hash of the manifest with the signature fields stripped, so the
              exact bytes that get signed are pinned and a re-serialisation
              cannot change them.
            </p>
          </Prose>
          <SourceRow
            items={[
              { label: "signing.py", file: SRC.signing },
              { label: "publishers.py", file: SRC.publishers },
              { label: "github_import.py", file: SRC.githubImport },
              { label: "trust_ceremony.py", file: SRC.trustCeremony },
              { label: "TRUST.md", file: `${BLOB}/docs/TRUST.md` },
            ]}
          />
        </Section>

        <Section label="10 · The refusal" title="A register that testifies against itself is evidence.">
          <Prose>
            <p>
              The gate from section 06 is only worth something if its
              refusals are kept and visible. When a paused matter refuses a
              privileged read, the refusal lands in the demo's record as a
              struck entry — same row anatomy, same ledger, seal red — rather
              than vanishing into a log nobody reads.
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

        <Section label="11 · The record" title="Audit is not the product. Audit is the receipt.">
          <Prose>
            <p>
              Every model call writes an audit row carrying the model used,
              the SHA-256 hashes of the prompt and response (never the text
              itself), the token count, and the latency. Every matter
              mutation writes a row too. The rows are hash-chained: an
              append-only chain table links each entry to the previous one
              per matter, so the chain's head hash is the matter's
              fingerprint and commits to every entry beneath it. Publish that
              head — in an email, a filing, a public log — and anyone can
              later prove the trail was not rewritten, because a changed trail
              no longer recomputes to the same head. The verify endpoint{" "}
              <code className="tech-token">GET /api/matters/&#123;slug&#125;/audit/chain</code>{" "}
              recomputes every link from the raw rows and reports the head
              plus any breaks. A record you have to take our word for is not a
              record.
            </p>
            <p>
              The table is append-only by enforcement, in two layers: a
              Postgres trigger rejects UPDATE and DELETE on every row whatever
              role issues them, and a database role split removes
              UPDATE/DELETE on the audit table from the application role by
              grant. The role split is asserted in CI on every build — the
              build fails if the app role can mutate an audit row — and
              turning it on for the hosted deployment is a connection-string
              switch, documented in Operations. That switch is not yet flipped
              on the hosted stack; the honesty section says so.
            </p>
            <p>
              The working pack carries the outputs, the source context, the
              signatures, and the audit trail. It is what a solicitor uses to
              answer the questions a regulator, a client, or opposing counsel
              will eventually ask: what did your AI see, when, under what
              protection, and what did it produce.
            </p>
            <p>
              One detail for the careful reader. The chain is written by a
              database trigger, in PL/pgSQL, the moment a row lands. The
              verify endpoint recomputes the same hashes in Python from the
              raw rows. Two independent implementations of one recipe, and CI
              fails the build if they ever disagree. A hash chain whose only
              checker is the same code that wrote it would prove nothing.
            </p>
          </Prose>
          <SourceRow
            items={[
              { label: "audit_chain.py", file: SRC.auditChain },
              { label: "GET /audit/chain", file: SRC.auditChainEndpoint },
              { label: "SECURITY.md", file: `${BLOB}/SECURITY.md` },
              { label: "OPERATIONS.md", file: `${BLOB}/docs/OPERATIONS.md` },
            ]}
          />
          <Figure
            src="/architecture/fig-refusal-record.png"
            alt="The matter record with the blocked entry struck in seal red and its detail drawer open, leading with a plain-English account"
            index={5}
            caption="The blocked entry on the record, struck and kept"
          />
        </Section>

        <Section label="12 · Sign-off" title="Supervised practice, with a track record.">
          <Prose>
            <p>
              Every output is a draft until a named human reviews it, changes it
              where needed, and signs what they are prepared to stand behind.
              Edits arrive as inline tracked changes: deletions struck,
              insertions underlined, each acceptance or rejection its own audit
              row. A firm that wants a four-eyes rule can deploy with{" "}
              <code className="tech-token">SIGNOFF_AUTHOR_MUST_DIFFER</code>{" "}
              set, which blocks an author from signing their own output
              (rejecting it stays allowed). It is off by default so a sole
              practitioner can still sign their own work as themselves.
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
          <Prose>
            <p>
              The signature pins the exact output the signer saw: it is taken
              over a SHA-256 of the artifact, so a signature can never quietly
              come to mean a different document. The record also notes when a
              sign-off lands implausibly fast for the length of the output,
              measured against a rough ten-minutes-per-thousand-words
              baseline. It flags, it does not block. The register testifies;
              it does not nanny.
            </p>
          </Prose>
          <SourceRow
            items={[
              { label: "signoff.py", file: SRC.signoff },
              { label: "SIGNOFF_AUTHOR_MUST_DIFFER", file: SRC.config },
            ]}
          />
        </Section>

        <Section label="13 · Sovereignty and deployment" title="Open source, your own keys, a path to fully local.">
          <Prose>
            <p>
              The architecture was drawn model-agnostic from the start: the
              gateway treats providers as commodities, and the original build
              ran against local models, GPT, and Claude interchangeably. For
              the demonstration that breadth earned less than it cost, so the
              working build is honed tightly to Anthropic and the Claude
              skills format. The known cost of that choice: demo traffic
              touches Anthropic's commercial API, under its no-training
              contractual terms, with the data questions that carries. It is a
              proof of concept and the trade is deliberate.
            </p>
            <p>
              The project is Apache-2.0 and self-hostable. Backend (Fly{" "}
              <code className="tech-token">lhr</code>) and Postgres (Neon
              London) sit in the UK; R2 object storage is EU-placed, not
              UK-specific, and we do not claim end-to-end UK residency because
              it is not literally true. A self-host operator owns the master
              encryption key. Because <code className="tech-token">B_mixed</code>{" "}
              prefers a registered local Ollama provider, a firm building a
              shell around this substrate can tune it to run entirely on local
              models as they strengthen — at which point it is viable for no
              client data to leave the building, and a local provider is not a
              third party for privilege at all.
            </p>
          </Prose>
        </Section>

        <Section label="14 · Honesty" title="What is not solved.">
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

        <Colophon>
          The register does not say what counsel can do. It says what counsel
          has done under supervision.
        </Colophon>

        <Footer />
      </div>
    </div>
  );
}
