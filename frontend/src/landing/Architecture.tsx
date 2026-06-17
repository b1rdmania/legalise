/**
 * /architecture — the MACHINE page, for the technical reader (firm IT /
 * security / infra, or a builder evaluating the design). The founder
 * narrative moved to /about; this page is grounded entirely in what the
 * code does, every claim sourced from the repo.
 *
 * Order: tight masthead → skim layer (five lines + jump index) → exhibit
 * (why it matters) → what/why/how → identity & access → inference gateway →
 * privilege gate → anonymisation → admission → the refusal → the record →
 * sign-off → sovereignty → standing (closing argument) → deeper-reading
 * doc map → status matrix → honesty (gaps stated, not buried) → colophon.
 * The middle reads as one clean machine; philosophy sits at the ends.
 * Stamps and seal wayfinding per P35.
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

/** The "deeper reading" map: each section of this page → its canonical
 * doc(s) in the repo. The page is the readable index; these are the
 * depth. Every path verified present on master. */
const DOC_MAP: { section: string; docs: { label: string; file: string }[] }[] = [
  {
    section: "Identity & access",
    docs: [{ label: "AUTH.md", file: `${BLOB}/docs/AUTH.md` }],
  },
  {
    section: "Inference gateway / keys",
    docs: [{ label: "TRUST.md", file: `${BLOB}/docs/TRUST.md` }],
  },
  {
    section: "Privilege gate",
    docs: [
      { label: "POSTURE_GATE_UX.md", file: `${BLOB}/docs/spec/POSTURE_GATE_UX.md` },
      { label: "ADVICE_BOUNDARY.md", file: `${BLOB}/docs/architecture/ADVICE_BOUNDARY.md` },
    ],
  },
  {
    section: "Anonymisation",
    docs: [{ label: "SANDBOX_STRATEGY.md", file: `${BLOB}/docs/architecture/SANDBOX_STRATEGY.md` }],
  },
  {
    section: "Admission / signing",
    docs: [
      { label: "SIGNING.md", file: `${BLOB}/docs/architecture/SIGNING.md` },
      { label: "TRUST_CEREMONY.md", file: `${BLOB}/docs/architecture/TRUST_CEREMONY.md` },
      { label: "MANIFEST_V2_SCHEMA.md", file: `${BLOB}/docs/architecture/MANIFEST_V2_SCHEMA.md` },
    ],
  },
  {
    section: "The record",
    docs: [
      { label: "AUDIT_COVERAGE_MATRIX.md", file: `${BLOB}/docs/spec/AUDIT_COVERAGE_MATRIX.md` },
      { label: "AUDIT_RECONSTRUCTION.md", file: `${BLOB}/docs/architecture/AUDIT_RECONSTRUCTION.md` },
      { label: "AUDIT_EMISSION_MAP.md", file: `${BLOB}/docs/spec/AUDIT_EMISSION_MAP.md` },
    ],
  },
  {
    section: "Sign-off / output",
    docs: [
      { label: "OUTPUT_LIFECYCLE.md", file: `${BLOB}/docs/architecture/OUTPUT_LIFECYCLE.md` },
      { label: "REVIEW_PANELS.md", file: `${BLOB}/docs/architecture/REVIEW_PANELS.md` },
      { label: "SUPERVISION_LEGIBILITY_M13.md", file: `${BLOB}/docs/spec/SUPERVISION_LEGIBILITY_M13.md` },
    ],
  },
  {
    section: "Supervised autonomy",
    docs: [{ label: "SUPERVISED_AUTONOMY.md", file: `${BLOB}/docs/SUPERVISED_AUTONOMY.md` }],
  },
  {
    section: "Compliance / regulatory",
    docs: [{ label: "REGULATORY_PLUMBING.md", file: `${BLOB}/REGULATORY_PLUMBING.md` }],
  },
  {
    section: "Claim boundary",
    docs: [{ label: "CLAIM_BOUNDARY.md", file: `${BLOB}/docs/CLAIM_BOUNDARY.md` }],
  },
  {
    section: "Threat model",
    docs: [{ label: "THREAT_MODEL.md", file: `${BLOB}/docs/THREAT_MODEL.md` }],
  },
  {
    section: "Top-level",
    docs: [
      { label: "ARCHITECTURE.md", file: `${BLOB}/ARCHITECTURE.md` },
      { label: "ENGINEERING.md", file: `${BLOB}/docs/ENGINEERING.md` },
      { label: "ROADMAP.md", file: `${BLOB}/docs/ROADMAP.md` },
    ],
  },
];

