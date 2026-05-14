import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import {
  confirmGate,
  createMatter,
  draftLetter,
  exportPreMotionPdf,
  getChronology,
  getLetterCatalogue,
  getMatter,
  listAudit,
  listDocuments,
  listMatters,
  runPreMotionStream,
  setPrivilege,
  uploadDocument,
  type AuditEntry,
  type ChronologyResponse,
  type LetterCatalogue,
  type LetterDraft,
  type Matter,
  type MatterDocument,
  type PreMotionRunResult,
} from "./lib/api";

type StageProgress = {
  index: number;
  stage: string;
  sub_agent_count: number;
  status: "running" | "done" | "error";
  duration_ms?: number;
  token_count?: number;
  errors?: string[];
};
import { navigate, useRoute } from "./lib/route";

type HealthResponse = { status: string; version: string; database: string; environment: string };

export default function App() {
  const route = useRoute();
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((data: HealthResponse) => setHealth(data))
      .catch(() => setHealth(null));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar health={health} />
      <main className="flex-1">
        {route.name === "list" && <MatterList />}
        {route.name === "new" && <NewMatter />}
        {route.name === "detail" && <MatterDetail slug={route.slug} />}
      </main>
    </div>
  );
}

// ---------- top bar ---------------------------------------------------------

function TopBar({ health }: { health: HealthResponse | null }) {
  const dbOk = health?.database === "ok";
  return (
    <header className="border-b border-graphite px-6 py-3 flex items-center justify-between sticky top-0 bg-carbon z-30">
      <a
        href="#/"
        className="font-mono text-[12px] tracking-[0.053em] text-platinum flex items-center gap-3 hover:text-snow"
      >
        <span className="inline-grid place-items-center w-[18px] h-[18px] border border-slate text-terminal-green text-[11px]">
          ▌
        </span>
        <span className="text-snow">oxide-legal</span>
        <span className="text-dim-gray">/</span>
        <span className="text-light-gray">matters</span>
      </a>
      <nav className="flex items-center gap-5">
        <a href="#/" className="text-[12px] text-light-gray hover:text-snow border-t border-graphite px-1.5 pt-2 pb-2">
          Matters
        </a>
        <a href="#/matters/new" className="text-[12px] text-light-gray hover:text-snow border-t border-graphite px-1.5 pt-2 pb-2">
          New
        </a>
      </nav>
      <div className="flex items-center gap-4 font-mono text-[11px] tracking-[0.014em] text-steel-gray">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block w-1.5 h-1.5 ${dbOk ? "bg-terminal-green" : "bg-code-red"}`}
            aria-hidden
          />
          <span className={dbOk ? "text-terminal-green" : "text-code-red"}>
            {dbOk ? "lhr1" : "unreachable"}
          </span>
        </span>
        {health && <span className="text-dim-gray">v{health.version}</span>}
        <span className="text-light-gray">jasmine.k</span>
      </div>
    </header>
  );
}

// ---------- matters list ----------------------------------------------------

function MatterList() {
  const [matters, setMatters] = useState<Matter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMatters()
      .then((rows) => setMatters(rows))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="max-w-[1100px] mx-auto px-8 py-12">
      <SectionLabel id="§index" name="matters" />
      <h1 className="font-sans text-snow text-[50px] leading-[1.1] tracking-[-0.05px] mb-8">
        All matters.
      </h1>

      <div className="flex items-center justify-between mb-6">
        <p className="font-mono text-[12px] tracking-[0.053em] text-ash-gray">
          {matters ? `${matters.length} record${matters.length === 1 ? "" : "s"}` : "loading…"}
        </p>
        <a
          href="#/matters/new"
          className="font-mono text-[12px] tracking-[0.053em] text-terminal-green bg-deep-teal px-3 h-7 inline-flex items-center shadow-subtle hover:bg-emerald-shadow"
        >
          NEW MATTER →
        </a>
      </div>

      {error && <pre className="font-mono text-[12px] text-code-red whitespace-pre-wrap mb-4">{error}</pre>}

      {matters && matters.length === 0 && (
        <div className="border border-graphite p-6 font-mono text-[12px] text-dim-gray">
          no matters yet — create one with{" "}
          <a href="#/matters/new" className="text-terminal-green hover:underline">
            new matter
          </a>
          .
        </div>
      )}

      {matters && matters.length > 0 && (
        <div className="border border-graphite">
          <div className="grid grid-cols-[1fr_140px_180px_120px] gap-4 px-3 py-2 bg-graphite text-dim-gray font-mono text-[10px] tracking-[0.014em] uppercase border-b border-slate">
            <span>slug</span>
            <span>type</span>
            <span>opened</span>
            <span className="text-right">status</span>
          </div>
          {matters.map((m) => (
            <a
              key={m.id}
              href={`#/matters/${m.slug}`}
              className="grid grid-cols-[1fr_140px_180px_120px] gap-4 px-3 py-2 font-mono text-[12px] tracking-[0.053em] border-b border-graphite last:border-b-0 hover:bg-graphite/50"
            >
              <span className="text-snow truncate">{m.slug}</span>
              <span className="text-light-gray truncate">{m.matter_type}</span>
              <span className="text-steel-gray">{m.opened_at.slice(0, 10)}</span>
              <span className="text-right">
                <StatusBadge status={m.status} />
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- new matter ------------------------------------------------------

function NewMatter() {
  const [form, setForm] = useState({
    title: "",
    matter_type: "employment_tribunal",
    cause: "s.94 ERA 1996, unfair dismissal",
    case_theory: "",
    pivot_fact: "",
    privilege_posture: "B_mixed",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const matter = await createMatter(form);
      navigate(`/matters/${matter.slug}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[820px] mx-auto px-8 py-12">
      <SectionLabel id="§new" name="matter create" />
      <h1 className="font-sans text-snow text-[50px] leading-[1.1] tracking-[-0.05px] mb-8">
        New matter.
      </h1>

      <form onSubmit={submit} className="space-y-6">
        <Field label="title" hint="becomes the slug">
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Khan v Acme Trading Ltd"
            className="w-full bg-transparent border-t border-slate text-platinum font-sans text-[16px] px-3 py-2 focus:outline-none focus:border-terminal-green"
          />
        </Field>

        <Field label="matter_type">
          <input
            value={form.matter_type}
            onChange={(e) => setForm({ ...form, matter_type: e.target.value })}
            className="w-full bg-transparent border-t border-slate text-platinum font-mono text-[12px] tracking-[0.053em] px-3 py-2 focus:outline-none focus:border-terminal-green"
          />
        </Field>

        <Field label="cause">
          <input
            value={form.cause}
            onChange={(e) => setForm({ ...form, cause: e.target.value })}
            className="w-full bg-transparent border-t border-slate text-platinum font-sans text-[14px] px-3 py-2 focus:outline-none focus:border-terminal-green"
          />
        </Field>

        <Field label="case_theory" hint="optional">
          <textarea
            rows={4}
            value={form.case_theory}
            onChange={(e) => setForm({ ...form, case_theory: e.target.value })}
            className="w-full bg-transparent border-t border-slate text-platinum font-sans text-[14px] px-3 py-2 focus:outline-none focus:border-terminal-green resize-y"
          />
        </Field>

        <Field label="pivot_fact" hint="optional">
          <input
            value={form.pivot_fact}
            onChange={(e) => setForm({ ...form, pivot_fact: e.target.value })}
            className="w-full bg-transparent border-t border-slate text-platinum font-sans text-[14px] px-3 py-2 focus:outline-none focus:border-terminal-green"
          />
        </Field>

        <Field label="privilege_posture">
          <select
            value={form.privilege_posture}
            onChange={(e) => setForm({ ...form, privilege_posture: e.target.value })}
            className="w-full bg-transparent border-t border-slate text-platinum font-mono text-[12px] tracking-[0.053em] px-3 py-2 focus:outline-none focus:border-terminal-green"
          >
            <option value="A_cleared">A_cleared — frontier models allowed</option>
            <option value="B_mixed">B_mixed — default · local preferred</option>
            <option value="C_paused">C_paused — LLM calls blocked</option>
          </select>
        </Field>

        {error && <pre className="font-mono text-[12px] text-code-red whitespace-pre-wrap">{error}</pre>}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || !form.title}
            className="font-mono text-[12px] tracking-[0.053em] text-terminal-green bg-deep-teal px-3 h-7 inline-flex items-center shadow-subtle hover:bg-emerald-shadow disabled:opacity-40"
          >
            {submitting ? "CREATING…" : "CREATE →"}
          </button>
          <a
            href="#/"
            className="font-sans text-[12px] text-platinum hover:text-snow border-t border-slate hover:border-terminal-green px-3 py-2"
          >
            cancel
          </a>
        </div>
      </form>
    </div>
  );
}

// ---------- matter detail ---------------------------------------------------

function MatterDetail({ slug }: { slug: string }) {
  const [matter, setMatter] = useState<Matter | null>(null);
  const [docs, setDocs] = useState<MatterDocument[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [premotion, setPremotion] = useState<PreMotionRunResult | null>(null);
  const [premotionRunning, setPremotionRunning] = useState(false);
  const [premotionError, setPremotionError] = useState<string | null>(null);
  const [premotionStages, setPremotionStages] = useState<StageProgress[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [chron, setChron] = useState<ChronologyResponse | null>(null);
  const [showSoF, setShowSoF] = useState(false);
  const [letterCat, setLetterCat] = useState<LetterCatalogue | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [letterDraft, setLetterDraft] = useState<LetterDraft | null>(null);
  const [letterDrafting, setLetterDrafting] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);

  const load = () => {
    getMatter(slug)
      .then(setMatter)
      .catch((e) => setError(String(e)));
    listDocuments(slug).then(setDocs).catch(() => undefined);
    listAudit(slug, 20).then(setAudit).catch(() => undefined);
    getChronology(slug).then(setChron).catch(() => undefined);
    getLetterCatalogue(slug)
      .then((cat) => {
        setLetterCat(cat);
        setSelectedLetter((prev) => prev ?? cat.letter_types.find((lt) => lt.is_default)?.id ?? cat.letter_types[0]?.id ?? null);
      })
      .catch(() => undefined);
  };

  useEffect(load, [slug]);

  const onConfirmGate = async () => {
    try {
      await confirmGate(
        slug,
        "I confirm the CPR 31.22 implied undertaking — disclosed material is used only for these proceedings.",
      );
      getChronology(slug).then(setChron).catch(() => undefined);
      listAudit(slug, 20).then(setAudit).catch(() => undefined);
    } catch (err) {
      setError(String(err));
    }
  };

  const onRunPremotion = async () => {
    setPremotionRunning(true);
    setPremotionError(null);
    setPremotion(null);
    setPremotionStages([]);
    try {
      for await (const ev of runPreMotionStream(slug, { depth: "thorough" })) {
        if (ev.event === "stage.start") {
          setPremotionStages((prev) => [
            ...prev.filter((s) => s.index !== ev.data.index),
            {
              index: ev.data.index,
              stage: ev.data.stage,
              sub_agent_count: ev.data.sub_agent_count,
              status: "running",
            },
          ]);
        } else if (ev.event === "stage.end") {
          setPremotionStages((prev) =>
            prev.map((s) =>
              s.index === ev.data.index
                ? {
                    ...s,
                    status: ev.data.errors?.length ? "error" : "done",
                    duration_ms: ev.data.duration_ms,
                    token_count: ev.data.token_count,
                    errors: ev.data.errors,
                  }
                : s,
            ),
          );
        } else if (ev.event === "result") {
          setPremotion(ev.data);
        } else if (ev.event === "error") {
          setPremotionError(ev.data.message);
        }
      }
      listAudit(slug, 30).then(setAudit).catch(() => undefined);
    } catch (err) {
      setPremotionError(String(err));
    } finally {
      setPremotionRunning(false);
    }
  };

  const onExportPdf = async () => {
    if (!premotion) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const blob = await exportPreMotionPdf(slug, premotion);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pre-motion-${slug}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      listAudit(slug, 30).then(setAudit).catch(() => undefined);
    } catch (err) {
      setPdfError(String(err));
    } finally {
      setPdfBusy(false);
    }
  };

  const onDraftLetter = async () => {
    if (!selectedLetter) return;
    setLetterDrafting(true);
    setLetterError(null);
    setLetterDraft(null);
    try {
      const draft = await draftLetter(slug, selectedLetter);
      setLetterDraft(draft);
      listAudit(slug, 30).then(setAudit).catch(() => undefined);
    } catch (err) {
      setLetterError(String(err));
    } finally {
      setLetterDrafting(false);
    }
  };

  const onPostureChange = async (next: string) => {
    if (!matter || matter.privilege_posture === next) return;
    try {
      const updated = await setPrivilege(slug, next);
      setMatter(updated);
      listAudit(slug, 20).then(setAudit).catch(() => undefined);
    } catch (err) {
      setError(String(err));
    }
  };

  if (error) {
    return (
      <div className="max-w-[1100px] mx-auto px-8 py-12">
        <pre className="font-mono text-[12px] text-code-red">{error}</pre>
        <a href="#/" className="font-sans text-[12px] text-light-gray hover:text-snow">← back to matters</a>
      </div>
    );
  }

  if (!matter) {
    return (
      <div className="max-w-[1100px] mx-auto px-8 py-12 font-mono text-[12px] text-dim-gray">
        loading {slug}…
      </div>
    );
  }

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadDocument(slug, file);
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto px-8 py-12">
      {/* hero -------------------------------------------------- */}
      <div className="mb-12">
        <div className="font-mono text-[12px] tracking-[0.053em] text-platinum mb-6">
          <span className="text-terminal-green">oxide-legal&nbsp;$</span>{" "}
          <span>matter inspect</span> <span className="text-light-gray">{matter.slug}</span>
          <span className="inline-block w-2 h-3.5 bg-emerald-shadow ml-2 align-text-bottom animate-pulse" />
        </div>
        <h1 className="font-sans font-normal text-[65px] leading-[1.1] tracking-[-0.05px] text-snow mb-4">
          {matter.title}
        </h1>
        <div className="font-mono text-[12px] tracking-[0.053em] text-ash-gray mb-6">
          <span className="text-dim-gray">type:</span> <span className="text-platinum">{matter.matter_type}</span>
          {matter.cause && (
            <>
              &nbsp;&nbsp;<span className="text-dim-gray">cause:</span>{" "}
              <span className="text-platinum">{matter.cause}</span>
            </>
          )}
          &nbsp;&nbsp;<span className="text-dim-gray">opened:</span>{" "}
          <span className="text-platinum">{matter.opened_at.slice(0, 10)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={matter.status} />
          <Badge>{matter.matter_type.toUpperCase()}</Badge>
          <PrivilegeControl value={matter.privilege_posture} onChange={onPostureChange} />
          <BadgeViolet>{matter.default_model_id}</BadgeViolet>
        </div>
      </div>

      {/* case theory ------------------------------------------- */}
      {(matter.case_theory || matter.pivot_fact) && (
        <section className="mb-14">
          <SectionLabel id="§theory" name="theory_of_case" />
          {matter.case_theory && (
            <p className="font-sans text-[16px] leading-[1.45] text-ash-gray max-w-[70ch] whitespace-pre-wrap mb-4">
              {matter.case_theory}
            </p>
          )}
          {matter.pivot_fact && (
            <p className="font-sans text-[16px] leading-[1.45] text-platinum max-w-[70ch] whitespace-pre-wrap">
              <span className="text-terminal-green">pivot fact —</span> {matter.pivot_fact}
            </p>
          )}
        </section>
      )}

      {/* documents --------------------------------------------- */}
      <section className="mb-14">
        <SectionLabel id="§bundle" name={`documents · matters/${matter.slug}/files/`} />
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-sans text-[25px] text-snow">Bundle.</h2>
          <label className="font-mono text-[12px] tracking-[0.053em] text-terminal-green bg-deep-teal px-3 h-7 inline-flex items-center shadow-subtle hover:bg-emerald-shadow cursor-pointer">
            UPLOAD →
            <input type="file" className="hidden" onChange={onUpload} />
          </label>
        </div>

        {!docs && <p className="font-mono text-[12px] text-dim-gray">loading documents…</p>}
        {docs && docs.length === 0 && (
          <p className="font-mono text-[12px] text-dim-gray border border-graphite p-4">
            no documents registered yet — use UPLOAD →
          </p>
        )}
        {docs && docs.length > 0 && (
          <div className="font-mono text-[12px] tracking-[0.053em] leading-[1.6] text-platinum">
            {docs.map((d) => (
              <div
                key={d.id}
                className="grid grid-cols-[110px_100px_70px_140px_1fr_120px] gap-4 py-2 border-b border-dashed border-graphite last:border-b-0 items-center"
              >
                <span className="text-dim-gray">-rw-r--r--</span>
                <span className="text-light-gray truncate">jasmine.k</span>
                <span className="text-steel-gray text-right">{formatBytes(d.size_bytes)}</span>
                <span className="text-steel-gray">{d.uploaded_at.slice(0, 16).replace("T", " ")}</span>
                <span className="text-snow truncate">{d.filename}</span>
                <span className="text-right">{d.tag && <Badge>{d.tag.toUpperCase()}</Badge>}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* pre-motion -------------------------------------------- */}
      <section className="mb-14">
        <SectionLabel id="§pre-motion" name="modules · uk-litigation-legal/pre-motion · 4-stage pipeline" />
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-sans text-[25px] text-snow">Pre-Motion.</h2>
          <button
            onClick={onRunPremotion}
            disabled={premotionRunning || matter.privilege_posture === "C_paused"}
            className="font-mono text-[12px] tracking-[0.053em] text-terminal-green bg-deep-teal px-3 h-7 inline-flex items-center shadow-subtle hover:bg-emerald-shadow disabled:opacity-40 disabled:cursor-not-allowed"
            title={matter.privilege_posture === "C_paused" ? "Privilege posture C_paused blocks LLM calls" : ""}
          >
            {premotionRunning ? "RUNNING…" : "RUN PREMORTEM →"}
          </button>
        </div>
        <p className="font-sans text-[14px] text-ash-gray max-w-[70ch] mb-4">
          Adversarial premortem: <span className="text-platinum">Optimistic Analyst →
          Evidence Inspector × 3 parallel sub-agents → Premortem Adversary × 4 parallel
          sub-agents → Synthesiser.</span> 9 model calls per run, all audited.
        </p>
        {premotionError && (
          <pre className="font-mono text-[12px] text-code-red whitespace-pre-wrap mb-3 border border-code-error p-3">
            {premotionError}
          </pre>
        )}
        {(premotionRunning || premotionStages.length > 0) && !premotion && (
          <PremotionStageStrip stages={premotionStages} />
        )}
        {premotion && (
          <>
            <div className="flex items-center justify-end gap-3 mb-3">
              {pdfError && (
                <span className="font-mono text-[11px] text-code-red truncate max-w-[40ch]">
                  {pdfError}
                </span>
              )}
              <button
                onClick={onExportPdf}
                disabled={pdfBusy}
                className="font-mono text-[12px] tracking-[0.053em] text-terminal-green bg-deep-teal px-3 h-7 inline-flex items-center shadow-subtle hover:bg-emerald-shadow disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pdfBusy ? "RENDERING…" : "EXPORT PDF →"}
              </button>
            </div>
            <PremotionResult result={premotion} />
          </>
        )}
      </section>

      {/* letters ----------------------------------------------- */}
      <section className="mb-14">
        <SectionLabel
          id="§letters"
          name={`modules · letters · routed by matter_type=${matter.matter_type}`}
        />
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-sans text-[25px] text-snow">Letters.</h2>
          <button
            onClick={onDraftLetter}
            disabled={
              letterDrafting ||
              matter.privilege_posture === "C_paused" ||
              !selectedLetter ||
              !letterCat ||
              letterCat.letter_types.length === 0
            }
            className="font-mono text-[12px] tracking-[0.053em] text-terminal-green bg-deep-teal px-3 h-7 inline-flex items-center shadow-subtle hover:bg-emerald-shadow disabled:opacity-40 disabled:cursor-not-allowed"
            title={matter.privilege_posture === "C_paused" ? "Privilege posture C_paused blocks LLM calls" : ""}
          >
            {letterDrafting ? "DRAFTING…" : "DRAFT LETTER →"}
          </button>
        </div>
        <p className="font-sans text-[14px] text-ash-gray max-w-[70ch] mb-4">
          Routed by matter type. ET matters surface{" "}
          <span className="text-platinum">uk-employment-legal/lba-drafter</span> as default; civil
          matters surface <span className="text-platinum">uk-litigation-legal/cpr-letter-drafter</span>.
          Each draft writes <span className="text-platinum">plugin.invoked + model.call + http.post</span> to the audit log.
        </p>

        {!letterCat && <p className="font-mono text-[12px] text-dim-gray">loading catalogue…</p>}
        {letterCat && letterCat.letter_types.length === 0 && (
          <p className="font-mono text-[12px] text-dim-gray border border-graphite p-4">
            no letter skills mapped for matter_type={letterCat.matter_type}. Add to
            <span className="text-light-gray"> app/modules/letters/catalog.py</span>.
          </p>
        )}

        {letterCat && letterCat.letter_types.length > 0 && (
          <LetterSelector
            catalogue={letterCat}
            selected={selectedLetter}
            onSelect={setSelectedLetter}
          />
        )}

        {letterError && (
          <pre className="font-mono text-[12px] text-code-red whitespace-pre-wrap mt-3 border border-code-error p-3">
            {letterError}
          </pre>
        )}

        {letterDraft && <LetterDraftView draft={letterDraft} />}
      </section>

      {/* chronology -------------------------------------------- */}
      <section className="mb-14">
        <SectionLabel id="§chronology" name="chronology · seeded fixture · v0.2 lifts to live extraction" />
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-sans text-[25px] text-snow">Chronology.</h2>
          {chron && chron.events.length > 0 && (
            <div className="flex items-center gap-3">
              <ToggleButton active={!showSoF} onClick={() => setShowSoF(false)}>
                FULL
              </ToggleButton>
              <ToggleButton active={showSoF} onClick={() => setShowSoF(true)}>
                STMT OF FACTS
              </ToggleButton>
            </div>
          )}
        </div>

        {!chron && <p className="font-mono text-[12px] text-dim-gray">loading chronology…</p>}

        {chron && chron.gate.required && !chron.gate.confirmed && (
          <CprGateBanner count={chron.gate.tainted_event_count} onConfirm={onConfirmGate} />
        )}

        {chron && chron.events.length === 0 && (
          <p className="font-mono text-[12px] text-dim-gray border border-graphite p-4">
            no events seeded. live extraction lands v0.2.
          </p>
        )}

        {chron && chron.events.length > 0 && (
          <ChronologyTable events={showSoF ? chron.statement_of_facts_variant : chron.events} />
        )}

        {chron && chron.gate.confirmed && chron.gate.confirmed_at && (
          <p className="font-mono text-[11px] text-steel-gray mt-3">
            cpr_31_22_acknowledged · {chron.gate.confirmed_at.slice(0, 19).replace("T", " ")}
          </p>
        )}
      </section>

      {/* contract review (v0.2 roadmap) ------------------------ */}
      <section className="mb-14">
        <SectionLabel
          id="§contract-review"
          name="modules · contract_review · v0.2 — visible, not yet active"
        />
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-sans text-[25px] text-snow">Contract Review.</h2>
          <span className="font-mono text-[11px] tracking-[0.053em] uppercase bg-graphite text-platinum px-1.5 py-px shadow-subtle-2">
            v0.2
          </span>
        </div>
        <p className="font-sans text-[14px] leading-[1.5] text-ash-gray max-w-[70ch] mb-4">
          Four-agent contract pipeline —{" "}
          <span className="text-platinum">Parser → Analyst → Redliner → Summariser</span> —
          graduates from the Counsel MVP via straight port onto{" "}
          <span className="text-platinum">app.core.api</span>. v0.1 ships the spine the pipeline
          will plug into (matter, documents, audit, privilege posture, model gateway, plugin
          bridge); the agents themselves land v0.2. Tab visible here so the roadmap is honest,
          not hidden behind a feature flag.
        </p>
        <div className="border border-graphite p-3 font-mono text-[12px] tracking-[0.053em] text-dim-gray space-y-1">
          <div>$ cat docs/ROADMAP.md | grep -A4 contract_review</div>
          <div className="text-steel-gray">  v0.2 · Parser    — clause segmentation + structural extraction</div>
          <div className="text-steel-gray">  v0.2 · Analyst   — issue spotting against matter facts + posture</div>
          <div className="text-steel-gray">  v0.2 · Redliner  — proposed edits with rationale + risk-bucket</div>
          <div className="text-steel-gray">  v0.2 · Summariser — solicitor-facing brief + executive summary</div>
        </div>
      </section>

      {/* audit log --------------------------------------------- */}
      <section className="mb-14">
        <SectionLabel id="§audit" name={`audit_log · matters/${matter.slug}`} />
        <h2 className="font-sans text-[25px] text-snow mb-3">Provenance.</h2>
        {!audit && <p className="font-mono text-[12px] text-dim-gray">loading audit…</p>}
        {audit && audit.length === 0 && (
          <p className="font-mono text-[12px] text-dim-gray border border-graphite p-4">
            no entries yet — actions on this matter will appear here.
          </p>
        )}
        {audit && audit.length > 0 && (
          <div className="border border-graphite">
            <div className="grid grid-cols-[170px_110px_180px_1fr_90px] gap-4 px-3 py-2 bg-graphite text-dim-gray font-mono text-[10px] tracking-[0.014em] uppercase border-b border-slate">
              <span>timestamp_utc</span>
              <span>actor</span>
              <span>action</span>
              <span>resource</span>
              <span className="text-right">hash</span>
            </div>
            {audit.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[170px_110px_180px_1fr_90px] gap-4 px-3 py-2 font-mono text-[12px] tracking-[0.053em] border-b border-graphite last:border-b-0"
              >
                <span className="text-steel-gray">{e.timestamp.slice(0, 19).replace("T", " · ")}</span>
                <span className="text-snow truncate">jasmine.k</span>
                <span className="text-terminal-green truncate">{e.action}</span>
                <span className="text-light-gray truncate">{e.resource_id ?? e.resource_type ?? "—"}</span>
                <span className="text-dim-gray text-right">
                  {(e.prompt_hash ?? "").slice(0, 8) || "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* meta / colophon — retention_until is intentionally not surfaced
          here until enforcement lands (v0.2). Showing a date the system
          does not actively enforce would mislead users into thinking the
          policy is live. */}
      <footer className="border-t border-graphite pt-5 grid grid-cols-3 gap-4 font-mono text-[10px] tracking-[0.014em] text-dim-gray">
        <Cell k="matter_id" v={matter.slug} />
        <Cell k="default_model" v={matter.default_model_id} />
        <Cell k="privilege" v={matter.privilege_posture} />
      </footer>
    </div>
  );
}

// ---------- shared ----------------------------------------------------------

function SectionLabel({ id, name }: { id: string; name: string }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.014em] text-dim-gray mb-2 uppercase">
      <span className="text-terminal-green mr-2">{id}</span>
      {name}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] tracking-[0.014em] text-dim-gray uppercase mb-1.5 inline-flex items-center gap-2">
        {label}
        {hint && <span className="text-steel-gray normal-case tracking-normal">({hint})</span>}
      </span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "open") {
    return (
      <span className="font-mono text-[11px] tracking-[0.053em] uppercase bg-deep-teal text-terminal-green px-1.5 py-px shadow-subtle">
        OPEN
      </span>
    );
  }
  return (
    <span className="font-mono text-[11px] tracking-[0.053em] uppercase bg-graphite text-platinum px-1.5 py-px shadow-subtle-2">
      {status.toUpperCase()}
    </span>
  );
}

function PremotionStageStrip({ stages }: { stages: StageProgress[] }) {
  // Render the four stages in fixed order so the strip layout is stable
  // as events arrive — stages.start fills "running", stages.end fills
  // duration/tokens/status.
  const expected = [
    { index: 1, stage: "optimistic", sub_agent_count: 1 },
    { index: 2, stage: "evidence", sub_agent_count: 3 },
    { index: 3, stage: "premortem", sub_agent_count: 4 },
    { index: 4, stage: "synthesis", sub_agent_count: 1 },
  ];
  const byIndex = new Map(stages.map((s) => [s.index, s]));
  return (
    <div className="border border-graphite">
      <div className="px-3 py-2 bg-graphite font-mono text-[10px] tracking-[0.014em] text-dim-gray uppercase border-b border-slate">
        pipeline · streaming · 9 model calls total
      </div>
      <div className="grid grid-cols-4">
        {expected.map((e) => {
          const s = byIndex.get(e.index);
          const status = s?.status ?? "pending";
          const colour =
            status === "running"
              ? "text-terminal-green"
              : status === "done"
                ? "text-platinum"
                : status === "error"
                  ? "text-code-red"
                  : "text-dim-gray";
          return (
            <div
              key={e.index}
              className="border-r border-graphite last:border-r-0 p-3 font-mono text-[11px] tracking-[0.04em]"
            >
              <div className="text-dim-gray uppercase mb-1">{e.stage}</div>
              <div className={`${colour} uppercase`}>
                {status === "running" && (
                  <span>
                    running…<span className="inline-block w-1.5 h-3 bg-emerald-shadow ml-1 align-text-bottom animate-pulse" />
                  </span>
                )}
                {status === "done" && (
                  <span>
                    {s!.sub_agent_count} call{s!.sub_agent_count === 1 ? "" : "s"} ·{" "}
                    {((s!.duration_ms ?? 0) / 1000).toFixed(1)}s · {s!.token_count ?? 0}t
                  </span>
                )}
                {status === "error" && <span>error · {s!.errors?.length ?? 1}</span>}
                {status === "pending" && <span>pending</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PremotionResult({ result }: { result: PreMotionRunResult }) {
  const verdictColour =
    result.synthesis.verdict === "steelman"
      ? "text-terminal-green"
      : result.synthesis.verdict === "strawman"
        ? "text-code-red"
        : "text-platinum";
  return (
    <div className="space-y-4">
      {/* verdict + brutal sentence */}
      <div className="border border-graphite">
        <div className="px-3 py-2 bg-graphite font-mono text-[10px] tracking-[0.014em] text-dim-gray uppercase border-b border-slate flex items-center justify-between">
          <span>
            verdict · {result.model_used} · {result.total_token_count} tok ·{" "}
            {(result.total_duration_ms / 1000).toFixed(1)}s
          </span>
          <span className={`uppercase ${verdictColour}`}>{result.synthesis.verdict}</span>
        </div>
        <div className="p-4 space-y-3">
          <p className="font-sans text-[14px] leading-[1.5] text-ash-gray">
            {result.synthesis.verdict_reasoning}
          </p>
          {result.synthesis.if_we_lose_this_will_be_why && (
            <blockquote className="border-l-2 border-code-red pl-3 font-sans italic text-[16px] leading-[1.5] text-snow">
              {result.synthesis.if_we_lose_this_will_be_why}
            </blockquote>
          )}
          {result.synthesis.summary && (
            <p className="font-sans text-[14px] leading-[1.55] text-platinum whitespace-pre-wrap">
              {result.synthesis.summary}
            </p>
          )}
        </div>
      </div>

      {/* stage status strip */}
      <div className="border border-graphite">
        <div className="grid grid-cols-4">
          {result.stages.map((s) => (
            <div
              key={s.name}
              className="border-r border-graphite last:border-r-0 p-3 font-mono text-[11px] tracking-[0.04em]"
            >
              <div className="text-dim-gray uppercase mb-1">{s.name}</div>
              <div className="text-platinum">
                {s.sub_agent_count} call{s.sub_agent_count === 1 ? "" : "s"} ·{" "}
                {(s.duration_ms / 1000).toFixed(1)}s · {s.token_count}t
              </div>
              {s.errors.length > 0 && (
                <div className="text-code-red mt-1">{s.errors.length} err</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* failure scenarios */}
      {result.synthesis.failure_scenarios.length > 0 && (
        <div className="border border-graphite">
          <div className="px-3 py-2 bg-graphite font-mono text-[10px] tracking-[0.014em] text-dim-gray uppercase border-b border-slate">
            failure_scenarios · synthesised across procedural / substantive / evidentiary / strategic
          </div>
          {result.synthesis.failure_scenarios.map((fs, i) => (
            <div key={i} className="border-b border-graphite last:border-b-0 p-3">
              <div className="flex items-center gap-3 mb-2 font-mono text-[11px] tracking-[0.053em]">
                <span className="uppercase text-terminal-green">{fs.category}</span>
                <span className="text-dim-gray">
                  prob {fs.probability} · impact {fs.impact}
                </span>
              </div>
              <p className="font-sans text-[14px] leading-[1.5] text-snow mb-2">{fs.scenario}</p>
              {fs.mitigation && (
                <p className="font-sans text-[13px] leading-[1.5] text-ash-gray">
                  <span className="text-terminal-green">mitigation —</span> {fs.mitigation}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* blind spots */}
      {result.synthesis.blind_spots.length > 0 && (
        <div className="border border-graphite p-3">
          <div className="font-mono text-[10px] tracking-[0.014em] text-dim-gray uppercase mb-2">
            blind_spots
          </div>
          <ul className="space-y-1.5">
            {result.synthesis.blind_spots.map((bs, i) => (
              <li key={i} className="font-sans text-[14px] leading-[1.5] text-platinum">
                — {bs}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* evidence inconsistencies */}
      {result.synthesis.evidence_inconsistencies.length > 0 && (
        <div className="border border-graphite p-3">
          <div className="font-mono text-[10px] tracking-[0.014em] text-dim-gray uppercase mb-2">
            evidence_inconsistencies
          </div>
          <ul className="space-y-2">
            {result.synthesis.evidence_inconsistencies.map((ei, i) => (
              <li key={i} className="font-sans text-[13px] leading-[1.5]">
                <span
                  className={
                    ei.severity === "high"
                      ? "text-code-red font-mono text-[10px] uppercase mr-2"
                      : "text-dim-gray font-mono text-[10px] uppercase mr-2"
                  }
                >
                  {ei.severity}
                </span>
                <span className="text-platinum">{ei.claim}</span> —{" "}
                <span className="text-ash-gray">{ei.issue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LetterSelector({
  catalogue,
  selected,
  onSelect,
}: {
  catalogue: LetterCatalogue;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="border border-graphite">
      <div className="px-3 py-2 bg-graphite font-mono text-[10px] tracking-[0.014em] text-dim-gray uppercase border-b border-slate">
        letter_type · {catalogue.letter_types.length} eligible for matter_type={catalogue.matter_type}
      </div>
      {catalogue.letter_types.map((lt) => {
        const active = selected === lt.id;
        return (
          <button
            key={lt.id}
            onClick={() => onSelect(lt.id)}
            className={
              "w-full text-left p-3 border-b border-graphite last:border-b-0 block " +
              (active ? "bg-deep-teal" : "hover:bg-graphite")
            }
          >
            <div className="flex items-center gap-3 mb-1 font-mono text-[11px] tracking-[0.053em]">
              <span className={active ? "text-terminal-green uppercase" : "text-platinum uppercase"}>
                {lt.label}
              </span>
              {lt.is_default && (
                <span className="font-mono text-[10px] tracking-[0.014em] uppercase text-terminal-green">
                  DEFAULT
                </span>
              )}
              <span className="text-dim-gray ml-auto">
                {lt.plugin}/{lt.skill}
              </span>
            </div>
            <p className="font-sans text-[13px] leading-[1.5] text-ash-gray max-w-[80ch]">
              {lt.summary}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function LetterDraftView({ draft }: { draft: LetterDraft }) {
  return (
    <div className="mt-4 border border-graphite">
      <div className="px-3 py-2 bg-graphite font-mono text-[10px] tracking-[0.014em] text-dim-gray uppercase border-b border-slate flex items-center justify-between">
        <span>
          draft · {draft.plugin}/{draft.skill} · {draft.model_used} · {draft.token_count} tok ·{" "}
          {(draft.latency_ms / 1000).toFixed(1)}s
        </span>
        <span className="text-terminal-green uppercase">{draft.letter_type}</span>
      </div>
      <pre className="p-4 font-sans text-[14px] leading-[1.55] text-snow whitespace-pre-wrap">
        {draft.draft_markdown}
      </pre>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "font-mono text-[11px] tracking-[0.053em] uppercase bg-deep-teal text-terminal-green px-1.5 py-px shadow-subtle"
          : "font-mono text-[11px] tracking-[0.053em] uppercase bg-graphite text-platinum px-1.5 py-px shadow-subtle-2 hover:text-snow"
      }
    >
      {children}
    </button>
  );
}

function CprGateBanner({ count, onConfirm }: { count: number; onConfirm: () => void }) {
  return (
    <div className="border border-code-error mb-4 p-4">
      <div className="font-mono text-[10px] tracking-[0.014em] uppercase text-code-red mb-2">
        CPR 31.22 — IMPLIED UNDERTAKING · ACTION REQUIRED
      </div>
      <p className="font-sans text-[14px] leading-[1.5] text-platinum max-w-[70ch] mb-4">
        {count} chronology {count === 1 ? "entry traces" : "entries trace"} to documents
        obtained under disclosure. CPR 31.22(1) restricts use of disclosed material to
        the proceedings in which it was disclosed. Until you acknowledge the implied
        undertaking, the server withholds detail of those {count === 1 ? "entry" : "entries"} —
        the rows below show them as redacted.
      </p>
      <p className="font-sans text-[13px] leading-[1.5] text-ash-gray max-w-[70ch] mb-4">
        Acknowledgement is recorded in the audit trail (action:{" "}
        <code className="font-mono text-[12px] text-terminal-green">chronology.gate.confirmed</code>)
        and scoped to this matter and user. This is a forcing function for the rule,
        not legal advice.
      </p>
      <button
        onClick={onConfirm}
        className="font-mono text-[12px] tracking-[0.053em] text-terminal-green bg-deep-teal px-3 h-7 inline-flex items-center shadow-subtle hover:bg-emerald-shadow"
      >
        I CONFIRM →
      </button>
    </div>
  );
}

function ChronologyTable({ events }: { events: import("./lib/api").ChronologyEvent[] }) {
  return (
    <div className="border border-graphite">
      <div className="grid grid-cols-[130px_60px_1fr_220px] gap-4 px-3 py-2 bg-graphite text-dim-gray font-mono text-[10px] tracking-[0.014em] uppercase border-b border-slate">
        <span>date</span>
        <span>sig</span>
        <span>event</span>
        <span>source · flags</span>
      </div>
      {events.map((e) => (
        <div
          key={e.id}
          className="grid grid-cols-[130px_60px_1fr_220px] gap-4 px-3 py-2 border-b border-graphite last:border-b-0 items-baseline"
        >
          <span className="font-mono text-[12px] tracking-[0.053em] text-steel-gray">{e.event_date}</span>
          <span
            className={
              e.significance >= 4
                ? "font-mono text-[12px] tracking-[0.053em] text-terminal-green"
                : "font-mono text-[12px] tracking-[0.053em] text-dim-gray"
            }
          >
            {e.significance >= 4 ? `★ ${e.significance}` : `· ${e.significance}`}
          </span>
          {e.redacted ? (
            <span className="font-mono text-[13px] tracking-[0.04em] text-code-red italic">
              {e.description}
            </span>
          ) : (
            <span className="font-sans text-[14px] leading-[1.45] text-platinum">{e.description}</span>
          )}
          <span className="font-mono text-[11px] tracking-[0.04em] text-light-gray flex flex-wrap items-baseline gap-2">
            {e.source_doc_filenames.map((fn) => (
              <span key={fn} className="text-ash-gray truncate">
                → {fn}
              </span>
            ))}
            {e.from_disclosure && (
              <span className="text-code-red ml-1">[DISCLOSURE 31.22]</span>
            )}
            {e.priv_flag && <span className="text-code-violet ml-1">[PRIV]</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function PrivilegeControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Visible posture indicator + native select. Colour reflects posture severity:
  // A_cleared (terminal-green) → B_mixed (platinum) → C_paused (code-red).
  const isPaused = value === "C_paused";
  const isCleared = value === "A_cleared";
  const colour = isPaused
    ? "text-code-red"
    : isCleared
      ? "text-terminal-green"
      : "text-platinum";
  return (
    <label className={`relative font-mono text-[11px] tracking-[0.053em] bg-graphite ${colour} px-1.5 py-px shadow-subtle-2 cursor-pointer`}>
      {value.replace("_", " · ").toUpperCase()}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label="Privilege posture"
      >
        <option value="A_cleared">A_cleared — frontier OK</option>
        <option value="B_mixed">B_mixed — local preferred</option>
        <option value="C_paused">C_paused — LLM blocked</option>
      </select>
    </label>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[11px] tracking-[0.053em] bg-graphite text-platinum px-1.5 py-px shadow-subtle-2">
      {children}
    </span>
  );
}

function BadgeViolet({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[11px] tracking-[0.053em] bg-graphite text-code-violet px-1.5 py-px shadow-subtle-2">
      {children}
    </span>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="block text-dim-gray uppercase">{k}</span>
      <span className="text-light-gray break-all">{v}</span>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}
