/**
 * /architecture — technical documentation for Legalise: what each subsystem
 * is, how it is built, and where in the repository to verify each claim.
 * Grounded entirely in the code on master; every code claim links to the file
 * that implements it.
 *
 * Diagrams are hand-drawn inline SVG, no deps: SpineDiagram (the matter
 * spine), RequestPathDiagram (the checks at each node), GatewayDiagram (the
 * single-egress internals).
 */

import { Footer } from "../ui/Footer";

const REPO = "https://github.com/b1rdmania/legalise";
const BLOB = `${REPO}/blob/master`;

/** Deep-links to the files that implement each claim. Prose names a file,
 * then links to the code so a reader can check the claim. */
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
  auditChainEndpoint: `${BLOB}/backend/app/api/audit.py#L247`,
  signoff: `${BLOB}/backend/app/core/signoff.py`,
  config: `${BLOB}/backend/app/core/config.py`,
  presidio: `${BLOB}/backend/app/modules/anonymisation/presidio_engine.py`,
  presidioPipeline: `${BLOB}/backend/app/modules/anonymisation/pipeline.py`,
  capabilities: `${BLOB}/backend/app/core/capabilities.py`,
  trustCeremony: `${BLOB}/backend/app/core/trust_ceremony.py`,
  matterAccess: `${BLOB}/backend/app/core/matter_access.py`,
};

/** An inline "read the code" link, monospace, set next to the claim. */
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

/** A cluster of source links under a section. */
function SourceRow({ items }: { items: { label: string; file: string }[] }) {
  return (
    <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-rule/50 pt-4">
      <span className="tech-token text-[10px] uppercase tracking-[0.2em] text-muted">
        Source:
      </span>
      {items.map((it) => (
        <Src key={it.label} file={it.file}>
          {it.label}
        </Src>
      ))}
    </div>
  );
}

/** Each section of this page → its canonical doc(s) in the repository. */
const DOC_MAP: { section: string; docs: { label: string; file: string }[] }[] = [
  {
    section: "Identity & access",
    docs: [{ label: "TRUST.md", file: `${BLOB}/docs/TRUST.md` }],
  },
  {
    section: "Inference gateway / keys",
    docs: [{ label: "TRUST.md", file: `${BLOB}/docs/TRUST.md` }],
  },
  {
    section: "Privilege gate",
    docs: [
      { label: "ARCHITECTURE.md", file: `${BLOB}/docs/ARCHITECTURE.md` },
      { label: "TRUST.md", file: `${BLOB}/docs/TRUST.md` },
    ],
  },
  {
    section: "Anonymisation",
    docs: [{ label: "TRUST.md", file: `${BLOB}/docs/TRUST.md` }],
  },
  {
    section: "Admission / signing",
    docs: [
      { label: "ARCHITECTURE.md", file: `${BLOB}/docs/ARCHITECTURE.md` },
      { label: "TRUST.md", file: `${BLOB}/docs/TRUST.md` },
    ],
  },
  {
    section: "The record",
    docs: [
      { label: "ARCHITECTURE.md", file: `${BLOB}/docs/ARCHITECTURE.md` },
      { label: "EVALUATING.md", file: `${BLOB}/docs/EVALUATING.md` },
    ],
  },
  {
    section: "Sign-off / output",
    docs: [
      { label: "ARCHITECTURE.md", file: `${BLOB}/docs/ARCHITECTURE.md` },
      { label: "EVALUATING.md", file: `${BLOB}/docs/EVALUATING.md` },
    ],
  },
  {
    section: "Supervised autonomy",
    docs: [{ label: "TRUST.md", file: `${BLOB}/docs/TRUST.md` }],
  },
  {
    section: "Compliance / regulatory",
    docs: [{ label: "REGULATORY_PLUMBING.md", file: `${BLOB}/REGULATORY_PLUMBING.md` }],
  },
  {
    section: "Claim boundary",
    docs: [{ label: "TRUST.md", file: `${BLOB}/docs/TRUST.md` }],
  },
  {
    section: "Threat model",
    docs: [{ label: "THREAT_MODEL.md", file: `${BLOB}/docs/THREAT_MODEL.md` }],
  },
  {
    section: "Top-level",
    docs: [
      { label: "ARCHITECTURE.md", file: `${BLOB}/docs/ARCHITECTURE.md` },
      { label: "EVALUATING.md", file: `${BLOB}/docs/EVALUATING.md` },
      { label: "ROADMAP.md", file: `${BLOB}/docs/ROADMAP.md` },
    ],
  },
];

