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

const ACTS = ["The failure", "Choose", "Install", "Run", "Govern"] as const;
// Which rail surface each act lights up — so the guided flow drives the
// real nav, not a parallel stepper alone.
const ACT_RAIL = ["assistant", "workflows", "workflows", "documents", "audit"] as const;

const QUESTION = "What's the deadline to file the ET1 in this matter?";

const RAW_HTML = `
<p>The deadline to file the ET1 is <span class="ann ann-bluff">12 June 2026</span>.</p>
<p>Under the Employment Rights Act 1996, an unfair-dismissal claim must be presented within three months of the effective date of termination. <span class="ann ann-bluff">As established in <em>Henderson v Brent London Borough Council</em> [2019] EWCA Civ 1021, the three-month period runs cleanly from the date of the dismissal letter</span>, giving a firm and calculable deadline. Ms Khan was dismissed on 12 March 2026, so <span class="ann ann-bluff">the period expires exactly three months later, on 12 June 2026</span>.</p>
<p><span class="ann ann-slop">It is important to note that this is a firm deadline and the claim should be filed by that date to preserve Ms Khan's position.</span> <span class="ann ann-bluff">Given the procedural failings, the claim is very likely to succeed at hearing.</span></p>`;

const REDLINE_HTML = `
<p>The deadline to file the ET1 is <del>12 June 2026</del> <ins>not fixed by the documents alone — see below</ins>.</p>
<p>Under the Employment Rights Act 1996 (s.111), an unfair-dismissal claim is normally presented within three months <ins>less one day</ins> of the effective date of termination. <del>As established in Henderson v Brent London Borough Council [2019] EWCA Civ 1021, the three-month period runs cleanly from the date of the dismissal letter.</del> <ins>⚑ No authority by that citation appears in the matter, and the matter contains no case law at all. Two things the documents do not settle are also load-bearing: (a) whether ACAS early conciliation has started; and (b) the exact effective date of termination given the payment in lieu of notice.</ins></p>
<p><del>It is important to note that this</del> <ins>This</ins> is a time-critical deadline. <del>Given the procedural failings, the claim is very likely to succeed at hearing.</del> <ins>Confirm the ACAS position and the effective date of termination before relying on any date.</ins></p>`;

type Skill = { id: string; name: string; blurb: string; fixes: boolean; reads: string; writes: string };

const CATALOGUE: Skill[] = [
  { id: "citation-check", name: "citation / source-anchor check", blurb: "Refuses to assert authority not found in the matter's documents.", fixes: true, reads: "matter.document.read", writes: "matter.artifact.write" },
  { id: "plain-english", name: "plain-english", blurb: "Strips slop and jargon. Plain words a client can read.", fixes: true, reads: "matter.document.read", writes: "matter.artifact.write" },
  { id: "nda-review", name: "nda-review", blurb: "Flags risks in an NDA, clause by clause.", fixes: false, reads: "matter.document.read", writes: "matter.artifact.write" },
  { id: "disclosure-list", name: "disclosure-list", blurb: "Builds a disclosure list from the matter's documents.", fixes: false, reads: "matter.document.read", writes: "matter.artifact.write" },
];