/** The shipped-vs-deferred matrix, built from the Honesty prose + TRUST.md.
 * "shipped" means in the code on master; "deferred" means designed/staged
 * but not built; "accepted" means a deliberate trade we are not closing.
 * No SBOM/SLSA/SOC2/ISO/signed-images claims — Legalise has none. */
const STATUS_MATRIX: {
  capability: string;
  status: "shipped" | "deferred" | "accepted";
  verification: string;
}[] = [
  { capability: "Single-egress inference gateway", status: "shipped", verification: "model_gateway.py" },
  { capability: "Bring-your-own keys, encrypted at rest", status: "shipped", verification: "encryption.py · user_keys.py" },
  { capability: "Privilege gate read from DB per call", status: "shipped", verification: "posture_gate.py" },
  { capability: "Hash-chained audit, dual-implementation verify", status: "shipped", verification: "audit_chain.py · GET /audit/chain" },
  { capability: "Named sign-off over artifact SHA-256", status: "shipped", verification: "signoff.py" },
  { capability: "Skill admission ceremony, two signature grades", status: "shipped", verification: "signing.py · trust_ceremony.py" },
  { capability: "Per-user matter isolation, session revocation", status: "shipped", verification: "matter_access.py · AUTH.md" },
  { capability: "Audit-role split asserted in CI", status: "shipped", verification: "SECURITY.md (build gate)" },
  { capability: "WORM role flipped on hosted deployment", status: "deferred", verification: "OPERATIONS.md" },
  { capability: "Organisation / team / SSO / MFA", status: "deferred", verification: "AUTH.md · ROADMAP.md" },
  { capability: "Multi-tenancy (one deploy = one workspace today)", status: "deferred", verification: "ROADMAP.md" },
  { capability: "Manifest web-of-trust / publisher registry at scale", status: "deferred", verification: "TRUST.md" },
  { capability: "Durable job recovery, regulator reconstruction", status: "deferred", verification: "ROADMAP.md" },
  { capability: "SBOM / SLSA / signed images / SOC 2 / ISO", status: "deferred", verification: "not present — roadmap only" },
  { capability: "Hosted demo touches Anthropic commercial API", status: "accepted", verification: "TRUST.md (no-training terms)" },
  { capability: "R2 storage EU-placed, not UK-specific", status: "accepted", verification: "OPERATIONS.md" },
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
  id,
  label,
  right,
  title,
  children,
}: {
  id?: string;
  label: string;
  right?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-16 scroll-mt-8">
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

/** The skim layer: the system in five lines, plus a jump index of the
 * sections. A technical reader skims this once, then deep-reads. */
const FIVE_LINES = [
  "Identity: per-user matters, real session revocation, an audit row per action.",
  "Gateway: one exit point; your keys, encrypted, decrypted only at call time.",
  "Gate: the matter's privilege setting, read from the database before every call.",
  "Admission: skills arrive by ceremony at a fixed commit, not by upload.",
  "Record: every call, output, and refusal hash-chained and exportable.",
];

const JUMP_INDEX: { num: string; title: string; href: string }[] = [
  { num: "01", title: "What this is", href: "#what" },
  { num: "02", title: "Why", href: "#why" },
  { num: "03", title: "How it is built", href: "#built" },
  { num: "04", title: "Identity and access", href: "#identity" },
  { num: "05", title: "The inference gateway", href: "#gateway" },
  { num: "06", title: "The privilege gate", href: "#gate" },
  { num: "07", title: "Anonymisation", href: "#anon" },
  { num: "08", title: "Admission", href: "#admission" },
  { num: "09", title: "The refusal", href: "#refusal" },
  { num: "10", title: "The record", href: "#record" },
  { num: "11", title: "Sign-off", href: "#signoff" },
  { num: "12", title: "Sovereignty", href: "#sovereignty" },
  { num: "13", title: "Standing", href: "#standing" },
  { num: "—", title: "Deeper reading", href: "#docs" },
  { num: "—", title: "Status", href: "#status" },
  { num: "—", title: "Honesty", href: "#honesty" },
];

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

export function Architecture() {
  return (
    <div className="max-w-page mx-auto">
      <div className="px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
        {/* Masthead — the monument carries the page alone (P30). The
            technical reader's orientation, not the founder's story (that
            lives on /about). */}
        <header>
          <h1 className="font-redaction35 text-[52px] sm:text-[72px] leading-none tracking-tight2 text-ink">
            Architecture
          </h1>
          <div className="mt-6 max-w-xl space-y-4 text-sm leading-relaxed text-prose">
            <p>
              Every claim on this page is backed by code you can read. Where
              it names a file, the file is one click away. Check it; don't
              trust it.
            </p>
            <p>
              The system, in one line: AI that runs inside a matter file,
              under supervision. Identity, an inference gateway, a privilege
              gate, a record nothing escapes. The sections below walk each
              part and link its source. The gaps sit under Honesty, not at
              the bottom by accident.
            </p>
            <p>
              Why it exists is on the{" "}
              <a
                href="/about"
                className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
              >
                about page
              </a>
              . This is how it's built.
            </p>
          </div>
        </header>

        {/* Skim layer (A2): the system in five lines + a jump index, so a
            technical reader can read top-down once and then deep-read. */}
        <section className="mt-12">
          <SectionRule
            label={<span className="text-seal">The system in five lines</span>}
            right="Skim first"
          />
          <ol className="mt-6 max-w-3xl space-y-2">
            {FIVE_LINES.map((line) => (
              <li key={line} className="flex gap-3 text-sm leading-relaxed text-prose">
                <span className="text-seal" aria-hidden="true">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
          <div className="mt-8 max-w-3xl border-t border-rule/50 pt-4">
            <span className="tech-token text-[10px] uppercase tracking-[0.2em] text-muted">
              Sections:
            </span>
            <nav className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {JUMP_INDEX.map((s) => (
                <a
                  key={s.title}
                  href={s.href}
                  className="tech-token text-[11px] text-muted underline underline-offset-4 decoration-rule transition-colors hover:text-seal hover:decoration-seal"
                >
                  <span className="text-seal">{s.num}</span> {s.title}
                </a>
              ))}
            </nav>
          </div>
        </section>

        {/* Exhibit: the cost of unsupervised capability, already in the
            law reports. Early by design — this is why the page exists. */}
        <section className="mt-16">
          <SectionRule
            label={<span className="text-seal">Exhibit · the cost of capability alone</span>}
            right="1,500+ cases"
          />
          <Prose>
            <p>
              This already happens. Damien Charlotin's database of AI
              hallucination cases has found{" "}
              <a
                href="https://www.damiencharlotin.com/hallucinations/"
                target="_blank"
                rel="noreferrer"
                className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
              >
                more than 1,500 legal decisions
              </a>{" "}
              where generative AI put made-up content, usually fake case
              citations, in front of a court. Lawyers are being punished for
              this now, in public, with their names on the orders.
              Supervision is not a nice extra. It is the product.
            </p>
          </Prose>
          <Figure
            src="/architecture/fig-hallucinations.png"
            alt="Damien Charlotin's AI Hallucination Cases database: more than 1,500 legal decisions involving hallucinated AI content"
            index={1}
            caption="The hallucination case database · damiencharlotin.com · 1,500+ decisions and counting"
          />
        </section>

        <Section id="what" label="01 · What this is" title="A matter workspace where the AI works under supervision.">
          <Prose>
            <p>
              Legalise is an open-source workspace for legal AI work in
              England and Wales. A "matter" is one legal case or file. A
              solicitor opens a matter, uploads its documents, and works in
              chat. The model answers with its sources attached, and it can
              run skills, which are small, vetted units of legal work. A
              letter before claim. A disclosure list. A summary of a witness
              statement.
            </p>
            <p>
              Every output is a draft until a named person reviews it, edits
              it with tracked changes, and signs it. Everything the system
              does, including what it refuses to do, is written to one
              tamper-evident record. That is the whole product: chat,
              governed skills, sign-off, and the record.
            </p>
          </Prose>
        </Section>

        <Section id="why" label="02 · Why" title="Because capability is not the hard part. Proof is.">
          <Prose>
            <p>
              The hard question in legal AI is not whether the model can do
              the work. It is whether a firm can show, later and on demand,
              what the AI saw, under whose supervision it acted, and who took
              responsibility for the output. Regulators and professional
              indemnity insurers think in those terms. In the US,{" "}
              <em>United States v. Heppner</em> held that AI work a client
              generated on their own, outside their lawyer's direction, was
              not privileged. (Privilege is the legal protection that keeps
              certain lawyer-client work confidential.) England has not ruled
              directly, but the principle is the same: unsupervised AI use is
              where privilege and responsibility break down. The answer has
              to be built into the system. You cannot reconstruct it from a
              chat history afterwards.
            </p>
            <p>
              The matter is the unit that makes proof possible. Documents,
              model calls, outputs, signatures, and the record all hang off
              one matter, owned by one user, governed by one privilege
              setting, written into one audit log. Outside that frame the
              legal use case stops being legal. It becomes a generic question
              that happens to mention the law.
            </p>
          </Prose>
        </Section>

        <Section id="built" label="03 · How it is built" title="Boring stack, ambitious composition.">
          <Prose>
            <p>
              Python, FastAPI, and Postgres on the back end. React on the
              front end. Nothing on that list will surprise anyone in 2030,
              which is the point. The new part is how the pieces fit
              together, and the pieces that matter survive swapping out any
              model provider.
            </p>
          </Prose>
          <SpineDiagram />
          <Prose>
            <p>
              The spine above is the shape. The diagram below shows the
              detail: the same path drawn as the steps a request passes
              through, with the check each step runs written beside it. Read
              it top to bottom. A request only reaches the next step if the
              current one lets it through.
            </p>
          </Prose>
          <RequestPathDiagram />
          <Prose>
            <p>
              Documents belong to a matter. Before any model is called, the
              gate reads that matter's privilege setting from the database,
              and a paused matter stops the request right there. The model
              runs on your own keys. The output is a draft until a person
              signs it. Every step writes to the same hash-chained,
              exportable record, refusals included. Skills only arrive by
              import, from the Lawve catalogue or any public GitHub
              repository, read at a fixed commit and admitted through a
              ceremony.
            </p>
            <p>
              The rest of the page walks through each step and links the file
              that implements it. If a claim here is wrong, the code is one
              click away.
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

        <Section id="identity" label="04 · Identity and access" title="Per-user matters, real session revocation, an audit row per action.">
          <Prose>
            <p>
              Login uses fastapi-users with cookie sessions (HttpOnly,
              Secure, SameSite=Lax) backed by a server-side{" "}
              <code className="tech-token">access_token</code> table. So
              signing out actually revokes the session on the server, not
              just clears a cookie in the browser. Passwords are hashed with
              the library's Argon2/bcrypt scheme. Email verification runs
              through Resend, and a password reset uses a one-time token that
              expires quickly. Requests from people who are not logged in are
              rate limited by IP address: five registrations and ten
              verification or reset requests per IP per hour. The count comes
              from a sliding window recomputed from Postgres, so the limit
              holds even when the app runs on several machines at once. The
              first rejection in a window writes an{" "}
              <code className="tech-token">auth.rate_limited</code> row.
            </p>
            <p>
              Matters belong to one user, not to everyone. A matter's short
              name is unique per{" "}
              <code className="tech-token">(slug, created_by_id)</code>, so
              two users can each have a matter with the same name without
              clashing. Reading another user's matter returns 404, not 403,
              so user A cannot even learn that user B has a matter with a
              given name. Access decisions, changes, and model calls each
              write their own audit row.
            </p>
            <p>
              Be clear about the limits. This is built for the sole
              practitioner and the small firm. There is no organisation or
              team object, no single sign-on, no two-factor login, and one
              deployment is one workspace. Those are planned for v0.2 and
              later, not shipped.
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

        <Section id="gateway" label="05 · The inference gateway" title="One egress boundary. Your keys, encrypted, decrypted only at call time.">
          <Prose>
            <p>
              Every model call goes through one gateway. The providers
              (Anthropic, OpenAI, local Ollama, and a keyless stub for
              development) sit behind a single interface, and the gateway is
              the only part of the system that talks to a model provider. So
              there is one exit point. If you want to know what can leave for
              a third party, you read one file.
            </p>
            <p>
              You bring your own keys. Each user stores an Anthropic or OpenAI
              key under Settings, encrypted with AES-256-GCM (the ciphertext,
              a 12-byte nonce, and the auth tag stored together) under a
              master key given to the back end through an environment
              variable. In production the app refuses to start if that master
              key is missing, the wrong length, or not valid hex. If a user
              has no key for a provider that needs one, the call fails safely
              with a clear error and an audit row. There is no quiet fallback
              to a server-owned key in production.
            </p>
            <p>
              The honest cost: we do not pay for, sit between, or resell model
              usage. The hosted site is for evaluation, and real calls need
              your own provider credentials.
            </p>
          </Prose>
          <GatewayDiagram />
          <Prose>
            <p>
              Inside the box, every call runs the same five steps in order.
              Read the matter's privilege setting from the database. Refuse
              outright if the matter is paused. Pick the provider for the
              requested model. Decrypt your key, now and not before. Make the
              call, hash the prompt and response, write the audit row. The
              decrypted key lives only for the length of the call and never
              touches a log or the audit row.
            </p>
            <p>
              One small thing that matters more than it looks. The gateway
              works out which provider a model name belongs to in a single
              helper, used both by the gateway and by any check that runs
              before the call. So a check can never be stricter than the call
              it is checking. If a renamed model id would change routing, both
              sides change at once.
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

        <Section id="gate" label="06 · The privilege gate" title="The matter's posture is read from the database before every call.">
          <Prose>
            <p>
              Every matter has one of three privilege settings.{" "}
              <code className="tech-token">A_cleared</code> allows all
              providers. <code className="tech-token">B_mixed</code>, the
              default, prefers a local Ollama provider when one is set up and
              a frontier model was asked for, and otherwise allows the
              frontier providers under their no-training contract terms.{" "}
              <code className="tech-token">C_paused</code> allows no model call
              at all.
            </p>
            <p>
              What matters is where the setting is read. The gateway reads it
              from the matter row, in the same session as the request, never
              from a value the caller handed in. That closes a gap: a caller
              reads <code className="tech-token">B_mixed</code>, an
              administrator switches the matter to{" "}
              <code className="tech-token">C_paused</code>, and the old value
              gets used anyway. On a paused matter the gateway stops before
              any network traffic. The same gate guards privilege-gated tools.
              A privilege-gated tool with no matter attached is refused rather
              than allowed to skip the check by leaving its matter off. The
              change of setting is itself audited.
            </p>
            <p>
              The gate works at two levels, not one. The gateway blocks model
              calls on a paused matter. A second gate,{" "}
              <code className="tech-token">check_posture</code>, runs before
              any capability does, so even a non-model action is stopped on a
              paused matter, and a non-solicitor on a privileged matter gets a
              refusal that fits the setting rather than a grant. The whole
              policy is a six-line table in one file. Changing it is a code
              change someone has to review, not a switch anyone can flip in
              production.
            </p>
            <p>
              Calls made by a skill carry one more check. A call made for a{" "}
              <code className="tech-token">(plugin, skill)</code> pair must
              hold the <code className="tech-token">model.invoke</code> grant
              for that pair, and a tool that writes a privileged resource also
              needs its matching write permission. A skill runs because it was
              admitted, not because it is clever.
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

        <Section id="anon" label="07 · Anonymisation" title="An optional pseudonymisation layer, with its limits stated.">
          <Prose>
            <p>
              Before sending a document to a model, a solicitor can
              pseudonymise it, meaning replace names and other identifying
              details with placeholders. The layer runs Microsoft Presidio
              with three UK-specific detectors added on top of the spaCy
              defaults: postcodes, National Insurance numbers, and GBP
              amounts, the shapes the base detectors miss in UK
              correspondence. Detected text is replaced with stable tokens
              (PARTY_1, ORG_1, and so on), and the mapping is stored so a
              re-run produces the same result.
            </p>
            <p>
              Two honest limits. First, Presidio is an optional install. The
              slim deployment image does not include it, and a real run in
              that state fails cleanly with install guidance rather than
              quietly passing text straight through. Second, in{" "}
              <code className="tech-token">auto</code> mode, if Presidio seems
              to be catching too little on a long document, the layer can fall
              back to a Claude pass through the same gateway. That fallback is
              a model call, so it goes through the same privilege gate and
              gets the same audit row. Pseudonymisation reduces what a
              provider sees. It is not a guarantee, and the gate above it
              still decides whether the provider may be called at all.
            </p>
          </Prose>
          <SourceRow
            items={[
              { label: "presidio_engine.py", file: SRC.presidio },
              { label: "pipeline.py", file: SRC.presidioPipeline },
            ]}
          />
        </Section>

        <Section id="admission" label="08 · Admission" title="Skills arrive by ceremony, not by upload.">
          <Prose>
            <p>
              Anyone can propose a skill from a public GitHub repository that
              has a SKILL.md file. The importer reads it at a fixed commit,
              checks the licence, and produces a draft that the system can
              govern. Admission scans the manifest's structure, its declared
              permissions, and whether the source matches, then stops at one
              human decision: approve and enable, or refuse. The record keeps
              both outcomes the same way.
            </p>
            <p>
              Signatures come in two honest grades.{" "}
              <code className="tech-token">verified</code> means the manifest
              carries an ed25519 signature that checks out cryptographically
              against the publisher's registered public key, so only the
              holder of the matching private key could have produced it.{" "}
              <code className="tech-token">structure_verified</code> means
              shape only. The signature is present and looks plausible, the
              publisher is in the registry, but no cryptography was run, so a
              well-made forgery would pass. The status string says exactly
              which check ran, and a publisher with no registered key can
              never reach <code className="tech-token">verified</code>.
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
              because shape is not proof. What gets signed is a fixed hash of
              the manifest with the signature fields removed, so the exact
              bytes being signed are pinned and re-saving the file cannot
              change them.
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

        <Section id="refusal" label="09 · The refusal" title="A register that testifies against itself is evidence.">
          <Prose>
            <p>
              The gate from section 06 is only worth something if its
              refusals are kept and visible. When a paused matter refuses a
              privileged read, the refusal lands in the demo's record as a
              struck entry, in the same row shape, the same ledger, and seal
              red, rather than vanishing into a log nobody reads.
            </p>
            <p>
              The refusal is the heart of the system. A register that only
              records approvals is advertising. A register that testifies
              against itself when it must is evidence. You can watch this in
              the demo: the paused matter refuses a privileged read, in
              public, and the record keeps it.
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

        <Section id="record" label="10 · The record" title="Audit is not the product. Audit is the receipt.">
          <Prose>
            <p>
              Every model call writes an audit row holding the model used,
              the SHA-256 hashes of the prompt and response (never the text
              itself), the token count, and the latency. Every change to a
              matter writes a row too. The rows are hash-chained, which means
              an append-only table links each entry to the one before it for
              that matter, so the chain's head hash is the matter's
              fingerprint and stands for every entry under it. Publish that
              head hash, in an email, a filing, or a public log, and anyone
              can later prove the trail was not rewritten, because a changed
              trail no longer adds up to the same head. A Postgres trigger
              written in PL/pgSQL writes the chain the moment a row lands. The
              verify endpoint{" "}
              <code className="tech-token">GET /api/matters/&#123;slug&#125;/audit/chain</code>{" "}
              recomputes the same hashes separately in Python from the raw
              rows and reports the head plus any breaks. Two pieces of code do
              the same sum, and CI fails the build if they ever disagree. A
              hash chain whose only checker is the code that wrote it would
              prove nothing.
            </p>
            <p>
              The table is append-only, enforced in two layers. A Postgres
              trigger rejects UPDATE and DELETE on every row, whatever role
              tries it, and a database role split removes the application
              role's permission to UPDATE or DELETE on the audit table. CI
              checks the role split on every build and fails if the app role
              can change an audit row. Turning it on for the hosted deployment
              is a one-line connection-string change, documented in
              Operations. That switch is not yet flipped on the hosted stack,
              and the honesty section says so.
            </p>
            <p>
              The working pack holds the outputs, the source context, the
              signatures, and the audit trail. It is what a solicitor uses to
              answer the questions a regulator, a client, or opposing counsel
              will eventually ask: what did your AI see, when, under what
              protection, and what did it produce.
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

        <Section id="signoff" label="11 · Sign-off" title="Supervised practice, with a track record.">
          <Prose>
            <p>
              Every output is a draft until a named human reviews it, changes
              it where needed, and signs what they are prepared to stand
              behind. Edits show up as inline tracked changes: deletions
              struck through, insertions underlined, and each acceptance or
              rejection gets its own audit row. A firm that wants a four-eyes
              rule (two people, not one) can deploy with{" "}
              <code className="tech-token">SIGNOFF_AUTHOR_MUST_DIFFER</code>{" "}
              set, which stops an author signing their own output (rejecting
              it stays allowed). It is off by default so a sole practitioner
              can still sign their own work.
            </p>
            <p>
              Sign-off decisions build up per skill: signed, signed with
              observations, or rejected. That is a supervised practice
              history, produced by the system as it runs, not a benchmark
              score. Closed platforms have not published theirs, and have no
              reason to start.
            </p>
          </Prose>
          <VideoFigure
            src="/architecture/clip-signature.mp4"
            index={6}
            caption="The signature · tracked changes, a named signer, output.signed on the ledger"
          />
          <Prose>
            <p>
              The signature pins the exact output the signer saw. It is taken
              over a SHA-256 of the file, so a signature can never quietly
              come to mean a different document. The record also notes when a
              sign-off lands too fast for the length of the output, judged
              against a rough ten-minutes-per-thousand-words baseline. It
              flags this; it does not block it.
            </p>
          </Prose>
          <SourceRow
            items={[
              { label: "signoff.py", file: SRC.signoff },
              { label: "SIGNOFF_AUTHOR_MUST_DIFFER", file: SRC.config },
            ]}
          />
        </Section>

        <Section id="sovereignty" label="12 · Sovereignty and deployment" title="Open source, your own keys, a path to fully local.">
          <Prose>
            <p>
              The architecture was model-agnostic from the start. The gateway
              treats providers as interchangeable, and the original build ran
              against local models, GPT, and Claude without caring which. For
              the demo, that breadth earned less than it cost, so the working
              build is tuned tightly to Anthropic and the Claude skills
              format. The known cost of that choice: demo traffic touches
              Anthropic's commercial API, under its no-training contract
              terms, with the data questions that carries. This is a proof of
              concept, and the trade is deliberate.
            </p>
            <p>
              The project is Apache-2.0 and you can host it yourself. The back
              end (Fly <code className="tech-token">lhr</code>) and Postgres
              (Neon London) sit in the UK. R2 object storage is placed in the
              EU, not specifically the UK, and we do not claim end-to-end UK
              residency because that is not literally true. If you self-host,
              you own the master encryption key. Because{" "}
              <code className="tech-token">B_mixed</code> prefers a registered
              local Ollama provider, a firm building on top of this can tune
              it to run entirely on local models as those get stronger. At
              that point no client data needs to leave the building, and a
              local model is not a third party for privilege at all.
            </p>
          </Prose>
        </Section>

        {/* Standing (A5): moved out of the technical spine to here, the
            closing argument — why the machine above is the institution. */}
        <Section id="standing" label="13 · Standing" title="Capability is a commodity. Standing is the institution.">
          <Prose>
            <p>
              The frontier models are available to everyone, including your
              opponent. What does not become a commodity is the apparatus
              around the work: who was allowed to do it, what they were
              allowed to see, who signed it, and what the record says when
              someone asks later. The profession solved this centuries ago,
              not with better lawyers but with standing: a practicing
              certificate, rights of audience, a disciplinary record,
              supervised practice. Legalise applies that same structure to AI
              counsel. The mapping is direct:
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
          <Figure
            src="/architecture/fig-certificates.png"
            alt="Two skills rendered as certificates in the demo workspace, each declaring what it reads and writes"
            index={3}
            caption="Skills in a matter, rendered as their certificates"
          />
        </Section>

        {/* Deeper reading (A1): the page is the readable index; each
            section maps to its canonical doc(s) in the repo. */}
        <section id="docs" className="mt-16 scroll-mt-8">
          <SectionRule
            label={<span className="text-seal">Deeper reading</span>}
            right="The page indexes; the docs go deep"
          />
          <Prose>
            <p>
              This page is the map. Each section above has one or more main
              documents in the repository that carry the full detail. They
              are listed here so the depth lives in the docs and the page
              stays readable.
            </p>
          </Prose>
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
        </section>

        {/* Shipped-vs-deferred matrix (A7): what is in the code, what is
            staged, and what is a deliberate trade — each with where to
            check it. No SBOM/SLSA/SOC2/ISO claimed as shipped. */}
        <section id="status" className="mt-16 scroll-mt-8">
          <SectionRule
            label={<span className="text-seal">Status</span>}
            right="Shipped · deferred · accepted"
          />
          <Prose>
            <p>
              Shipped means it is in the code on master. Deferred means it is
              designed or staged but not built. Accepted means a deliberate
              trade we are not closing. Each row points at where to check.
            </p>
          </Prose>
          <div className="mt-8 max-w-3xl overflow-x-auto border border-ink/70 bg-paper">
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
        </section>

        <Section id="honesty" label="14 · Honesty" title="What is not solved.">
          <Prose>
            <p>
              The hosted site is an evaluation environment, not a practice
              environment. It is not a law firm and it does not give legal
              advice. Real model calls require your own provider keys; we do
              not pay for, or sit between, your model usage.
            </p>
            <p>
              One deployment is one workspace. Serving many separate
              organisations from one deployment is deliberately out of scope
              for the beta. Firm-grade isolation needs its own design pass,
              not a column on a table. Manifest signing is young: the scheme
              works, but the web of trust around it does not exist yet.
              Durable job recovery, formal write-once storage roles, and
              production-grade regulator reconstruction are planned
              engineering work, not solved problems.
            </p>
            <p>
              And the models hallucinate. Citations give the reviewer
              something concrete to check, but they are not a guarantee. The
              system makes review explicit and recorded. It does not make
              review optional, and it never will. That limit is the point of
              the product, not something we hope to remove.
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
