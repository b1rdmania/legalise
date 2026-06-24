// /guided-demo — the guided, on-rails demo, layered on the real workspace.
//
// Centred on the skill lifecycle (choose → install → run → govern) and
// played out INSIDE the actual backend shell: the SidebarView rail, the
// matter header, the document reader, the bg-panel surface. The guided
// narration rides on top; the rail lights up as you move through the acts.
//
// Acts: 1 The failure · 2 Choose · 3 Install · 4 Run · 5 Govern.
// Teaching content ported from the vibeathon "harness". Palette: Almond &
// Ink, scoped to this surface (tokens are static, so we override them here).

import { useEffect, useRef, useState } from "react";
import { CertCard, CertEyebrow, InkBands, LedgerLine, LedgerRow, SectionRule } from "../ui/certificate";
import { PageHeader } from "../ui/primitives";
import { SidebarView, NavIcon, type RailItem } from "../ui/SidebarView";

// Which rail surface each act lights up: the guided flow drives the
// real nav, not a parallel stepper alone.
const ACT_RAIL = ["assistant", "workflows", "workflows", "documents", "audit"] as const;

const QUESTION = "What's the deadline to file the ET1 in this matter?";

// Scenario dates are anchored to "now" so the demo never shows a deadline
// that has already lapsed. Khan's dismissal sits ~6 weeks in the past; the
// (unsupported) raw-model deadline is a clean +3 months from it — still in
// the future on any day the demo is shown.
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const shiftDays = (base: Date, n: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
};
const shiftMonths = (base: Date, n: number) => {
  const d = new Date(base);
  d.setMonth(d.getMonth() + n);
  return d;
};
const DISMISSAL = shiftDays(new Date(), -45);
const D = {
  dismissal: fmtDate(DISMISSAL),
  deadline: fmtDate(shiftMonths(DISMISSAL, 3)),
  hearing: fmtDate(shiftDays(DISMISSAL, -2)),
  post: fmtDate(shiftDays(DISMISSAL, -12)),
  grievance: fmtDate(shiftDays(DISMISSAL, -42)),
  nda: fmtDate(shiftDays(DISMISSAL, 50)),
};

const RAW_HTML = `
<p>The deadline to file the ET1 is <span class="ann ann-bluff">${D.deadline}</span>.</p>
<p>Under the Employment Rights Act 1996, an unfair-dismissal claim must be presented within three months of the effective date of termination. <span class="ann ann-bluff">As established in <em>Henderson v Brent London Borough Council</em> [2019] EWCA Civ 1021, the three-month period runs cleanly from the date of the dismissal letter</span>, giving a firm and calculable deadline. Ms Khan was dismissed on ${D.dismissal}, so <span class="ann ann-bluff">the period expires exactly three months later, on ${D.deadline}</span>.</p>
<p><span class="ann ann-slop">It is important to note that this is a firm deadline and the claim should be filed by that date to preserve Ms Khan's position.</span> <span class="ann ann-bluff">Given the procedural failings, the claim is very likely to succeed at hearing.</span></p>`;

const REDLINE_HTML = `
<p>The deadline to file the ET1 is <del>${D.deadline}</del> <ins>not fixed by the documents alone — see below</ins>.</p>
<p>Under the Employment Rights Act 1996 (s.111), an unfair-dismissal claim is normally presented within three months <ins>less one day</ins> of the effective date of termination. <del>As established in Henderson v Brent London Borough Council [2019] EWCA Civ 1021, the three-month period runs cleanly from the date of the dismissal letter.</del> <ins>⚑ No authority by that citation appears in the matter, and the matter contains no case law at all. Two things the documents do not settle are also load-bearing: (a) whether ACAS early conciliation has started; and (b) the exact effective date of termination given the payment in lieu of notice.</ins></p>
<p><del>It is important to note that this</del> <ins>This</ins> is a time-critical deadline. <del>Given the procedural failings, the claim is very likely to succeed at hearing.</del> <ins>Confirm the ACAS position and the effective date of termination before relying on any date.</ins></p>`;

