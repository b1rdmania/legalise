import { Section, Eyebrow } from "./components/Section";
import { Scorecard } from "./components/Scorecard";
import { Nav } from "./components/Nav";
import { GEMS, WATCH } from "./data/gems";

function Hero() {
  return (
    <header id="top" className="border-b border-rule">
      <div className="mx-auto max-w-page px-6 pt-16 pb-16 md:pt-24 md:pb-20">
        <Eyebrow>LegalTechTalk 2026 · InterContinental O2 · 17–18 June</Eyebrow>
        <h1 className="font-redaction35 text-4xl md:text-6xl leading-[1.05] tracking-tight2 mb-8 max-w-4xl">
          I walked the booths so you didn&apos;t have to.
        </h1>
        <p className="prose-p text-lg md:text-xl max-w-2xl">
          Most of what&apos;s on that floor is shockingly bad and dead within a
          year. Not &ldquo;will struggle&rdquo; — dead as a concept. This is the
          screen, the scorecard, and the calls. Boots on the ground, named and
          blunt.
        </p>
        <p className="text-muted text-sm mt-6 tech-token">
          A research artifact · honest opinion on disclosed, cited facts · calls
          marked provisional where evidence is thin.
        </p>
      </div>
    </header>
  );
}

function ThesisStrip() {
  const cols: [string, JSX.Element][] = [
    [
      "The macro driver",
      <>
        Legal is flipping from <b>80% human / 20% AI</b> to{" "}
        <b>80% AI / 20% human.</b> Everything is read against what survives the
        flip.
      </>,
    ],
    [
      "The spine",
      <>
        Real = agentic, interoperable, lives where lawyers work. Front-end +
        proprietary data + no agent-to-agent = a wrapper with a countdown.
      </>,
    ],
    [
      "Eye beats screen",
      <>
        Where the judgment disagrees with the scorecard, the judgment wins —
        annotated. The score is the floor; the eye is the product.
      </>,
    ],
  ];
  return (
    <div className="bg-wash border-b border-rule">
      <div className="mx-auto max-w-page px-6 py-10 grid gap-8 md:grid-cols-3">
        {cols.map(([h, body]) => (
          <div key={h}>
            <Eyebrow>{h}</Eyebrow>
            <p className="prose-p !mb-0">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Gems() {
  return (
    <Section id="gems" eyebrow="02 — The gems" title="What’s real, and the game-theory">
      <p className="prose-p max-w-2xl">
        Three things are real; most of the rest is an app that becomes a feature
        in someone else&apos;s product inside a year. For each gem: what it is,
        why it&apos;s real, and the endgame — who acquires it, who eats it, and
        where the white space hides.
      </p>

      <div className="mt-8 space-y-5">
        {GEMS.map((g) => (
          <div key={g.name} className="border border-rule rounded-card p-6 bg-panel/40">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-bold text-xl">
                <a
                  href={g.site}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-rule underline-offset-4 hover:decoration-ink"
                >
                  {g.name}
                </a>
                <span className="text-muted font-normal"> ↗</span>
              </h3>
              <span className="eyebrow !mb-0 text-right">{g.tag}</span>
            </div>
            <p className="prose-p !mb-0 mt-3">{g.what}</p>
            <p className="prose-p !mb-0 mt-3 text-sm">
              <span className="font-bold">Game-theory — </span>
              {g.game}
            </p>
          </div>
        ))}
      </div>

      <h3 className="eyebrow mt-12 mb-4">Worth a deeper pass</h3>
      <div className="grid gap-4 md:grid-cols-3">
        {WATCH.map((w) => (
          <div
            key={w.name}
            className={`rounded-card p-5 ${
              w.highlight ? "border-2 border-seal bg-panel" : "border border-rule bg-panel/40"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <h4 className="font-bold text-lg">
                <a
                  href={w.site}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-rule underline-offset-4 hover:decoration-ink"
                >
                  {w.name}
                </a>
                <span className="text-muted font-normal"> ↗</span>
              </h4>
              {w.highlight && (
                <span className="text-[10px] uppercase tracking-track1 text-seal">
                  Raising now
                </span>
              )}
            </div>
            <p className="prose-p !mb-0 mt-2 text-sm">{w.note}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

const KILL = [
  ["Dead segment", "Standalone vertical LLM apps, no interop (Crimson, Emma, PhaseLaw, Pivot, Mage). Features, not companies — gone the moment a horizontal agent or incumbent ships the vertical."],
  ["Dead-ish", "Diagramming-as-data (Structureflow, Jigsaw). Good apps, real logos, capped ceilings — closed surface, not agentic."],
  ["Crowded / thin", "Compliance-GRC — a graveyard of thin workflow tools on the same ground. Except where it points at the white space above."],
  ["Re-read, not killed", "Moritz — not a wrapper but the Thesis-2 flagship: “be the regulated AI firm.” The inverse of the infra plays."],
  ["Most exposed", "Horizontal agent-builders (Airia, Eudia, Newcode, Wexler, Casey). The most clonable shape there is — a frontier-model quarter from commoditised."],
  ["Liked-but-flawed niches", "The GDPR/certificates model (stalled, real model) and a few others — annotated where the eye beats the screen."],
];

export function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <ThesisStrip />

        <Section id="map" eyebrow="01 — The map" title="The floor, browsable by niche">
          <p className="prose-p max-w-2xl">
            The opinionated buckets: the rails (infrastructure others build on),
            the renters (apps borrowing a moat), the dead (wrappers on a
            countdown), and the un-won space. The full screen — 33 booths scored,
            thesis-fit weighted ×2. Pick a niche or scan them all; every name
            links to the company.
          </p>
          <div className="mt-8">
            <Scorecard />
          </div>
        </Section>

        <Gems />

        <Section id="whitespace" eyebrow="03 — The white space" title="The category nobody owns">
          <p className="prose-p max-w-2xl">
            The un-won category is <b>AI compliance guardrails + documentation</b>{" "}
            — what a regulator or an insurer needs to see: audit, accountability,
            supervised autonomy. The governed layer nobody owns.
          </p>
          <p className="prose-p max-w-2xl">
            Flagged via <b>KomplyAI</b> — itself a kill (too wide, thin backend),
            but the <i>space</i> is wide open. The 80/20 flip is its forced,
            growing buyer: when AI does 80%, regulators and insurers will{" "}
            <i>require</i> the guardrails. The hinge:{" "}
            <b>kill the company, own the space.</b>
          </p>
        </Section>

        <Section id="killlist" eyebrow="04 — The kill-list" title="The long bottom, with teeth">
          <p className="prose-p max-w-2xl">
            Blunt, segment-level. Evidence is in the scorecard; this is the read.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2 max-w-4xl">
            {KILL.map(([h, body]) => (
              <div key={h} className="border-l-2 border-rule pl-4">
                <p className="font-bold">{h}</p>
                <p className="prose-p !mb-0 text-sm">{body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="meaning" eyebrow="05 — What it means" title="So what do you do">
          <p className="prose-p max-w-2xl">
            <b>White space</b> = the governed / guardrails layer (§3).{" "}
            <b>Acquire</b> = real-but-early infra before a partner absorbs it
            (Moonlit is raising now).{" "}
            <b>Build, don&rsquo;t buy</b> = the entire dead segment.
          </p>
          <p className="prose-p max-w-2xl">
            Deliberately out of scope: the $500M+ Series B giants. Opinions on
            them help no one and just pick a fight.
          </p>
        </Section>

        <footer className="border-t border-rule">
          <div className="mx-auto max-w-page px-6 py-12 space-y-3">
            <p className="text-prose text-sm max-w-2xl">
              <b>Method:</b> ~20-company scored screen triaged from ~120
              exhibitors; thesis-fit weighted ×2. Low-confidence calls were
              web-verified (6 of 8 upgraded to medium). Every kill is structured
              as disclosed, cited facts → honest opinion, clearly marked.
            </p>
            <p className="text-muted text-sm tech-token">
              LegalTechTalk 2026 teardown · evidence in the scorecard, judgment in
              the read · {new Date().getFullYear()}.
            </p>
          </div>
        </footer>
      </main>
    </>
  );
}