/** Shipped-vs-deferred matrix. "shipped" = in the code on master; "deferred"
 * = designed/staged but not built; "accepted" = a deliberate trade. */
const STATUS_MATRIX: {
  capability: string;
  status: "shipped" | "deferred" | "accepted";
  verification: string;
}[] = [
  { capability: "Single-egress inference gateway", status: "shipped", verification: "model_gateway.py" },
  { capability: "Bring-your-own keys, encrypted at rest", status: "shipped", verification: "encryption.py · user_keys.py" },
  { capability: "Privilege gate read from DB per call", status: "shipped", verification: "posture_gate.py" },
  { capability: "Hash-chained audit, one-click verify", status: "shipped", verification: "audit_chain.py · GET /audit/verify" },
  { capability: "Named sign-off over artifact SHA-256", status: "shipped", verification: "signoff.py" },
  { capability: "Skill admission ceremony, two signature grades", status: "shipped", verification: "signing.py · trust_ceremony.py" },
  { capability: "Per-user matter isolation, session revocation", status: "shipped", verification: "matter_access.py · TRUST.md" },
  { capability: "Audit-role split asserted in CI", status: "shipped", verification: "SECURITY.md (build gate)" },
  { capability: "WORM role split enabled on the hosted deployment", status: "shipped", verification: "verify-worm-role-split.sh · TRUST.md" },
  { capability: "Deterministic evals: grounding, refusal, chain integrity", status: "shipped", verification: "evals/agent-kit · agent_evals.py" },
  { capability: "Retention enforcement (opt-in scheduled sweep)", status: "shipped", verification: "retention_sweep.py" },
  { capability: "Organisation / team / SSO / MFA", status: "deferred", verification: "TRUST.md · ROADMAP.md" },
  { capability: "Multi-tenancy (one deploy = one workspace today)", status: "deferred", verification: "ROADMAP.md" },
  { capability: "Manifest web-of-trust / publisher registry at scale", status: "deferred", verification: "TRUST.md" },
  { capability: "Durable job recovery, regulator reconstruction", status: "deferred", verification: "ROADMAP.md" },
  { capability: "SBOM / SLSA / signed images / SOC 2 / ISO", status: "deferred", verification: "not present — roadmap only" },
  { capability: "Hosted demo touches Anthropic commercial API", status: "accepted", verification: "TRUST.md (no-training terms)" },
  { capability: "R2 storage EU-placed, not UK-specific", status: "accepted", verification: "TRUST.md" },
];

const CITATIONS: { label: string; href: string }[] = [
  { label: "Trust", href: `${REPO}/blob/master/docs/TRUST.md` },
  { label: "Security", href: `${REPO}/blob/master/SECURITY.md` },
  { label: "Architecture", href: `${REPO}/blob/master/docs/ARCHITECTURE.md` },
  { label: "Evaluating", href: `${REPO}/blob/master/docs/EVALUATING.md` },
  { label: "Roadmap", href: `${REPO}/blob/master/docs/ROADMAP.md` },
  { label: "Apache 2.0", href: `${REPO}/blob/master/LICENSE` },
];

/** The contents list at the top of the page. */
const CONTENTS: { id: string; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "built", label: "How it is built" },
  { id: "identity", label: "Identity and access" },
  { id: "gateway", label: "The inference gateway" },
  { id: "gate", label: "The privilege gate" },
  { id: "anon", label: "Anonymisation" },
  { id: "admission", label: "Skill admission" },
  { id: "refusal", label: "Refusals" },
  { id: "record", label: "The audit record" },
  { id: "signoff", label: "Sign-off" },
  { id: "deployment", label: "Deployment and self-hosting" },
  { id: "status", label: "Status" },
  { id: "docs", label: "Reference documents" },
  { id: "limits", label: "What is not solved" },
];

/** The matter spine: six stations over one record rail. */
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
    <figure className="mt-8 max-w-3xl border border-rule bg-paper p-4">
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
      <figcaption className="px-1 pt-3 pb-1 text-[11px] text-muted">
        The matter spine: every station writes to one hash-chained record.
      </figcaption>
    </figure>
  );
}

/** The request path drawn as nodes top to bottom, with the check each node
 * runs written beside it and the refusal branch marked. */