type Skill = { id: string; name: string; blurb: string; fixes: boolean; reads: string; writes: string };

const CATALOGUE: Skill[] = [
  { id: "citation-check", name: "citation / source-anchor check", blurb: "Refuses to assert authority not found in the matter's documents.", fixes: true, reads: "matter.document.read", writes: "matter.artifact.write" },
  { id: "plain-english", name: "plain-english", blurb: "Strips slop and jargon. Plain words a client can read.", fixes: true, reads: "matter.document.read", writes: "matter.artifact.write" },
  { id: "nda-review", name: "nda-review", blurb: "Flags risks in an NDA, clause by clause.", fixes: false, reads: "matter.document.read", writes: "matter.artifact.write" },
  { id: "disclosure-list", name: "disclosure-list", blurb: "Builds a disclosure list from the matter's documents.", fixes: false, reads: "matter.document.read", writes: "matter.artifact.write" },
];

// The record the sign-off creates — the chain, refusal struck in seal.
const AUDIT_ROWS: { label: string; value: string; refused?: boolean }[] = [
  { label: "skill.invoke", value: "citation-check · plain-english run on the draft" },
  { label: "model.call", value: "claude · documents read under the privilege gate" },
  { label: "gate.refuse", value: "authority “Henderson v Brent LBC [2019] EWCA Civ 1021” — not found in source", refused: true },
  { label: "artifact.write", value: "skill_response · draft written to the matter" },
  { label: "output.signed", value: "reviewing solicitor (you) · responsibility accepted" },
];

const DECISIONS: { id: string; title: string; help: string }[] = [
  { id: "sign", title: "Sign", help: "I accept this draft as reviewed." },
  { id: "observations", title: "Sign with observations", help: "Accept the refusals; note what still needs checking." },
  { id: "reject", title: "Reject", help: "Send back for redrafting." },
];

const DOCS: { key: string; label: string; filename: string; text: string }[] = [
  {
    key: "dismissal",
    label: "Dismissal letter",
    filename: "khan-dismissal-letter.pdf",
    text: `ACME TRADING LTD\n${D.dismissal}\n\nDear Ms Khan,\n\nFollowing the disciplinary hearing held on ${D.hearing}, the company has concluded that your conduct — a post published on social media on ${D.post} — constitutes gross misconduct under the Acme Social Media Policy.\n\nYou are summarily dismissed with effect from today, ${D.dismissal}. You will receive a payment in lieu of your notice period.\n\nThe hearing was chaired by Mr R. Caldwell, Warehouse Operations Manager.\n\nYours sincerely,\nFor and on behalf of Acme Trading Ltd`,
  },
  {
    key: "witness",
    label: "Witness statement",
    filename: "witness-statement-khan.docx",
    text: `WITNESS STATEMENT OF JASMINE KHAN\n\n1. The post treated as gross misconduct was made from my personal Instagram account, outside working hours, to a closed audience of 47 followers. None were customers, suppliers, or colleagues.\n\n2. On ${D.grievance} I raised a grievance about Mr Caldwell's conduct toward female members of the warehouse team.\n\n3. The disciplinary hearing on ${D.hearing} was chaired by Mr Caldwell — the same manager who was the subject of my grievance.`,
  },
  {
    key: "nda",
    label: "Mutual NDA",
    filename: "synthetic-mutual-nda.docx",
    text: `MUTUAL NON-DISCLOSURE AGREEMENT\nbetween Acme Trading Ltd and North Mill Consulting Limited · ${D.nda}\n\n3.2  Confidentiality obligations shall continue in force without limit of time.\n\n4.1  Each party shall comply with applicable data protection law.\n\n5.1  The receiving party shall indemnify the disclosing party against all losses without limitation.\n\n[No governing-law or jurisdiction clause.]`,
  },
];

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

