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
      <div className="mx-auto max-w-page px-6 h-12 flex items-center justify-end">
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

// Legalise's own imagery (it isn't in the scored data).
const LEGALISE_LOGO =
  "https://www.google.com/s2/favicons?domain=legalise.dev&sz=128";
const LEGALISE_SHOT =
  "https://s.wordpress.com/mshots/v1/https%3A%2F%2Flegalise.dev%2F?w=1200&h=750";

// Our own build — same card shape as CompanyCard (so it sits the same size in
// the grid), but no score and it clicks through to the in-site Legalise page.
function LegaliseCard() {
  return (
    <a
      href="#/legalise"
      className="block border border-rule rounded-card overflow-hidden bg-panel/40 hover:border-ink transition-colors"
    >
      <img
        src={LEGALISE_SHOT}
        alt=""
        className="w-full aspect-[16/10] object-cover object-top border-b border-rule bg-wash"
        loading="lazy"
      />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={LEGALISE_LOGO}
              alt=""
              width={28}
              height={28}
              className="rounded shrink-0 bg-paper"
              loading="lazy"
            />
            <span className="font-bold text-lg leading-tight underline decoration-rule underline-offset-4 truncate">
              Legalise
            </span>
          </div>
          <span className="text-[10px] uppercase tracking-track1 text-seal border border-seal px-1 py-0.5 whitespace-nowrap">
            ours · beta
          </span>
        </div>
        <p className="prose-p !mb-0 mt-3 text-sm line-clamp-3">
          <span className="italic">My take: </span>
          The one we built. Early beta, but it&apos;s starting to address exactly
          this — the guardrails and documentation layer, so the work stays
          accountable when the AI does it.
        </p>
        <span className="mt-3 inline-block text-sm font-bold text-ink underline decoration-seal underline-offset-4">
          Read the full thing →
        </span>
      </div>
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
          <p className="text-ink font-bold">My current thesis.</p>
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
            {[
              {
                title: "Infra and data layers.",
                anchor: "#watching",
                jump: "See the ones worth watching →",
                body: "The rails agents plug into. Build the layer everyone's agents call, not the front-end. Apps come and go; the layer stays.",
              },
              {
                title: "AI-augmented regulated law firms.",
                anchor: "#firm",
                jump: "See the firms →",
                body: "A small group playing a different game: not selling software, becoming the AI-native firm. A serious model.",
              },
              {
                title: "The guardrails and compliance layer.",
                anchor: "#space",
                jump: "See the space →",
                body: "This is the play. Legal is flipping from 80% human to 80% AI — the demand engine. When humans do the work, the guardrails are the humans; when AI does it, they have to be built, and regulators and insurers will require them.",
              },
            ].map((it) => (
              <details key={it.anchor} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center gap-3 font-bold text-ink">
                  <span className="text-muted transition-transform group-open:rotate-90">
                    ›
                  </span>
                  <span>{it.title}</span>
                </summary>
                <p className="!mb-0 mt-2 pl-6">
                  {it.body}{" "}
                  <a
                    href={it.anchor}
                    className="font-bold text-ink underline decoration-rule underline-offset-4 hover:decoration-ink whitespace-nowrap"
                  >
                    {it.jump}
                  </a>
                </p>
              </details>
            ))}
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
            AI compliance guardrails and documentation
          </h2>
          <div className="max-w-2xl text-[1.05rem] leading-[1.7] text-prose mb-8">
            <p className="mb-5">
              What a regulator or an insurer needs to see. On our thesis this is
              the most important space on the floor, and it&apos;s badly
              underserved.
            </p>
            <p className="!mb-0">
              The flip is why it matters. When humans do 80% of the work, the
              guardrails <i>are</i> the humans. When AI does 80%, they have to be
              built — and regulators and insurers will require them. That gap is
              wide open.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {space.map((c) => (
              <CompanyCard key={c.id} c={c} />
            ))}
            {eye && <CompanyCard c={eye} showScore={false} />}
            <LegaliseCard />
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