function RequestPathDiagram() {
  const W = 720;
  const boxW = 300;
  const boxX = 60;
  const boxH = 40;
  const stepGap = 30;
  const y0 = 20;

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
    <figure className="mt-8 max-w-3xl border border-rule bg-paper p-4">
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
      <figcaption className="px-1 pt-3 pb-1 text-[11px] text-muted">
        The request path: what runs, and what is checked, at every node.
      </figcaption>
    </figure>
  );
}

/** The inference gateway drawn from the inside: many callers, one box, the
 * key decrypted at the last moment, one wire out to a provider. */
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
    <figure className="mt-8 max-w-3xl border border-rule bg-paper p-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="The inference gateway: every caller funnels into one gateway component, which reads the privilege posture, decrypts the user's key at call time, and is the only component that talks to a model provider"
        className="block w-full"
      >
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

        <line x1={gx + gw} y1={gy + gh / 2} x2={560} y2={gy + gh / 2} stroke="#181818" strokeWidth="1.5" markerEnd="url(#gw-arrow)" />
        <text x={(gx + gw + 560) / 2} y={gy + gh / 2 - 8} textAnchor="middle" fontSize="8" letterSpacing="1" fill="#8B0000" fontFamily="ui-monospace, monospace">
          ONLY WIRE OUT
        </text>

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
      <figcaption className="px-1 pt-3 pb-1 text-[11px] text-muted">
        The inference gateway: many callers in, one wire out.
      </figcaption>
    </figure>
  );
}

function StatusTag({ status }: { status: "shipped" | "deferred" | "accepted" }) {
  const isShipped = status === "shipped";
  return (
    <span
      className={`tech-token text-[10px] uppercase tracking-[0.18em] ${
        isShipped ? "text-ink" : "text-seal"
      }`}
    >
      {status}
    </span>
  );
}

/** A plain section heading with a scroll anchor. */
function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-16 scroll-mt-8 text-2xl md:text-[28px] font-bold tracking-tight2 text-ink"
    >
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-8 text-lg font-semibold tracking-tight2 text-ink">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 max-w-3xl text-base leading-relaxed text-prose">
      {children}
    </p>
  );
}

