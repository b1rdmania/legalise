import { Scorecard } from "./components/Scorecard";

function Nav() {
  const links = [
    ["watching", "Worth watching"],
    ["space", "The space"],
    ["niches", "Niches"],
    ["kill", "Kill list"],
    ["floor", "The floor"],
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

export function App() {
  return (
    <>
      <Nav />
      <main>
        <header id="top" className="border-b border-rule">
          <div className="mx-auto max-w-2xl px-6 pt-16 pb-14 md:pt-24">
            <p className="eyebrow mb-4">LegalTechTalk 2026 · the O2 · 17–18 June</p>
            <h1 className="font-redaction35 text-4xl md:text-5xl leading-[1.08] tracking-tight2">
              I walked the booth so you didn&apos;t have to. Most of what I saw is
              shockingly bad and dead within a year.
            </h1>
            <p className="text-muted text-sm mt-6">
              A first-hand read. The opinions are mine; the facts behind them are
              disclosed and sourced.
            </p>
          </div>
        </header>

        <article className="mx-auto max-w-2xl px-6 py-16 text-[1.05rem] leading-[1.75] text-prose">
          <h2 className="font-bold text-ink text-xl mb-3">The thesis</h2>
          <p className="mb-10">
            We&apos;re moving to a position where thinking you&apos;re getting
            lawyers using four different platforms that don&apos;t swap data and
            that agents can&apos;t talk to is ridiculous. If something just has a
            front-end and proprietary data, it&apos;s dead. It&apos;s a wrapper.
            It&apos;s gone. They might hold out to get acqui-hired if they&apos;ve
            got brand and a following, but they&apos;re dead as concepts.
          </p>

          <h2 id="watching" className="font-bold text-ink text-xl mb-3 scroll-mt-16">
            The ones worth watching
          </h2>
          <p className="mb-5">
            <A href="https://www.deepjudge.ai/">DeepJudge</A> — the knowledge
            layer agents plug into. Retrieval that Harvey, CoCounsel and MCP
            agents call into. The moat and the kill are the same thing: its
            biggest partners, Harvey and Thomson Reuters, are also its most
            obvious substitutes. The day TR decides retrieval is core, DeepJudge
            is a feature. It gets bought at a premium or absorbed for free.
          </p>
          <p className="mb-5">
            <A href="https://lawstronaut.com/">Lawstronaut</A> — the legal-data
            API / MCP layer. The most thesis-pure thing in the room: agents call
            it for the slice of law they need, with provenance. Earliest and
            thinnest of the lot, all self-reported. It wins on who builds on it,
            and nobody does yet.
          </p>
          <p className="mb-5">
            <A href="https://syllo.ai/">Syllo</A> — agentic document review at
            AmLaw scale, litigator-founded, real money behind it. Closer to
            revenue than the infra plays. Hinges on interop depth: open layer it
            survives, closed app it gets eaten the day Relativity bolts on genAI.
          </p>
          <div className="my-8 border-l-2 border-seal pl-5">
            <p className="text-seal text-xs uppercase tracking-track1 mb-1">
              Raising now
            </p>
            <p className="!mb-0">
              One to flag: <A href="https://www.moonlit.ai/">Moonlit AI</A> is
              currently raising. The timely one — worth getting the deck and a
              proper look at the backend.
            </p>
          </div>

          <h2 id="space" className="font-bold text-ink text-xl mb-3 scroll-mt-16">
            The space worth owning
          </h2>
          <p className="mb-5">
            <A href="https://komplyai.com/">KomplyAI</A> is the one I want to give
            more context on — not because the company is the answer (it
            isn&apos;t; it launched a few years back, went too wide on its thesis,
            and the backend designs look poor), but because the space is. AI
            compliance guardrails and documentation. Someone is going to eat it.
            I don&apos;t think it&apos;s them — I&apos;m flagging it because the
            space matters.
          </p>
          <p className="mb-10">
            The flip is the demand engine. When humans do 80% of the work, the
            guardrails <i>are</i> the humans. When AI does 80%, they have to be
            productised — and regulators and insurers will require it. Nobody owns
            that layer yet. There&apos;s a monetisation layer here. That&apos;s
            the play.
          </p>

          <h2 id="niches" className="font-bold text-ink text-xl mb-3 scroll-mt-16">
            The niches I liked
          </h2>
          <p className="mb-10">
            There was one doing GDPR specifically — staying on top of the
            regulations, outputting your reports, doing your certificates. They
            seem stalled; I think they raised back in 2022. But it&apos;s an
            interesting model. I liked three or four others too. They all had
            flaws.
          </p>

          <h2 id="kill" className="font-bold text-ink text-xl mb-3 scroll-mt-16">
            The kill list
          </h2>
          <p className="mb-10">
            The bottom, and it&apos;s long. Standalone vertical apps with no
            interop: features, not companies — gone the moment a horizontal agent
            ships the vertical. Diagramming tools: nice apps, capped ceilings.
            Services firms in software clothing: not vendors. Horizontal
            agent-builders: the most clonable shape there is.
          </p>

          <h2 className="font-bold text-ink text-xl mb-3">Scope</h2>
          <p className="!mb-0">
            I&apos;ve deliberately kept the $500M+ Series B names out of scope. I
            might be opinionated on them, but that doesn&apos;t help anybody.
          </p>
        </article>

        <section id="floor" className="border-t border-rule scroll-mt-12">
          <div className="mx-auto max-w-page px-6 py-16">
            <h2 className="font-bold text-ink text-xl mb-2">The whole floor, by niche</h2>
            <p className="text-muted text-sm mb-8 max-w-2xl">
              Everyone I looked at, scored and sorted by niche. Every name links
              out. The verdicts are the receipts behind the read above.
            </p>
            <Scorecard />
          </div>
        </section>

        <footer className="border-t border-rule">
          <div className="mx-auto max-w-2xl px-6 py-12 text-muted text-sm leading-relaxed">
            I triaged about 120 booths, looked hard at ~20, and scored them —
            weighting one thing double: does it survive the flip. The
            low-confidence calls I web-checked. Every kill rests on facts I&apos;ve
            disclosed; the verdicts are mine. LegalTechTalk 2026.
          </div>
        </footer>
      </main>
    </>
  );
}
