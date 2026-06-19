import { useEffect, useState } from "react";
import { CompanyCard } from "./components/CompanyCard";
import { CompanyDetail } from "./components/CompanyDetail";
import { PremortemPage } from "./components/PremortemPage";
import { loadCompanies, byTier, type Company } from "./data/scorecard";

function Nav() {
  const links = [
    ["watching", "Worth watching"],
    ["firm", "Firm play"],
    ["space", "The space"],
    ["kill", "Kill list"],
  ];
  return (
    <nav className="sticky top-0 z-20 bg-paper/90 backdrop-blur border-b border-rule">
      <div className="mx-auto max-w-page px-6 h-12 flex items-center justify-between">
        <a href="#top" className="font-bold tracking-tight2 text-sm">
          LegalTechTalk 2026 · the read
        </a>
        <div className="hidden sm:flex items-center gap-5 text-sm text-prose">
          {links.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="hover:text-ink">
              {label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}

// Home-page links always go to our own review page, never out to the vendor.
function R({ id, children }: { id: string; children: string }) {
  return (
    <a href={`#/c/${id}`} className="underline decoration-rule underline-offset-4 hover:decoration-ink">
      {children}
    </a>
  );
}

// The kill-list editorial: dead sectors + the named examples in each. These
// are named here only — out of the scored data, no review pages, no scores.
const KILL_SECTORS: { sector: string; why: string; examples: string }[] = [
  { sector: "Standalone vertical apps, no interop", why: "Features, not companies — gone the moment a horizontal agent ships the vertical.", examples: "Crimson · Emma Legal · PhaseLaw · Pivot · Mage Legal" },
  { sector: "Diagramming-as-data", why: "Pretty, real logos, capped ceiling — a feature, not an app to scale.", examples: "Structureflow · Jigsaw" },
  { sector: "Horizontal agent-builders", why: "The most clonable shape on the floor — a frontier-model release from commoditised.", examples: "Eudia · Newcode · Casey" },
  { sector: "Undifferentiated drafting & redline", why: "Nothing the giants don't already do — or you'd rebuild it open-source in a month.", examples: "August · Vesence" },
  { sector: "Stale incumbents & back-office", why: "No momentum, no agentic edge — a death-rattle rebrand or a tool that never clears the bar.", examples: "LUPL · Kuberno" },
  { sector: "Geo-capped niche tools", why: "Single-jurisdiction, capped TAM — they can't reach the market that matters.", examples: "Pandektes · Orbital · Aloi · Augmetec" },
];

function Grid({ items }: { items: Company[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((c) => (
        <CompanyCard key={c.id} c={c} />
      ))}
    </div>
  );
}

function TheRead({ rows }: { rows: Company[] }) {
  const watching = byTier(rows, "scorecard").sort((a, b) => b.comp - a.comp);
  const firms = byTier(rows, "thesis2");
  const space = byTier(rows, "whitespace");
  const eye = byTier(rows, "eye")[0];

  return (
    <main>
      <header id="top" className="border-b border-rule">
        <div className="mx-auto max-w-2xl px-6 pt-16 pb-14 md:pt-24">
          <p className="eyebrow mb-4">LegalTechTalk 2026 · the O2 · 17–18 June</p>
          <h1 className="font-redaction35 text-4xl md:text-5xl leading-[1.08] tracking-tight2">
            I walked the booth so you didn&apos;t have to. Most of what I saw is
            shockingly bad and dead within a year.
          </h1>
          <p className="text-prose text-[1.05rem] leading-[1.7] mt-7">
            The short version: most of it dies inside a year. A handful are worth
            watching — <R id="P26">DeepJudge</R>, <R id="S61">Lawstronaut</R>,{" "}
            <R id="K44">Syllo</R>, <R id="SA6">Moonlit</R> (raising now) and a few
            more. A small group of regulated law firms are quietly playing a
            different game. And there&apos;s one space nobody owns yet that&apos;s
            worth more than any single company on the floor: the compliance and
            guardrails layer underneath AI legal work. That&apos;s the play.
          </p>
        </div>
      </header>

      <div className="border-b border-rule">
        <div className="mx-auto max-w-2xl px-6 py-12 text-[1.05rem] leading-[1.75] text-prose">
          <p>
            <b className="text-ink">The thesis.</b> We&apos;re moving to a place
            where thinking you&apos;re getting lawyers using four different
            platforms that don&apos;t swap data and that agents can&apos;t talk to
            is ridiculous. If something is just a front-end on proprietary data,
            it&apos;s dead. It&apos;s a wrapper. It&apos;s gone. They might hold
            out for an acqui-hire on brand and a following, but they&apos;re dead
            as concepts.
          </p>
          <p className="!mb-0 mt-6">
            <b className="text-ink">Scope.</b> I&apos;ve kept the $500M+ Series B
            names out. I might be opinionated on them, but that doesn&apos;t help
            anybody.
          </p>
        </div>
      </div>

      <section id="watching" className="scroll-mt-12 border-b border-rule">
        <div className="mx-auto max-w-page px-6 py-16">
          <h2 className="font-redaction35 text-3xl tracking-tight2 mb-8">
            The ones worth watching
          </h2>
          <Grid items={watching} />
        </div>
      </section>

      <section id="firm" className="scroll-mt-12 border-b border-rule">
        <div className="mx-auto max-w-page px-6 py-16">
          <h2 className="font-redaction35 text-3xl tracking-tight2 mb-3">
            Regulated AI firms — a different game
          </h2>
          <p className="text-prose text-[1.05rem] leading-[1.7] max-w-2xl mb-8">
            A few of these aren&apos;t tools at all — they&apos;re regulated law
            firms running AI underneath, to move faster and charge less. I judge
            them on the firm, not the software. The UK&apos;s SRA sandbox is the
            tailwind.
          </p>
          <Grid items={firms} />
        </div>
      </section>

      <section id="space" className="scroll-mt-12 bg-wash border-b border-rule">
        <div className="mx-auto max-w-2xl px-6 py-20 text-[1.05rem] leading-[1.75] text-prose">
          <p className="eyebrow mb-3">The prize</p>
          <h2 className="font-redaction35 text-3xl md:text-4xl tracking-tight2 mb-6 text-ink">
            The space worth owning
          </h2>
          <p className="mb-6">
            The un-won category is <b className="text-ink">AI compliance
            guardrails and documentation</b> — what a regulator or an insurer
            needs to see. Nobody owns it yet.
          </p>
          <p className="mb-10">
            The flip is the demand engine. When humans do 80% of the work, the
            guardrails <i>are</i> the humans. When AI does 80%, they have to be
            productised — and regulators and insurers will require it. There&apos;s
            a monetisation layer here. That&apos;s the play.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {space.map((c) => (
              <CompanyCard key={c.id} c={c} />
            ))}
          </div>
          {eye && (
            <div className="mt-6 border-l-2 border-seal pl-5">
              <p className="text-seal text-xs uppercase tracking-track1 mb-1">
                One I just liked on the floor
              </p>
              <p className="!mb-0 text-sm">
                <a href={`#/c/${eye.id}`} className="font-bold underline decoration-rule underline-offset-4">
                  {eye.name}
                </a>{" "}
                — {eye.my_take}
              </p>
            </div>
          )}
        </div>
      </section>

      <section id="kill" className="scroll-mt-12">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h2 className="font-redaction35 text-3xl tracking-tight2 mb-2">
            The kill list
          </h2>
          <p className="text-muted mb-8">
            The dead categories, and who&apos;s in each. The same call across the
            board: a feature, not an app to scale.
          </p>
          <div className="divide-y divide-rule border-y border-rule">
            {KILL_SECTORS.map((s) => (
              <div key={s.sector} className="py-4">
                <p className="font-bold text-ink">{s.sector}</p>
                <p className="prose-p !mb-0 mt-1 text-sm">{s.why}</p>
                <p className="text-muted text-sm mt-1 tech-token">{s.examples}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-2xl px-6 py-12 text-muted text-sm">
          LegalTechTalk 2026. I walked every booth — these are my notes.
        </div>
      </footer>
    </main>
  );
}

function useHashRoute() {
  const get = (): { company: string | null; premortem: string | null } => {
    const h = window.location.hash;
    const pm = h.match(/^#\/premortem\/(.+)$/);
    if (pm) return { premortem: decodeURIComponent(pm[1]), company: null };
    const c = h.match(/^#\/c\/(.+)$/);
    return { company: c ? decodeURIComponent(c[1]) : null, premortem: null };
  };
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => {
      setRoute(get());
      if (window.location.hash.startsWith("#/")) window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function App() {
  const route = useHashRoute();
  const [rows, setRows] = useState<Company[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    loadCompanies().then(setRows).catch((e) => setErr(String(e)));
  }, []);

  return (
    <>
      <Nav />
      {err && <p className="mx-auto max-w-2xl px-6 py-16 prose-p text-seal">Failed to load: {err}</p>}
      {!rows && !err && <p className="mx-auto max-w-2xl px-6 py-16 prose-p">Loading…</p>}
      {rows &&
        (route.premortem ? (
          <PremortemPage id={route.premortem} rows={rows} />
        ) : route.company ? (
          <CompanyDetail id={route.company} rows={rows} />
        ) : (
          <TheRead rows={rows} />
        ))}
    </>
  );
}