function useTypewriter(text: string, active: boolean) {
  const reduce = usePrefersReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduce) return setN(text.length);
    setN(0);
    const id = setInterval(() => {
      setN((prev) => {
        const next = prev + 1;
        if (next >= text.length) clearInterval(id);
        return next;
      });
    }, 22);
    return () => clearInterval(id);
  }, [text, active, reduce]);
  return { shown: reduce ? text : text.slice(0, n), done: n >= text.length || reduce };
}

function Coachmark({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 text-sm leading-relaxed text-prose">{children}</p>
  );
}

function PrimaryBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px]">
      {children}
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-sm text-muted hover:text-seal transition-colors">
      ← Back
    </button>
  );
}


export function GuidedDemo() {
  const [act, setAct] = useState(0);
  const [navOpen, setNavOpen] = useState(false);

  const q = useTypewriter(QUESTION, act === 0);
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [installed, setInstalled] = useState(false);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [showCorrected, setShowCorrected] = useState(true);
  const [signed, setSigned] = useState(false);
  const [decision, setDecision] = useState("observations");
  const reduce = usePrefersReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleSkill = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const runSkills = () => {
    setRunning(true);
    if (reduce) return (setRunning(false), setRan(true), undefined);
    timer.current = setTimeout(() => {
      setRunning(false);
      setRan(true);
    }, 1300);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const chosen = CATALOGUE.filter((s) => selected.has(s.id));

  // Admission scan — the rows that march down with a tick before standing
  // is granted (mirrors the real InstallCeremony ledger).
  const scanRows = [
    ...chosen.flatMap((s) => [
      { label: s.id, value: "manifest structure valid" },
      { label: s.id, value: `reads ${s.reads} · writes ${s.writes}` },
      { label: s.id, value: "gate privilege_posture bound" },
    ]),
    { label: "source", value: "pinned commit · licence MIT · verified" },
  ];
  const [scanN, setScanN] = useState(0);
  const scanComplete = scanN >= scanRows.length;
  useEffect(() => {
    if (act !== 2) return;
    if (installed || reduce) {
      setScanN(scanRows.length);
      return;
    }
    setScanN(0);
    const id = setInterval(() => {
      setScanN((n) => {
        if (n >= scanRows.length) {
          clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, 300);
    return () => clearInterval(id);
    // scanRows.length is the only scan input that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act, installed, reduce, scanRows.length]);

  const railActive = ACT_RAIL[act];
  const globalItems: RailItem[] = [
    { key: "matters", label: "Matters", icon: <NavIcon name="matters" />, href: "/" },
  ];
  // The matter rail is a passive progress indicator here: it lights up the
  // surface the current act touches, but does NOT navigate. (Wiring onSelect
  // turned it into a mislabeled scrubber — clicking "Files" jumped the story
  // backward. Forward/back belongs to the footer step button + Back link.)
  const matterItems: RailItem[] = [
    { key: "assistant", label: "Chat", icon: <NavIcon name="assistant" />, active: railActive === "assistant" },
    { key: "documents", label: "Files", icon: <NavIcon name="documents" />, active: railActive === "documents" },
    { key: "workflows", label: "Skills", icon: <NavIcon name="workflows" />, active: railActive === "workflows" },
    { key: "audit", label: "Record", icon: <NavIcon name="audit" />, active: railActive === "audit" },
  ];

  // The forward action for the pinned footer, by act + state. In-context
  // actions (Run skill, Sign off) stay in their cards; the footer carries
  // the reveal and the act-to-act steps so nothing hides below the fold.
  const resetAll = () => {
    setAct(0);
    setRevealed(false);
    setSelected(new Set());
    setInstalled(false);
    setRan(false);
    setSigned(false);
  };
  let primary: { label: string; onClick: () => void } | null = null;
  if (act === 0 && q.done) {
    primary = revealed
      ? { label: "The fix is a skill →", onClick: () => setAct(1) }
      : { label: "See what went wrong", onClick: () => setRevealed(true) };
  } else if (act === 1 && selected.size > 0) {
    primary = { label: `Install ${selected.size} to the matter →`, onClick: () => setAct(2) };
  } else if (act === 2 && scanComplete) {
    primary = installed
      ? { label: "Run it on the matter →", onClick: () => setAct(3) }
      : { label: "Grant standing & admit", onClick: () => setInstalled(true) };
  } else if (act === 3 && ran) {
    primary = { label: "Send it for sign-off →", onClick: () => setAct(4) };
  } else if (act === 4 && signed) {
    primary = { label: "Replay from the top", onClick: resetAll };
  }

  return (
    <div className="min-h-screen md:h-screen bg-canvas text-ink md:flex md:gap-3 md:p-3 md:overflow-hidden">
      <style>{`
        /* Teaching annotations + redline. */
        .gd-doc p{margin:0 0 .85rem}
        .gd-doc .ann{border-radius:2px;padding:0 2px}
        .gd-doc .ann-bluff{background:rgba(126,43,34,.16);box-shadow:inset 0 -2px 0 #7e2b22}
        .gd-doc .ann-slop{background:rgba(120,110,90,.16)}
        .gd-doc del{color:#9b8f86;text-decoration-color:#7e2b22}
        .gd-doc ins{background:rgba(126,43,34,.07);text-decoration:none;box-shadow:inset 0 -1px 0 rgba(126,43,34,.4)}
      `}</style>

      <SidebarView
        brandHref="/"
        globalItems={globalItems}
        matterTitle="Khan v Acme Trading Ltd"
        matterPosture={{ label: "Active", dot: "bg-seal" }}
        matterItems={matterItems}
        utilItems={[]}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      {/* Mobile bar. */}
      <div className="md:hidden sticky top-0 z-30 flex items-center h-[56px] px-4 bg-canvas border-b border-rule">
        <button type="button" onClick={() => setNavOpen(true)} aria-label="Open menu" className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-ink">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      <main className="min-h-screen bg-panel md:min-h-0 md:flex-1 md:min-w-0 md:h-full md:rounded-panel md:shadow-panel md:overflow-y-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-12">
        <div className="mx-auto w-full max-w-[860px]">
          {/* Demo header — the backend masthead (display tier). */}
          <PageHeader display title="Demo" />

          {/* Action nav — sits under the header, always in view. */}
          <div className="mt-2 flex items-center gap-4 border-b border-rule pb-6">
            {act > 0 && <BackLink onClick={() => setAct(act - 1)} />}
            {primary ? (
              <PrimaryBtn onClick={primary.onClick}>{primary.label}</PrimaryBtn>
            ) : (
              <span className="text-xs text-muted">Read the answer below, then continue.</span>
            )}
          </div>

          <div className="mt-8">
            {/* ── ACT 1 · THE FAILURE (the matter chat) ── */}
            {act === 0 && (
              <div className="mx-auto max-w-[760px]">
                <h2 className="text-2xl font-bold tracking-tight2 text-ink">The version of AI most lawyers have met.</h2>
                <p className="mt-3 text-sm leading-relaxed text-prose">Ask a capable model a real legal question and the answer comes back fluent and sure of itself. Sometimes it is also wrong. The better the lawyer, the faster they see it, distrust the tool, and walk away. The failure is real. It is also catchable.</p>

                <div className="mt-7 space-y-6">
                  {/* user — right-aligned bubble */}
                  <div className="flex justify-end">
                    <div className="max-w-[560px] rounded-card border border-rule bg-wash px-4 py-3 text-[15px] text-ink whitespace-pre-wrap">
                      {q.shown}
                      {!q.done && <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-seal">&nbsp;</span>}
                    </div>
                  </div>
                  {/* assistant — plain prose, no box */}
                  {q.done && (
                    <div>
                      <div className="tech-token text-[11px] text-muted mb-2">Assistant · raw model · no skills installed</div>
                      <div className="gd-doc text-[15px] leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: RAW_HTML }} />
                    </div>
                  )}
                </div>

                {q.done && revealed && (
                  <Coachmark>
                    Fluent, confident, and wrong. <strong>Henderson v Brent LBC</strong> is invented. No such authority appears anywhere in this matter. The padding and the "very likely to succeed" line are bluff too. This is the failure that makes good lawyers quit, and every part of it is catchable.
                  </Coachmark>
                )}
              </div>
            )}

            {/* ── ACT 2 · CHOOSE (the skills register) ── */}
            {act === 1 && (
              <div>
                <h2 className="text-2xl font-bold tracking-tight2 text-ink">You don't fix this with a better prompt. You install a skill.</h2>
                <p className="mt-3 text-sm leading-relaxed text-prose">A skill is a small, vetted unit of legal work. Pick the ones that answer the failure you just saw: the bluff and the slop.</p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {CATALOGUE.map((s, i) => {
                    const on = selected.has(s.id);
                    return (
                      <button key={s.id} type="button" onClick={() => toggleSkill(s.id)} className="block text-left">
                        <CertCard tone={on ? "seal" : "ink"}>
                          <CertEyebrow
                            left={`Skill ${String(i + 1).padStart(2, "0")}`}
                            right={on ? "Selected" : s.fixes ? "Fixes the failure" : "Available"}
                            rightTone={on ? "seal" : "muted"}
                          />
                          <div className="mt-3 tech-token text-sm text-ink">{s.name}</div>
                          <p className="mt-2 text-sm leading-relaxed text-prose">{s.blurb}</p>
                          <div className="mt-4 space-y-2">
                            <InkBands label="Reads" values={[s.reads]} />
                            <InkBands label="Writes" values={[s.writes]} />
                          </div>
                          <dl className="mt-4 space-y-1 border-t border-rule pt-3 text-[11px] text-muted">
                            <LedgerRow label="Gate" tone="ink">privilege_posture</LedgerRow>
                          </dl>
                        </CertCard>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── ACT 3 · INSTALL (the admission ceremony) ── */}
            {act === 2 && (
              <div>
                <h2 className="text-2xl font-bold tracking-tight2 text-ink">A skill is admitted, not uploaded.</h2>
                <p className="mt-3 text-sm leading-relaxed text-prose">Each skill declares what it reads, what it writes, and the gate it runs under. The register checks the manifest, then you grant it standing.</p>

                <div className="mt-7 text-[11px] uppercase tracking-[0.18em] text-muted">Manifest scan</div>
                <div className="mt-1">
                  {scanRows.slice(0, scanN).map((r, i) => (
                    <LedgerLine key={i} index={i + 1} label={r.label} right={<span className="tech-token text-[11px] text-ink">✓</span>}>
                      {r.value}
                    </LedgerLine>
                  ))}
                  {!scanComplete && (
                    <div className="flex items-center gap-2 py-2.5 text-[11px] uppercase tracking-[0.18em] text-muted">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-seal" />
                      scanning
                    </div>
                  )}
                </div>

                {scanComplete && (
                  <p className="mt-6 text-sm leading-relaxed text-prose">
                    The manifests check out. {installed ? "Standing is granted to" : "Grant standing to"}{" "}
                    {chosen.map((s) => s.name).join(" and ")}. From here, everything {installed ? "they do" : "they will do"} lands on the record.
                  </p>
                )}
                {installed && (
                  <Coachmark>An admitted skill cannot reach a document it did not declare, or run on a matter whose privilege posture forbids it. Standing, not cleverness, is what lets it act.</Coachmark>
                )}

              </div>
            )}

            {/* ── ACT 4 · RUN (the skill runner) ── */}
            {act === 3 && (
              <div className="mx-auto max-w-[760px]">
                <h2 className="text-2xl font-bold tracking-tight2 text-ink">Same question. Skills installed.</h2>
                <p className="mt-3 text-sm leading-relaxed text-prose">The skills run inside the matter. They read the documents in scope and rewrite what the source will not support.</p>

                {/* the runner */}
                <div className="mt-6 rounded-card border border-rule bg-paper p-4">
                  <div className="text-[11px] uppercase tracking-widest text-muted">Request</div>
                  <div className="mt-1 border border-rule bg-wash px-3 py-2 text-sm text-ink">{QUESTION}</div>

                  <div className="mt-4 text-[11px] uppercase tracking-widest text-muted">Documents in scope</div>
                  <div className="mt-1 max-h-40 overflow-auto rounded-md border border-rule">
                    {DOCS.map((d) => (
                      <label key={d.key} className="flex items-center gap-2 border-b border-rule px-3 py-1.5 last:border-b-0">
                        <input type="checkbox" checked readOnly className="accent-[#7e2b22]" />
                        <span className="tech-token text-[12px] text-prose">{d.filename}</span>
                      </label>
                    ))}
                  </div>

                  <div className="mt-4 text-[11px] uppercase tracking-widest text-muted">Skills</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {chosen.map((s) => (
                      <span key={s.id} className="rounded-item border border-rule bg-wash px-2 py-0.5 tech-token text-[11px] text-ink">{s.id}</span>
                    ))}
                  </div>

                  {!ran && (
                    <div className="mt-4">
                      <PrimaryBtn onClick={runSkills}>{running ? "Running skill…" : "Run skill"}</PrimaryBtn>
                      {running && <p className="mt-3 text-xs text-muted">Running skill… reading {DOCS.length} documents, checking authority against source.</p>}
                    </div>
                  )}
                </div>

                {/* result artifact */}
                {ran && (
                  <div className="mt-5 rounded-md border border-rule bg-paper p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <span className="tech-token text-[11px] text-muted">Artifact · skill_response · draft</span>
                      <span className="inline-flex border border-rule bg-paper text-xs">
                        <button type="button" onClick={() => setShowCorrected(false)} className={"px-3 py-1.5 " + (!showCorrected ? "bg-ink text-paper" : "text-muted")}>Raw</button>
                        <button type="button" onClick={() => setShowCorrected(true)} className={"px-3 py-1.5 " + (showCorrected ? "bg-ink text-paper" : "text-muted")}>With skills</button>
                      </span>
                    </div>
                    <div className="gd-doc mt-3 text-sm leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: showCorrected ? REDLINE_HTML : RAW_HTML }} />
                    <p className="mt-3 text-xs text-muted"><del className="text-muted">struck</del> = removed by a skill · <span className="text-seal">underlined</span> = added · ⚑ = the citation check refused an unsupported claim.</p>
                  </div>
                )}

                {ran && (
                  <Coachmark>The invented citation is gone, struck by the source-anchor check against the matter's documents. The padding is gone, stripped by plain-english. What is left is anchored to the paper, and the refusal itself is about to land on the record.</Coachmark>
                )}
              </div>
            )}

            {/* ── ACT 5 · GOVERN (sign-off → the record) ── */}
            {act === 4 && (
              <div>
                <h2 className="text-2xl font-bold tracking-tight2 text-ink">The model drafted. A human becomes the authority.</h2>
                <p className="mt-3 text-sm leading-relaxed text-prose">Every output is a draft until a named person reviews it and signs what they will stand behind.</p>

                {!signed ? (
                  <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_320px]">
                    {/* the instrument */}
                    <div>
                      <SectionRule label="The instrument" />
                      <div className="gd-doc mt-4 text-sm leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: REDLINE_HTML }} />
                    </div>
                    {/* the decision */}
                    <div className="self-start border border-rule bg-paper p-4 lg:sticky lg:top-6">
                      <SectionRule label="The decision" />
                      <div className="mt-4 space-y-2">
                        {DECISIONS.map((d) => (
                          <label key={d.id} className={"block cursor-pointer border p-3 text-sm " + (decision === d.id ? "border-ink bg-wash" : "border-rule")}>
                            <span className="flex items-center gap-2">
                              <input type="radio" name="gd-decision" checked={decision === d.id} onChange={() => setDecision(d.id)} className="accent-[#7e2b22]" />
                              <span className="font-medium text-ink">{d.title}</span>
                            </span>
                            <span className="mt-1 block pl-6 text-xs text-muted">{d.help}</span>
                          </label>
                        ))}
                      </div>
                      <textarea
                        rows={3}
                        defaultValue="Accepted the citation refusal. Confirm ACAS position and effective date of termination before relying on any deadline."
                        className="mt-3 w-full border border-rule bg-wash px-3 py-2 text-sm text-ink"
                      />
                      <label className="mt-3 flex items-start gap-2 text-sm text-prose">
                        <input type="checkbox" defaultChecked className="mt-0.5 accent-[#7e2b22]" />
                        I am a qualified person and take responsibility for this output.
                      </label>
                      <div className="mt-4">
                        <PrimaryBtn onClick={() => setSigned(true)}>Sign off</PrimaryBtn>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-7">
                    <SectionRule label="The record" />
                    <div className="mt-2">
                      {AUDIT_ROWS.map((r, i) => (
                        <LedgerLine
                          key={i}
                          index={i + 1}
                          label={r.label}
                          right={<span className={"tech-token text-[11px] " + (r.refused ? "text-seal" : "text-muted")}>{r.refused ? "refused" : "recorded"}</span>}
                        >
                          {r.refused ? <span className="text-seal line-through decoration-1">{r.value}</span> : r.value}
                        </LedgerLine>
                      ))}
                    </div>

                    <div className="relative mt-6 border border-ink/70 bg-paper p-5">
                      <span className="absolute right-5 top-5 -rotate-6 border-2 border-seal px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-seal">Signed</span>
                      <CertEyebrow left="Record · created by the sign-off" />
                      <dl className="mt-4 space-y-1 text-[11px] text-muted">
                        <LedgerRow label="Matter" tone="ink">Khan v Acme Trading Ltd</LedgerRow>
                        <LedgerRow label="Decision" tone="ink">{decision === "sign" ? "Signed" : decision === "reject" ? "Rejected" : "Signed with observations"}</LedgerRow>
                        <LedgerRow label="Signed by" tone="ink">Reviewing solicitor (you)</LedgerRow>
                        <LedgerRow label="Record hash" tone="ink">a1f9·c3e2·77bd·0e41</LedgerRow>
                      </dl>
                    </div>

                    <Coachmark>
                      The refusal carries the same weight as an approval. The citation check's refusal of <strong>Henderson v Brent</strong> is struck onto the record, not hidden. The model drafted and you signed. That is the whole product: choose a skill, install it, run it, and stand behind what it produced.
                    </Coachmark>

                    {/* Where a convinced stranger goes next — the demo no longer
                        dead-ends at "Replay". Deepen, verify, or get in touch. */}
                    <div className="mt-10 border-t border-rule pt-6">
                      <SectionRule label="Where this goes" />
                      <p className="mt-4 text-sm leading-relaxed text-prose">
                        This walk was on rails. The same loop — admit a skill, run it inside the matter, sign it, read the record — is the product. It is open source, and in private beta for evaluators.
                      </p>
                      <div className="mt-5 flex flex-wrap gap-3">
                        <a href="/architecture" className="inline-flex items-center bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px]">See how it's built →</a>
                        <a href="https://github.com/b1rdmania/legalise" className="inline-flex items-center border border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px]">Read the source</a>
                      </div>
                      <p className="mt-4 text-xs text-muted">
                        Evaluating it for a firm or a regulator? <a href="mailto:andrew@legalise.dev" className="text-seal hover:underline">Get in touch</a>.
                      </p>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
