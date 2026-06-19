import { useEffect, useState } from "react";
import { Scorecard } from "./components/Scorecard";
import { CompanyDetail } from "./components/CompanyDetail";
import { loadCompanies, byTier, nicheLabel, type Company } from "./data/scorecard";

function Nav() {
  const links = [
    ["kill", "Kill list"],
    ["watching", "Worth watching"],
    ["firm", "Firm play"],
    ["space", "The space"],
    ["floor", "The twenty"],
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

function A({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-rule underline-offset-4 hover:decoration-ink"
    >
      {children}
    </a>
  );
}

// Kill-list sectors — expand for the carnage.
const KILL: [string, string][] = [
  [
    "Standalone vertical apps, no interop — features, not companies",
    "Gone the moment a horizontal agent ships the vertical. Crimson, Emma, PhaseLaw, Pivot, Mage.",
  ],
  [
    "Diagramming tools — nice apps, capped ceilings",
    "Real logos, but a closed surface and not agentic. Structureflow, Jigsaw.",
  ],
  [
    "Services firms in software clothing — not vendors",
    "A firm with an internal AI tool is a firm, not a product. (Moritz is the exception — see below; it’s playing a different game.)",
  ],
  [
    "Horizontal agent-builders — the most clonable shape there is",
    "A frontier-model quarter from commoditised. Airia, Eudia, Newcode, Wexler, Casey.",
  ],
];

// The rest of the floor — parked: real enough to note, not enough to feature.
// Data-driven from tier === "parked"; links out, dossier link, slot for more.
function RestOfFloor() {
  const [parked, setParked] = useState<Company[] | null>(null);
  useEffect(() => {
    loadCompanies()
      .then((all) => setParked(byTier(all, "parked")))
      .catch(() => setParked([]));
  }, []);
  if (!parked || parked.length === 0) return null;
  return (
    <section id="rest" className="scroll-mt-12 border-t border-rule">
      <div className="mx-auto max-w-2xl px-6 py-14">
        <h2 className="font-redaction35 text-2xl tracking-tight2 mb-2 text-ink">
          The rest of the floor
        </h2>
        <p className="text-muted text-sm mb-8">
          Real enough to note, not enough to feature — they didn&apos;t make the
          twenty. Names link out; fuller links to come.
        </p>
        <ul className="divide-y divide-rule border-y border-rule">
          {parked.map((c) => (
            <li
              key={c.id}
              className="py-3 flex items-baseline justify-between gap-4"
            >
              <div className="min-w-0">
                <a
                  href={c.site}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold underline decoration-rule underline-offset-4 hover:decoration-ink"
                >
                  {c.name}
                </a>
                <span className="text-muted text-sm"> · {nicheLabel(c.cat)}</span>
              </div>
              <a
                href={`#/c/${c.id}`}
                className="text-muted text-xs tech-token whitespace-nowrap hover:text-ink"
              >
                dossier →
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TheRead() {
  return (
    <main>
        {/* The read — the front door. Whole argument in the first screen. */}
        <header id="top" className="border-b border-rule">
          <div className="mx-auto max-w-2xl px-6 pt-16 pb-14 md:pt-24">
            <p className="eyebrow mb-4">LegalTechTalk 2026 · the O2 · 17–18 June</p>
            <h1 className="font-redaction35 text-4xl md:text-5xl leading-[1.08] tracking-tight2">
              I walked the booth so you didn&apos;t have to. Most of what I saw is
              shockingly bad and dead within a year.
            </h1>
            <p className="text-prose text-[1.05rem] leading-[1.7] mt-7">
              The short version: most of it dies inside a year. Four are worth
              watching — <A href="https://www.deepjudge.ai/">DeepJudge</A>,{" "}
              <A href="https://lawstronaut.com/">Lawstronaut</A>,{" "}
              <A href="https://syllo.ai/">Syllo</A>, and{" "}
              <A href="https://www.moonlit.ai/">Moonlit</A> (raising now). And
              there&apos;s one space nobody owns yet that&apos;s worth more than
              any single company on the floor: the compliance and guardrails
              layer underneath AI legal work. That&apos;s the play.
            </p>
            <p className="text-muted text-sm mt-6">
              A first-hand read. The opinions are mine; the facts behind them are
              disclosed and sourced.
            </p>
          </div>
        </header>

        {/* Thesis — the why behind the kills. */}
        <div className="border-b border-rule">
          <div className="mx-auto max-w-2xl px-6 py-12 text-[1.05rem] leading-[1.75] text-prose">
            <p>
              <b className="text-ink">The thesis.</b> We&apos;re moving to a place
              where thinking you&apos;re getting lawyers using four different
              platforms that don&apos;t swap data and that agents can&apos;t talk
              to is ridiculous. If something is just a front-end on proprietary
              data, it&apos;s dead. It&apos;s a wrapper. It&apos;s gone. They
              might hold out to get acqui-hired if they&apos;ve got brand and a
              following, but they&apos;re dead as concepts.
            </p>
            <p className="!mb-0 mt-6">
              <b className="text-ink">Scope.</b> I&apos;ve deliberately kept the
              $500M+ Series B names out. I might be opinionated on them, but that
              doesn&apos;t help anybody.
            </p>
          </div>
        </div>

        {/* Kill list — lead with it; it earns the rest. Collapsible by sector. */}
        <section id="kill" className="scroll-mt-12 border-b border-rule">
          <div className="mx-auto max-w-2xl px-6 py-16">
            <h2 className="font-redaction35 text-3xl tracking-tight2 mb-2">
              The kill list
            </h2>
            <p className="text-muted mb-8">The bottom, and it&apos;s long. Expand for the carnage.</p>

            <div className="divide-y divide-rule border-y border-rule">
              {KILL.map(([head, body]) => (
                <details key={head} className="group py-4">
                  <summary className="cursor-pointer list-none flex items-start gap-3 font-bold text-ink">
                    <span className="text-muted transition-transform group-open:rotate-90">›</span>
                    <span>{head}</span>
                  </summary>
                  <p className="prose-p !mb-0 mt-2 pl-6 text-sm">{body}</p>
                </details>
              ))}
            </div>

            <div className="mt-8 border-l-2 border-seal pl-5">
              <p className="text-seal text-xs uppercase tracking-track1 mb-1">
                The eye, not the screen
              </p>
              <p className="prose-p !mb-0 text-sm">
                The one I liked anyway:{" "}
                <b className="text-ink">
                  <A href="https://www.awesomecompliance.com/">
                    Awesome Compliance
                  </A>
                </b>{" "}
                — GDPR and the EU AI Act at the unglamorous end: ROPAs, DPIAs,
                risk reports, the documentation a regulator actually asks for. It
                scores low on my screen — early, pre-seed, thin on interop — but
                the model is real and it&apos;s pointed at the space that matters.
                The screen would bin it; the eye keeps it.{" "}
                <a
                  href="#/c/K30"
                  className="underline decoration-rule underline-offset-4 hover:decoration-ink"
                >
                  The dossier →
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* The survivors. */}
        <section id="watching" className="scroll-mt-12 border-b border-rule">
          <div className="mx-auto max-w-2xl px-6 py-16 text-[1.05rem] leading-[1.75] text-prose">
            <h2 className="font-redaction35 text-3xl tracking-tight2 mb-8 text-ink">
              The ones worth watching
            </h2>
            <p className="mb-6">
              <b className="text-ink">
                <A href="https://www.deepjudge.ai/">DeepJudge</A>
              </b>{" "}
              — the knowledge layer agents plug into. Retrieval that Harvey,
              CoCounsel and MCP agents call into. The moat and the kill are the
              same thing: its biggest partners, Harvey and Thomson Reuters, are
              also its most obvious substitutes. The day TR decides retrieval is
              core, DeepJudge is a feature. It gets bought at a premium or
              absorbed for free.
            </p>
            <p className="mb-6">
              <b className="text-ink">
                <A href="https://lawstronaut.com/">Lawstronaut</A>
              </b>{" "}
              — the legal-data API / MCP layer. The most thesis-pure thing in the
              room: agents call it for the slice of law they need, with
              provenance. Earliest and thinnest of the lot, all self-reported. It
              wins on who builds on it, and nobody does yet.
            </p>
            <p className="mb-6">
              <b className="text-ink">
                <A href="https://syllo.ai/">Syllo</A>
              </b>{" "}
              — agentic document review at AmLaw scale, litigator-founded, real
              money behind it. Closer to revenue than the infra plays. Hinges on
              interop depth: open layer it survives, closed app it gets eaten the
              day Relativity bolts on genAI.
            </p>
            <div className="border-l-2 border-seal pl-5">
              <p className="text-seal text-xs uppercase tracking-track1 mb-1">
                Raising now
              </p>
              <p className="!mb-0">
                <b className="text-ink">
                  <A href="https://www.moonlit.ai/">Moonlit AI</A>
                </b>{" "}
                is currently raising. The timely one — worth getting the deck and
                a proper look at the backend.
              </p>
            </div>
          </div>
        </section>

        {/* Thesis 2 — the regulated-firm play. Read on a different lens. */}
        <section id="firm" className="scroll-mt-12 border-b border-rule">
          <div className="mx-auto max-w-2xl px-6 py-16 text-[1.05rem] leading-[1.75] text-prose">
            <p className="eyebrow mb-3">A different game</p>
            <h2 className="font-redaction35 text-3xl tracking-tight2 mb-6 text-ink">
              The regulated-firm play
            </h2>
            <p className="mb-6">
              Two here shouldn&apos;t be scored like software, because they
              aren&apos;t selling it. The screen rates them low and the screen is
              wrong about them — they&apos;re playing a different game:{" "}
              <i>be the regulated AI firm.</i> An entity that already carries the
              licences, the insurance and the accountability, deploying AI inside
              that wrapper. You can&apos;t clone a regulated posture in a quarter.
            </p>
            <p className="mb-6">
              <b className="text-ink">
                <A href="https://www.moritz.law/">Moritz</A>
              </b>{" "}
              is the flagship — a funded, well-pedigreed AI-native law firm. As a
              tech vendor it&apos;s off-thesis; as a <i>firm</i> with an AI engine
              and real liability on the line, it&apos;s the cleanest expression of
              the model on the floor.{" "}
              <a
                href="#/c/K56"
                className="underline decoration-rule underline-offset-4 hover:decoration-ink"
              >
                The dossier →
              </a>
            </p>
            <p className="!mb-0">
              <b className="text-ink">
                <A href="https://cicero.com.au/">Cicero</A>
              </b>{" "}
              is the adjacent read — a Sydney litigation AI running self-hosted
              models with named firm customers and a real eDiscovery integration:
              a vendor wearing the regulated posture rather than a firm. Same
              lens, one step out.{" "}
              <a
                href="#/c/S25"
                className="underline decoration-rule underline-offset-4 hover:decoration-ink"
              >
                The dossier →
              </a>
            </p>
          </div>
        </section>

        {/* The prize — featured. */}
        <section id="space" className="scroll-mt-12 bg-wash border-b border-rule">
          <div className="mx-auto max-w-2xl px-6 py-20 text-[1.05rem] leading-[1.75] text-prose">
            <p className="eyebrow mb-3">The prize</p>
            <h2 className="font-redaction35 text-3xl md:text-4xl tracking-tight2 mb-6 text-ink">
              The space worth owning
            </h2>
            <p className="mb-6">
              <A href="https://komplyai.com/">KomplyAI</A> is how I want to point
              at it. Credit where it&apos;s due — it&apos;s a real company: an
              MIT CSAIL case study, an Australian government contract, years of
              curated regulatory corpus behind it. But it&apos;s vertical GRC
              documentation tooling, not the embedded, agentic guardrail layer
              the flip demands — the thing that sits inside the work and proves
              what the AI did. The point isn&apos;t that they&apos;re bad; it&apos;s
              that even the credible one isn&apos;t the layer.{" "}
              <b className="text-ink">
                AI compliance guardrails and documentation
              </b>{" "}
              — the space above them is still unowned.
            </p>
            <p className="!mb-0">
              The flip is the demand engine. When humans do 80% of the work, the
              guardrails <i>are</i> the humans. When AI does 80%, they have to be
              productised — and regulators and insurers will require it. Nobody
              owns that layer yet. There&apos;s a monetisation layer here.
              That&apos;s the play.
            </p>
          </div>
        </section>

        {/* The reference layer. */}
        <section id="floor" className="scroll-mt-12">
          <div className="mx-auto max-w-page px-6 py-16">
            <h2 className="font-redaction35 text-3xl tracking-tight2 mb-2">
              The twenty, by niche
            </h2>
            <p className="text-muted text-sm mb-8 max-w-2xl">
              The twenty that carry the read — scored and sorted by niche, every
              name links out. The receipts. The regulated-firm pair sit up in{" "}
              <a href="#firm" className="underline decoration-rule underline-offset-4 hover:decoration-ink">the firm play</a>;
              the also-rans are in{" "}
              <a href="#rest" className="underline decoration-rule underline-offset-4 hover:decoration-ink">the rest of the floor</a>.
            </p>
            <Scorecard />
          </div>
        </section>

        <RestOfFloor />

        <footer className="border-t border-rule">
          <div className="mx-auto max-w-2xl px-6 py-12 text-muted text-sm leading-relaxed">
            I triaged about 120 booths, looked hard at ~20, and scored them —
            weighting one thing double: does it survive the flip. The
            low-confidence calls I web-checked. Every kill rests on facts I&apos;ve
            disclosed; the verdicts are mine. LegalTechTalk 2026.
          </div>
        </footer>
      </main>
  );
}

function useHashRoute() {
  const get = (): { company: string | null } => {
    const m = window.location.hash.match(/^#\/c\/(.+)$/);
    return { company: m ? decodeURIComponent(m[1]) : null };
  };
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => {
      setRoute(get());
      if (window.location.hash.startsWith("#/c/")) window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function App() {
  const route = useHashRoute();
  return (
    <>
      <Nav />
      {route.company ? <CompanyDetail id={route.company} /> : <TheRead />}
    </>
  );
}
