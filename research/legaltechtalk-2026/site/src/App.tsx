import { useEffect, useState } from "react";
import { CompanyCard } from "./components/CompanyCard";
import { CompanyDetail } from "./components/CompanyDetail";
import { PremortemPage } from "./components/PremortemPage";
import { LegalisePage } from "./components/LegalisePage";
import { loadCompanies, byTier, type Company } from "./data/scorecard";

function Nav() {
  const links = [
    ["watching", "Worth watching"],
    ["firm", "Firm play"],
    ["space", "The space"],
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
          <a
            href="https://legalise.dev/about"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-ink hover:text-seal"
          >
            About me ↗
          </a>
        </div>
      </div>
    </nav>
  );
}

function Grid({ items }: { items: Company[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((c) => (
        <CompanyCard key={c.id} c={c} />
      ))}
    </div>
  );
}

// A full-width bar — for entries that sit alongside the scored cards but aren't
// scored teardowns (our own build; the floor pick).
function Bar({
  title,
  tag,
  body,
  href,
  external,
}: {
  title: string;
  tag?: string;
  body: string;
  href: string;
  external?: boolean;
}) {
  const ext = external
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
  return (
    <a
      href={href}
      {...ext}
      className="block border border-rule rounded-card p-5 bg-panel/40 hover:border-ink transition-colors"
    >
      <span className="font-bold text-lg underline decoration-rule underline-offset-4">
        {title}
      </span>
      {tag && (
        <span className="ml-3 text-[10px] uppercase tracking-track1 text-seal border border-seal px-1 py-0.5 align-middle">
          {tag}
        </span>
      )}
      <p className="prose-p !mb-0 mt-2 text-sm">{body}</p>
    </a>
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
        <div className="mx-auto max-w-2xl px-6 pt-14 pb-10 md:pt-16">
          <p className="text-prose text-[1.1rem] leading-[1.6] mb-4">
            I walked the booths so you didn&apos;t have to
          </p>
          <h1 className="font-redaction35 text-4xl md:text-5xl leading-[1.06] tracking-tight2 text-ink">
            Most of it is dead within a year.
          </h1>
        </div>
      </header>

      <div className="border-b border-rule">
        <div className="mx-auto max-w-2xl px-6 py-12 text-[1.05rem] leading-[1.75] text-prose">
          <p className="text-ink font-bold">
            Here&apos;s my thesis, the projects I liked.
          </p>
          <p className="mt-6">
            Lawyers running four platforms that can&apos;t swap data, in a world
            where agents do the work, is absurd. A front-end on proprietary data is
            a wrapper. It&apos;s gone. They might get acqui-hired on brand, but as
            concepts they&apos;re dead. Most of the floor is worse: redliners,
            diagrammers, &ldquo;the AI associate for X.&rdquo; Not apps. Features.
            Buildable in days. Dead within a year.
          </p>

          <p className="mt-7 mb-4 font-bold text-ink">Three things matter.</p>
          <div className="divide-y divide-rule border-y border-rule">
            <div className="py-4">
              <p className="!mb-0">
                <a href="#watching" className="font-bold text-ink underline decoration-rule underline-offset-4 hover:decoration-ink">
                  Infra and data layers.
                </a>{" "}
                The rails agents plug into. Build the layer everyone&apos;s agents
                call, not the front-end. Apps come and go; the layer stays.
              </p>
            </div>
            <div className="py-4">
              <p className="!mb-0">
                <a href="#firm" className="font-bold text-ink underline decoration-rule underline-offset-4 hover:decoration-ink">
                  AI-augmented regulated law firms.
                </a>{" "}
                A small group playing a different game: not selling software,
                becoming the AI-native firm. A serious model.
              </p>
            </div>
            <div className="py-4">
              <p className="!mb-0">
                <a href="#space" className="font-bold text-ink underline decoration-rule underline-offset-4 hover:decoration-ink">
                  The guardrails and compliance layer.
                </a>{" "}
                This is the play. Legal is flipping from 80% human to 80% AI —
                the demand engine. When humans do the work, the guardrails are
                the humans; when AI does it, they have to be built, and
                regulators and insurers will require them.
              </p>
            </div>
          </div>

          <p className="!mb-0 mt-7">
            <b className="text-ink">Scope.</b> I&apos;ve left the $500M+ Series B
            names out. I&apos;ve got opinions, but they don&apos;t help anybody.
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
        <div className="mx-auto max-w-page px-6 py-16">
          <h2 className="font-redaction35 text-3xl tracking-tight2 mb-3">
            The space nobody&apos;s serving
          </h2>
          <div className="max-w-2xl text-[1.05rem] leading-[1.7] text-prose mb-8">
            <p className="mb-5">
              <b className="text-ink">
                AI compliance guardrails and documentation
              </b>{" "}
              — what a regulator or an insurer needs to see. On our thesis this is
              the most important space on the floor, and it&apos;s badly
              underserved. Nobody owns it yet.
            </p>
            <p className="!mb-0">
              The flip is why it matters. When humans do 80% of the work, the
              guardrails <i>are</i> the humans. When AI does 80%, they have to be
              built — and regulators and insurers will require them. That gap is
              wide open, and it&apos;s where the real value sits.
            </p>
          </div>
          <Grid items={space} />
          <div className="mt-4 space-y-4">
            {eye && (
              <Bar
                title={eye.name}
                body={eye.my_take}
                href={`#/c/${eye.id}`}
              />
            )}
            <Bar
              title="Legalise"
              tag="ours · beta"
              href="#/legalise"
              body="The one we built. Early beta, but it's starting to address exactly this — the guardrails and documentation layer, so the work stays accountable when the AI does it. Read the full thing →"
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-2xl px-6 py-12 text-muted text-sm flex flex-wrap items-center justify-between gap-3">
          <span>LegalTechTalk 2026. I walked every booth — these are my notes.</span>
          <a
            href="https://legalise.dev/about"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-ink hover:text-seal"
          >
            About me ↗
          </a>
        </div>
      </footer>
    </main>
  );
}

function useHashRoute() {
  const get = (): {
    company: string | null;
    premortem: string | null;
    legalise: boolean;
  } => {
    const h = window.location.hash;
    if (h === "#/legalise")
      return { legalise: true, company: null, premortem: null };
    const pm = h.match(/^#\/premortem\/(.+)$/);
    if (pm)
      return { premortem: decodeURIComponent(pm[1]), company: null, legalise: false };
    const c = h.match(/^#\/c\/(.+)$/);
    return {
      company: c ? decodeURIComponent(c[1]) : null,
      premortem: null,
      legalise: false,
    };
  };
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => {
      setRoute(get());
      const h = window.location.hash;
      if (h.startsWith("#/")) {
        window.scrollTo(0, 0);
      } else if (h.length > 1) {
        // Section anchor (e.g. #watching). When coming back from a detail
        // page the target only exists after the re-render — wait a frame.
        const id = h.slice(1);
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            document.getElementById(id)?.scrollIntoView()
          )
        );
      }
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
      {route.legalise ? (
        <LegalisePage />
      ) : (
        rows &&
        (route.premortem ? (
          <PremortemPage id={route.premortem} rows={rows} />
        ) : route.company ? (
          <CompanyDetail id={route.company} rows={rows} />
        ) : (
          <TheRead rows={rows} />
        ))
      )}
    </>
  );
}