const DOCS: { key: string; label: string; filename: string; text: string }[] = [
  {
    key: "dismissal",
    label: "Dismissal letter",
    filename: "khan-dismissal-letter.pdf",
    text: "ACME TRADING LTD\n12 March 2026\n\nDear Ms Khan,\n\nFollowing the disciplinary hearing held on 10 March 2026, the company has concluded that your conduct — a post published on social media on 28 February 2026 — constitutes gross misconduct under the Acme Social Media Policy.\n\nYou are summarily dismissed with effect from today, 12 March 2026. You will receive a payment in lieu of your notice period.\n\nThe hearing was chaired by Mr R. Caldwell, Warehouse Operations Manager.\n\nYours sincerely,\nFor and on behalf of Acme Trading Ltd",
  },
  {
    key: "witness",
    label: "Witness statement",
    filename: "witness-statement-khan.docx",
    text: "WITNESS STATEMENT OF JASMINE KHAN\n\n1. The post treated as gross misconduct was made from my personal Instagram account, outside working hours, to a closed audience of 47 followers. None were customers, suppliers, or colleagues.\n\n2. On 29 January 2026 I raised a grievance about Mr Caldwell's conduct toward female members of the warehouse team.\n\n3. The disciplinary hearing on 10 March 2026 was chaired by Mr Caldwell — the same manager who was the subject of my grievance.",
  },
  {
    key: "nda",
    label: "Mutual NDA",
    filename: "synthetic-mutual-nda.docx",
    text: "MUTUAL NON-DISCLOSURE AGREEMENT\nbetween Acme Trading Ltd and North Mill Consulting Limited · 1 May 2026\n\n3.2  Confidentiality obligations shall continue in force without limit of time.\n\n4.1  Each party shall comply with applicable data protection law.\n\n5.1  The receiving party shall indemnify the disclosing party against all losses without limitation.\n\n[No governing-law or jurisdiction clause.]",
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
    <div className="mt-6 border-l-2 border-seal bg-wash px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.22em] text-seal mb-2">What's going on</div>
      <p className="text-sm leading-relaxed text-prose">{children}</p>
    </div>
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

// The document reader — the matter's paper, on the page. Tabs across the
// three documents, the active one rendered as plain extracted text.
function DocReader({ highlight }: { highlight?: boolean }) {
  const [key, setKey] = useState("dismissal");
  const doc = DOCS.find((d) => d.key === key) ?? DOCS[0];
  return (
    <div className={"border bg-paper " + (highlight ? "border-seal/50" : "border-rule")}>
      <div className="flex border-b border-rule">
        {DOCS.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setKey(d.key)}
            className={
              "px-3 py-2 text-[11px] uppercase tracking-[0.16em] transition-colors " +
              (d.key === key ? "text-ink font-semibold border-b-2 border-seal -mb-px" : "text-muted hover:text-seal")
            }
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="px-4 py-3">
        <div className="tech-token text-[11px] text-muted mb-2">{doc.filename}</div>
        <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-prose">{doc.text}</pre>
      </div>
    </div>
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
      { label: s.id, value: "manifest structure — valid" },
      { label: s.id, value: `reads ${s.reads} · writes ${s.writes}` },
      { label: s.id, value: "gate privilege_posture — bound" },
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
  const matterItems: RailItem[] = [
    { key: "assistant", label: "Chat", icon: <NavIcon name="assistant" />, active: railActive === "assistant", onSelect: () => setAct(0) },
    { key: "documents", label: "Files", icon: <NavIcon name="documents" />, active: railActive === "documents", onSelect: () => setAct(3) },
    { key: "workflows", label: "Skills", icon: <NavIcon name="workflows" />, active: railActive === "workflows", onSelect: () => setAct(1) },
    { key: "audit", label: "Record", icon: <NavIcon name="audit" />, active: railActive === "audit", onSelect: () => setAct(4) },
  ];

  return (
    <div className="gd-almond min-h-screen md:h-screen bg-canvas text-ink md:flex md:gap-3 md:p-3 md:overflow-hidden">
      <style>{`
        /* Almond & Ink — scoped palette override (tokens are static). */
        .gd-almond.bg-canvas,.gd-almond .bg-canvas{background-color:#E9E2D4!important}
        .gd-almond .bg-panel,.gd-almond .bg-panel-2{background-color:#F2ECE1!important}
        .gd-almond .bg-paper{background-color:#F6F1E8!important}
        .gd-almond .bg-wash{background-color:#EFE9DD!important}
        .gd-almond .bg-panel-sel{background-color:#E0D7C6!important}
        .gd-almond .bg-ink{background-color:#221E17!important}
        .gd-almond .bg-seal,.gd-almond .hover\\:bg-seal:hover{background-color:#7E2B22!important}
        .gd-almond .text-ink{color:#221E17!important}
        .gd-almond .text-prose{color:#564E42!important}
        .gd-almond .text-muted{color:#8B8273!important}
        .gd-almond .text-seal,.gd-almond .hover\\:text-seal:hover{color:#7E2B22!important}
        .gd-almond .text-paper{color:#F6F1E8!important}
        .gd-almond .border-rule{border-color:#E0D8C9!important}
        .gd-almond .border-rule\\/60{border-color:rgba(224,216,201,.6)!important}
        .gd-almond .border-ink{border-color:#221E17!important}
        .gd-almond .border-ink\\/70{border-color:rgba(34,30,23,.72)!important}
        .gd-almond .border-seal,.gd-almond .border-seal\\/50,.gd-almond .border-seal\\/40{border-color:rgba(126,43,34,.55)!important}
        .gd-almond .decoration-rule{text-decoration-color:#E0D8C9!important}
        .gd-almond .decoration-seal{text-decoration-color:#7E2B22!important}
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
          {/* Matter header — the real backend masthead (PageHeader). */}
          <PageHeader
            display
            title="Khan v Acme Trading Ltd"
            description="Jasmine Khan · claimant · s.94 ERA 1996 unfair dismissal"
          />

          {/* Stepper — the one piece of guided chrome. */}
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Demo acts">
            {ACTS.map((label, i) => (
              <span key={label} aria-current={i === act ? "step" : undefined}
                className={"text-[11px] uppercase tracking-[0.18em] " + (i === act ? "text-ink font-semibold" : i < act ? "text-seal" : "text-muted/50")}>
                {String(i + 1).padStart(2, "0")} · {label}
              </span>
            ))}
          </nav>

          <div className="mt-8">
            {/* ── ACT 1 · THE FAILURE ── */}
            {act === 0 && (
              <div>
                <h2 className="text-2xl font-bold tracking-tight2 text-ink">The version of AI most lawyers have met.</h2>
                <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_300px]">
                  <div>
                    <div className="border border-rule bg-paper">
                      <div className="border-b border-rule px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-muted">You ask</div>
                      <div className="px-4 py-3 text-sm text-ink">
                        {q.shown}
                        {!q.done && <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-seal">&nbsp;</span>}
                      </div>
                    </div>
                    {q.done && (
                      <div className="mt-4 border border-rule bg-paper">
                        <div className="border-b border-rule px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-muted">Claude · raw</div>
                        <div className="gd-doc px-4 py-4 text-sm leading-relaxed text-prose" dangerouslySetInnerHTML={{ __html: RAW_HTML }} />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted mb-2">The matter's documents</div>
                    <DocReader />
                  </div>
                </div>
                {q.done && revealed && (
                  <Coachmark>
                    Fluent, confident, and wrong. <strong>Henderson v Brent LBC</strong> is invented — there's no such authority anywhere in this matter (check the documents on the right). The padding and the "very likely to succeed" prediction are bluff too. This is the failure that makes good lawyers quit. It's catchable.
                  </Coachmark>
                )}
                <div className="mt-8">
                  {!revealed ? (q.done && <PrimaryBtn onClick={() => setRevealed(true)}>See what went wrong</PrimaryBtn>) : <PrimaryBtn onClick={() => setAct(1)}>The fix is a skill →</PrimaryBtn>}
                </div>
              </div>
            )}

            {/* ── ACT 2 · CHOOSE (the skills register) ── */}
            {act === 1 && (
              <div>
                <h2 className="text-2xl font-bold tracking-tight2 text-ink">You don't fix this with a better prompt. You install a skill.</h2>
                <p className="mt-3 text-sm leading-relaxed text-prose">A skill is a small, vetted unit of legal work. Pick the ones that answer the failure you just saw — the bluff and the slop.</p>
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
                <div className="mt-8 flex items-center gap-4">
                  <BackLink onClick={() => setAct(0)} />
                  {selected.size > 0 && <PrimaryBtn onClick={() => setAct(2)}>Install {selected.size} to the matter →</PrimaryBtn>}
                </div>
              </div>
            )}

            {/* ── ACT 3 · INSTALL (the admission ceremony) ── */}
            {act === 2 && (
              <div>
                <h2 className="text-2xl font-bold tracking-tight2 text-ink">A skill is admitted, not just uploaded.</h2>
                <p className="mt-3 text-sm leading-relaxed text-prose">The register scans each manifest — what it reads, what it writes, the gate it runs under, the source it came from. Only then do you grant it standing in the matter.</p>

                <div className="mt-7">
                  <SectionRule label="Admission · manifest scan" right={`${Math.min(scanN, scanRows.length)} / ${scanRows.length}`} />
                  <div className="mt-1">
                    {scanRows.slice(0, scanN).map((r, i) => (
                      <LedgerLine
                        key={i}
                        index={i + 1}
                        label={r.label}
                        right={<span className="tech-token text-[11px] text-ink">✓</span>}
                      >
                        {r.value}
                      </LedgerLine>
                    ))}
                    {!scanComplete && (
                      <div className="flex items-center gap-2 py-2.5 text-[11px] uppercase tracking-[0.18em] text-muted">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-seal" />
                        scanning…
                      </div>
                    )}
                  </div>
                </div>

                {scanComplete && (
                  <div className="mt-8">
                    <SectionRule label="Grant of standing" right={installed ? "Granted" : "Your decision"} />
                    <p className="mt-4 text-sm leading-relaxed text-prose">
                      The manifests check out. {installed ? "Standing is granted" : "Grant standing"} to{" "}
                      {chosen.map((s) => s.name).join(" and ")} — and from here, everything {installed ? "they do" : "they will do"} lands on the record.
                    </p>
                    {installed && (
                      <Coachmark>An admitted skill can't reach a document it didn't declare, or run on a matter whose privilege posture forbids it. Standing, not cleverness, is what lets it act.</Coachmark>
                    )}
                  </div>
                )}

                <div className="mt-8 flex items-center gap-4">
                  <BackLink onClick={() => setAct(1)} />
                  {scanComplete &&
                    (!installed ? (
                      <PrimaryBtn onClick={() => setInstalled(true)}>Grant standing &amp; admit</PrimaryBtn>
                    ) : (
                      <PrimaryBtn onClick={() => setAct(3)}>Run it on the matter →</PrimaryBtn>
                    ))}
                </div>
              </div>
            )}

            {/* ── ACT 4 · RUN → REDLINE (with the document open) ── */}
            {act === 3 && (
              <div>
                <h2 className="text-2xl font-bold tracking-tight2 text-ink">Same question. Skills installed.</h2>
                <p className="mt-3 text-sm leading-relaxed text-prose">The skills run against the matter's documents — open on the right. Watch the bluff get struck and the padding stripped.</p>
                <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_300px]">
                  <div>
                    {!ran && (
                      <div>
                        <PrimaryBtn onClick={runSkills}>{running ? "Running…" : "Run the installed skills"}</PrimaryBtn>
                        {running && (
                          <div className="mt-4 space-y-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                            {chosen.map((s) => (
                              <div key={s.id} className="flex items-center gap-2">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-seal" />
                                {s.name} · reading documents…
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {ran && (
                      <>
                        <div className="inline-flex border border-rule bg-paper text-xs">
                          <button type="button" onClick={() => setShowCorrected(false)} className={"px-3 py-2 " + (!showCorrected ? "bg-ink text-paper" : "text-muted")}>Raw</button>
                          <button type="button" onClick={() => setShowCorrected(true)} className={"px-3 py-2 " + (showCorrected ? "bg-ink text-paper" : "text-muted")}>With skills</button>
                        </div>
                        <div className="mt-3 border border-rule bg-paper">
                          <div className="border-b border-rule px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-muted">{showCorrected ? "Claude · citation-check + plain-english" : "Claude · raw"}</div>
                          <div className="gd-doc px-4 py-4 text-sm leading-relaxed text-prose" dangerouslySetInnerHTML={{ __html: showCorrected ? REDLINE_HTML : RAW_HTML }} />
                        </div>
                        <p className="mt-3 text-xs text-muted"><del className="text-muted">struck</del> = removed by a skill · <span className="text-seal">underlined</span> = added · ⚑ = the citation check refused an unsupported claim.</p>
                      </>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted mb-2">Checked against</div>
                    <DocReader highlight={ran} />
                  </div>
                </div>
                {ran && (
                  <Coachmark>The invented citation is gone, struck by the source-anchor check against the documents on the right. The padding is gone, stripped by plain-english. What's left is anchored to the paper — and the refusal itself is about to land on the record.</Coachmark>
                )}
                <div className="mt-8 flex items-center gap-4">
                  <BackLink onClick={() => setAct(2)} />
                  {ran && <PrimaryBtn onClick={() => setAct(4)}>Send it to the record →</PrimaryBtn>}
                </div>
              </div>
            )}

            {/* ── ACT 5 · GOVERN (scaffold) ── */}
            {act === 4 && (
              <div>
                <h2 className="text-2xl font-bold tracking-tight2 text-ink">The model drafted. A human becomes the authority.</h2>
                <p className="mt-3 text-sm leading-relaxed text-prose">Next: SAW-vs-ASSERTED, the refusal struck on the record, and the sign-off where a named person takes responsibility. (Porting the harness's audit + sign-off card here next.)</p>
                <div className="mt-8 flex items-center gap-4">
                  <BackLink onClick={() => setAct(3)} />
                  <PrimaryBtn onClick={() => { setAct(0); setRevealed(false); setSelected(new Set()); setInstalled(false); setRan(false); }}>Replay from the top</PrimaryBtn>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