export function Architecture() {
  return (
    <div className="max-w-page mx-auto">
      <div className="px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
        <header>
          <h1 className="font-redaction35 text-[52px] sm:text-[72px] leading-none tracking-tight2 text-ink">
            Architecture
          </h1>
          <div className="mt-6 max-w-2xl text-base leading-relaxed text-prose">
            <p>
              Legalise is an open-source workspace for legal AI work in England
              and Wales. This page documents how it is built: the subsystems,
              how they fit together, and where in the repository to verify each
              claim. Every code reference links to the file that implements it.
            </p>
            <p className="mt-4">
              This is an open experiment, not a finished answer. The code is
              canonical; if this page and the repository disagree, trust the{" "}
              <a
                href={REPO}
                target="_blank"
                rel="noreferrer"
                className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
              >
                repository
              </a>
              .
            </p>
          </div>

          {/* Contents */}
          <nav aria-label="Contents" className="mt-8 max-w-2xl border-t border-rule/50 pt-4">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {CONTENTS.map((c) => (
                <li key={c.id}>
                  <a
                    href={`#${c.id}`}
                    className="text-[13px] text-muted underline underline-offset-4 decoration-rule transition-colors hover:text-seal hover:decoration-seal"
                  >
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <H2 id="overview">Overview</H2>
        <P>
          A <em>matter</em> is one legal case or file. A solicitor opens a
          matter, uploads its documents, and works in chat. The model answers
          with its sources attached and can run skills, which are small, vetted
          units of legal work such as a letter before claim, a disclosure list,
          or a witness-statement summary.
        </P>
        <P>
          Every output is a draft until a named person reviews it, edits it with
          tracked changes, and signs it. Everything the system does, including
          what it refuses, is written to one tamper-evident record. Documents,
          model calls, outputs, signatures, and the audit log all hang off one
          matter, owned by one user and governed by one privilege setting.
        </P>

        <H2 id="built">How it is built</H2>
        <P>
          Python, FastAPI, and Postgres on the back end; React on the front
          end. The parts that matter survive swapping out any model provider.
          The diagram below is the shape of a matter: six stations over one
          record rail.
        </P>
        <SpineDiagram />
        <P>
          The next diagram shows the same path as the steps a request passes
          through, with the check each step runs written beside it. Read it top
          to bottom; a request reaches the next step only if the current one
          lets it through.
        </P>
        <RequestPathDiagram />
        <P>
          Documents belong to a matter. Before any model is called, the gate
          reads that matter's privilege setting from the database, and a paused
          matter stops the request there. The model runs on the user's own keys.
          The output is a draft until a person signs it. Every step writes to the
          same hash-chained, exportable record, refusals included. Skills arrive
          only by import, from the Lawve catalogue or any public GitHub
          repository, read at a fixed commit and admitted through a ceremony.
        </P>
        <SourceRow
          items={[
            { label: "model_gateway.py", file: SRC.gateway },
            { label: "posture_gate.py", file: SRC.postureGate },
            { label: "audit_chain.py", file: SRC.auditChain },
            { label: "signoff.py", file: SRC.signoff },
            { label: "github_import.py", file: SRC.githubImport },
          ]}
        />
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
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

        <H2 id="identity">Identity and access</H2>
        <P>
          Login uses fastapi-users with cookie sessions (HttpOnly, Secure,
          SameSite=Lax) backed by a server-side{" "}
          <code className="tech-token">access_token</code> table, so signing out
          revokes the session on the server rather than clearing a cookie in the
          browser. Passwords are hashed with the library's Argon2/bcrypt scheme.
          Email verification runs through Resend, and a password reset uses a
          short-lived one-time token. Requests from unauthenticated users are
          rate limited by IP: five registrations and ten verification or reset
          requests per IP per hour. The count comes from a sliding window
          recomputed from Postgres, so the limit holds across several machines.
          The first rejection in a window writes an{" "}
          <code className="tech-token">auth.rate_limited</code> row.
        </P>
        <P>
          Matters belong to one user. A matter's short name is unique per{" "}
          <code className="tech-token">(slug, created_by_id)</code>, so two users
          can each hold a matter with the same name. Reading another user's
          matter returns 404, not 403, so user A cannot learn that user B has a
          matter with a given name. Access decisions, changes, and model calls
          each write their own audit row.
        </P>
        <P>
          Limits: this targets the sole practitioner and small firm. There is no
          organisation or team object, no single sign-on, no two-factor login,
          and one deployment is one workspace. Those are planned for v0.2 and
          later, not shipped.
        </P>
        <SourceRow
          items={[
            { label: "matter_access.py", file: SRC.matterAccess },
            { label: "config.py", file: SRC.config },
            { label: "TRUST.md", file: `${BLOB}/docs/TRUST.md` },
          ]}
        />

        <H2 id="gateway">The inference gateway</H2>
        <P>
          Every model call goes through one gateway. The providers (Anthropic,
          OpenAI, local Ollama, and a keyless stub for development) sit behind a
          single interface, and the gateway is the only component that talks to a
          model provider. There is one exit point, so what can leave for a third
          party is defined in one file.
        </P>
        <P>
          Users bring their own keys. Each user stores an Anthropic or OpenAI key
          under Settings, encrypted with AES-256-GCM (ciphertext, a 12-byte
          nonce, and the auth tag stored together) under a master key passed to
          the back end via an environment variable. In production the app refuses
          to start if that master key is missing, the wrong length, or not valid
          hex. If a user has no key for a provider that needs one, the call fails
          safely with a clear error and an audit row. There is no quiet fallback
          to a server-owned key in production. The hosted site is for evaluation;
          real calls require the user's own provider credentials.
        </P>
        <GatewayDiagram />
        <P>
          Inside the box, every call runs the same five steps in order: read the
          matter's privilege setting from the database; refuse if the matter is
          paused; pick the provider for the requested model; decrypt the key, now
          and not before; make the call, hash the prompt and response, write the
          audit row. The decrypted key lives only for the length of the call and
          never touches a log or the audit row.
        </P>
        <P>
          The gateway resolves which provider a model name belongs to in a single
          helper, used both by the gateway and by any check that runs before the
          call. A check can therefore never be stricter than the call it checks;
          if a renamed model id would change routing, both sides change at once.
        </P>
        <SourceRow
          items={[
            { label: "ModelGateway.call", file: SRC.gatewayCall },
            { label: "_select_provider", file: SRC.gatewaySelect },
            { label: "user_keys.py", file: SRC.userKeys },
            { label: "encryption.py", file: SRC.encryption },
            { label: "providers/", file: SRC.providers },
          ]}
        />

        <H2 id="gate">The privilege gate</H2>
        <P>
          Every matter has one of three privilege settings.{" "}
          <code className="tech-token">A_cleared</code> allows all providers.{" "}
          <code className="tech-token">B_mixed</code>, the default, prefers a
          local Ollama provider when one is configured and a frontier model was
          asked for, and otherwise allows the frontier providers under their
          no-training contract terms.{" "}
          <code className="tech-token">C_paused</code> allows no model call at
          all.
        </P>
        <P>
          The gateway reads the setting from the matter row, in the same session
          as the request, never from a value the caller handed in. That closes a
          gap where a caller reads{" "}
          <code className="tech-token">B_mixed</code>, an administrator switches
          the matter to <code className="tech-token">C_paused</code>, and the old
          value is used anyway. On a paused matter the gateway stops before any
          network traffic, and the change of setting is itself audited.
        </P>
        <P>
          The gate works at two levels. The gateway blocks model calls on a
          paused matter. A second gate,{" "}
          <code className="tech-token">check_posture</code>, runs before any
          capability, so even a non-model action is stopped on a paused matter,
          and a non-solicitor on a privileged matter gets a refusal that fits the
          setting rather than a grant. A privilege-gated tool with no matter
          attached is refused rather than allowed to skip the check. The policy
          is a six-line table in one file; changing it is a reviewed code change,
          not a switch anyone can flip in production.
        </P>
        <P>
          Calls made by a skill carry one more check: a call for a{" "}
          <code className="tech-token">(plugin, skill)</code> pair must hold the{" "}
          <code className="tech-token">model.invoke</code> grant for that pair,
          and a tool that writes a privileged resource also needs its matching
          write permission.
        </P>
        <SourceRow
          items={[
            { label: "posture_gate.py", file: SRC.postureGate },
            { label: "gateway.call (DB read)", file: SRC.gatewayCall },
            { label: "invoke_tool", file: SRC.invokeTool },
            { label: "capabilities.py", file: SRC.capabilities },
          ]}
        />

        <H2 id="anon">Anonymisation</H2>
        <P>
          Before sending a document to a model, a solicitor can pseudonymise it:
          replace names and other identifying details with placeholders. The
          layer runs Microsoft Presidio with three UK-specific detectors added on
          top of the spaCy defaults: postcodes, National Insurance numbers, and
          GBP amounts. Detected text is replaced with stable tokens
          (PARTY_1, ORG_1, and so on), and the mapping is stored so a re-run
          produces the same result.
        </P>
        <P>
          Two limits. First, Presidio is an optional install; the slim
          deployment image omits it, and a real run in that state fails cleanly
          with install guidance rather than passing text straight through.
          Second, in <code className="tech-token">auto</code> mode, if Presidio
          appears to catch too little on a long document, the layer can fall back
          to a Claude pass through the same gateway. That fallback is a model
          call, so it goes through the same privilege gate and gets the same
          audit row. Pseudonymisation reduces what a provider sees; it is not a
          guarantee, and the gate still decides whether the provider may be
          called at all.
        </P>
        <SourceRow
          items={[
            { label: "presidio_engine.py", file: SRC.presidio },
            { label: "pipeline.py", file: SRC.presidioPipeline },
          ]}
        />

        <H2 id="admission">Skill admission</H2>
        <P>
          Anyone can propose a skill from a public GitHub repository that has a
          SKILL.md file. The importer reads it at a fixed commit, checks the
          licence, and produces a draft the system can govern. Admission scans
          the manifest's structure, its declared permissions, and whether the
          source matches, then stops at one human decision: approve and enable,
          or refuse. The record keeps both outcomes the same way.
        </P>
        <H3>The two signature grades</H3>
        <P>
          <code className="tech-token">verified</code> means the manifest carries
          an ed25519 signature that checks out cryptographically against the
          publisher's registered public key, so only the holder of the matching
          private key could have produced it.{" "}
          <code className="tech-token">structure_verified</code> means shape only:
          the signature is present and plausible and the publisher is in the
          registry, but no cryptography was run, so a well-made forgery would
          pass. The status string says which check ran, and a publisher with no
          registered key can never reach{" "}
          <code className="tech-token">verified</code>.
        </P>
        <div className="mt-8 max-w-3xl border border-rule bg-paper p-2">
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
          <p className="px-1 pt-2 pb-1 text-[11px] text-muted">
            A capability from the contract-review manifest: declared, checked,
            then admitted.
          </p>
        </div>
        <P>
          The two grades come from one rule in one file. If the publisher has a
          registered ed25519 public key, the signature is checked against it with
          real cryptography and the result is{" "}
          <code className="tech-token">verified</code> or{" "}
          <code className="tech-token">invalid</code>. If there is no registered
          key, the verifier checks shape only and reports{" "}
          <code className="tech-token">structure_verified</code>. What gets signed
          is a fixed hash of the manifest with the signature fields removed, so
          the exact bytes being signed are pinned and re-saving the file cannot
          change them.
        </P>
        <SourceRow
          items={[
            { label: "signing.py", file: SRC.signing },
            { label: "publishers.py", file: SRC.publishers },
            { label: "github_import.py", file: SRC.githubImport },
            { label: "trust_ceremony.py", file: SRC.trustCeremony },
            { label: "TRUST.md", file: `${BLOB}/docs/TRUST.md` },
          ]}
        />

        <H2 id="refusal">Refusals</H2>
        <P>
          The privilege gate is only worth something if its refusals are kept and
          visible. When a paused matter refuses a privileged read, the refusal
          lands in the record as a struck entry, in the same row shape and the
          same ledger as any other action, rather than vanishing into a log
          nobody reads. Refusals are recorded with the same weight as approvals.
        </P>

        <H2 id="record">The audit record</H2>
        <P>
          Every model call writes an audit row holding the model used, the
          SHA-256 hashes of the prompt and response (never the text itself), the
          token count, and the latency. Every change to a matter writes a row
          too. The rows are hash-chained: an append-only table links each entry
          to the one before it for that matter, so the chain's head hash is the
          matter's fingerprint and stands for every entry under it. Publish that
          head hash and anyone can later prove the trail was not rewritten,
          because a changed trail no longer adds up to the same head. A Postgres
          trigger written in PL/pgSQL writes the chain the moment a row lands.
          The verify endpoint{" "}
          <code className="tech-token">GET /api/matters/&#123;slug&#125;/audit/verify</code>{" "}
          recomputes the same hashes separately in Python from the raw rows and
          reports the head plus any breaks. Two pieces of code do the same sum,
          and CI fails the build if they ever disagree.
        </P>
        <P>
          The table is append-only in two layers. A Postgres trigger rejects
          UPDATE and DELETE on every row, whatever role tries it. A database role
          split also strips the application role of permission to change or
          delete audit rows, so the app is refused before the trigger runs. CI
          checks the split on every build, and it is enabled on the hosted
          deployment: the app connects as a role that cannot rewrite the log,
          verified end to end. A database superuser can still disable the trigger
          and rewrite history; the external anchoring that would close that gap is
          not built (see below).
        </P>
        <P>
          The exported working pack holds the outputs, the source context, the
          signatures, and the audit trail: what a solicitor uses to answer what
          the AI saw, when, under what protection, and what it produced.
        </P>
        <SourceRow
          items={[
            { label: "audit_chain.py", file: SRC.auditChain },
            { label: "GET /audit/verify", file: SRC.auditChainEndpoint },
            { label: "SECURITY.md", file: `${BLOB}/SECURITY.md` },
            { label: "TRUST.md", file: `${BLOB}/docs/TRUST.md` },
          ]}
        />

        <H2 id="signoff">Sign-off</H2>
        <P>
          Every output is a draft until a named human reviews it, changes it
          where needed, and signs it. Edits show up as inline tracked changes:
          deletions struck through, insertions underlined, and each acceptance or
          rejection gets its own audit row. A firm that wants a four-eyes rule
          (two people, not one) can deploy with{" "}
          <code className="tech-token">SIGNOFF_AUTHOR_MUST_DIFFER</code> set,
          which stops an author signing their own output (rejecting it stays
          allowed). It is off by default so a sole practitioner can sign their own
          work.
        </P>
        <P>
          Sign-off decisions accumulate per skill: signed, signed with
          observations, or rejected. The signature pins the exact output the
          signer saw: it is taken over a SHA-256 of the file, so a signature
          cannot quietly come to mean a different document. The record also notes
          when a sign-off lands faster than a rough ten-minutes-per-thousand-words
          baseline would suggest for the length of the output. It flags this; it
          does not block it.
        </P>
        <SourceRow
          items={[
            { label: "signoff.py", file: SRC.signoff },
            { label: "SIGNOFF_AUTHOR_MUST_DIFFER", file: SRC.config },
          ]}
        />

        <H2 id="deployment">Deployment and self-hosting</H2>
        <P>
          The architecture is model-agnostic: the gateway treats providers as
          interchangeable, and the original build ran against local models, GPT,
          and Claude. For the demo, the working build is tuned tightly to
          Anthropic and the Claude skills format. The known cost of that choice:
          demo traffic touches Anthropic's commercial API, under its no-training
          contract terms, with the data questions that carries.
        </P>
        <P>
          The project is Apache-2.0 and can be self-hosted. The back end (Fly{" "}
          <code className="tech-token">lhr</code>) and Postgres (Neon London) sit
          in the UK. R2 object storage is placed in the EU, not specifically the
          UK, so end-to-end UK residency is not claimed. If you self-host, you own
          the master encryption key. Because{" "}
          <code className="tech-token">B_mixed</code> prefers a registered local
          Ollama provider, a firm building on this can tune it to run entirely on
          local models; at that point no client data needs to leave the building,
          and a local model is not a third party for privilege.
        </P>

        <H2 id="status">Status</H2>
        <P>
          Shipped means it is in the code on master. Deferred means it is designed
          or staged but not built. Accepted means a deliberate trade. Each row
          points at where to check.
        </P>
        <div className="mt-8 max-w-3xl overflow-x-auto border border-rule bg-paper">
          <table className="w-full border-collapse text-left text-sm text-prose">
            <thead>
              <tr className="border-b border-rule/60">
                <th className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted">
                  Capability
                </th>
                <th className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted">
                  Status
                </th>
                <th className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted">
                  Verification
                </th>
              </tr>
            </thead>
            <tbody>
              {STATUS_MATRIX.map((row) => (
                <tr key={row.capability} className="border-b border-rule/40 last:border-0">
                  <td className="px-3 py-2 align-top">{row.capability}</td>
                  <td className="px-3 py-2 align-top">
                    <StatusTag status={row.status} />
                  </td>
                  <td className="tech-token px-3 py-2 align-top text-[11px] text-muted">
                    {row.verification}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H2 id="docs">Reference documents</H2>
        <P>
          Each section above maps to one or more documents in the repository that
          carry the full detail.
        </P>
        <dl className="mt-8 max-w-3xl space-y-4">
          {DOC_MAP.map((row) => (
            <div
              key={row.section}
              className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-rule/50 pt-4 sm:grid-cols-[180px_1fr]"
            >
              <dt className="text-[11px] uppercase tracking-[0.18em] text-muted">
                {row.section}
              </dt>
              <dd className="flex flex-wrap gap-x-5 gap-y-2">
                {row.docs.map((d) => (
                  <Src key={d.label} file={d.file}>
                    {d.label}
                  </Src>
                ))}
              </dd>
            </div>
          ))}
        </dl>

        <H2 id="limits">What is not solved</H2>
        <P>
          The hosted site is an evaluation environment, not a practice
          environment. It is not a law firm and does not give legal advice. Real
          model calls require your own provider keys; Legalise does not pay for,
          or sit between, your model usage.
        </P>
        <P>
          One deployment is one workspace. Serving many separate organisations
          from one deployment is out of scope for the beta; firm-grade isolation
          needs its own design pass. Manifest signing is young: the scheme works,
          but the web of trust around it does not exist yet. Durable job
          recovery, formal write-once storage roles, and production-grade
          regulator reconstruction are planned engineering work, not solved
          problems. A database superuser can still disable the audit trigger; the
          external anchoring that would close that gap is not built.
        </P>
        <P>
          Models hallucinate. Citations give the reviewer something concrete to
          check, but they are not a guarantee. The system makes review explicit
          and recorded; it does not make review optional.
        </P>
        <P>
          If any of this is wrong, or you can break it, the repository is open:{" "}
          <a
            href={`${REPO}/issues`}
            target="_blank"
            rel="noreferrer"
            className="text-ink underline underline-offset-4 decoration-rule transition-colors hover:text-seal hover:decoration-seal"
          >
            issues and contributions welcome
          </a>
          .
        </P>

        <div className="mt-16">
          <Footer />
        </div>
      </div>
    </div>
  );
}
