import { Section, Eyebrow } from "./components/Section";
import { Scorecard } from "./components/Scorecard";

function Hero() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto max-w-page px-6 pt-20 pb-16 md:pt-28 md:pb-20">
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
  return (
    <div className="bg-wash border-b border-rule">
      <div className="mx-auto max-w-page px-6 py-10 grid gap-8 md:grid-cols-3">
        <div>
          <Eyebrow>The macro driver</Eyebrow>
          <p className="prose-p !mb-0">
            Legal is flipping from <b>80% human / 20% AI</b> to{" "}
            <b>80% AI / 20% human.</b> Everything is read against what survives
            the flip.
          </p>
        </div>
        <div>
          <Eyebrow>The spine</Eyebrow>
          <p className="prose-p !mb-0">
            Real = agentic, interoperable, lives where lawyers work. Front-end +
            proprietary data + no agent-to-agent = a wrapper with a countdown.
          </p>
        </div>
        <div>
          <Eyebrow>Eye beats screen</Eyebrow>
          <p className="prose-p !mb-0">
            Where the judgment disagrees with the scorecard, the judgment wins —
            annotated. The score is the floor; the eye is the product.
          </p>
        </div>
      </div>
    </div>
  );
}

const Slot = ({ children }: { children: string }) => (
  <p className="prose-p border-l-2 border-seal pl-4 text-muted italic">
    [slot] {children}
  </p>
);

export function App() {
  return (
    <main>
      <Hero />
      <ThesisStrip />

      <Section id="map" eyebrow="01 — The map" title="The floor in 30 seconds">
        <p className="prose-p max-w-2xl">
          The opinionated buckets: the rails (infrastructure others build on),
          the renters (apps borrowing a moat), the dead (wrappers on a
          countdown), and the un-won space. The full screen — 33 booths scored,
          thesis-fit weighted ×2 — is below. Slim it to the top 20 for the
          one-glance cut.
        </p>
        <div className="mt-8">
          <Scorecard />
        </div>
      </Section>

      <Section id="gems" eyebrow="02 — The gems" title="What&rsquo;s real, and the game-theory">
        <p className="prose-p max-w-2xl">
          DeepJudge, Lawstronaut, Syllo — plus Ankar, Moonlit and Definely as
          the deeper-look set. For each: what it is, why it&rsquo;s real, and the
          endgame (who acquires it, who eats it, where the white space is).
        </p>
        <div className="mt-6 border border-seal bg-panel p-5">
          <Eyebrow>Highlight — actionable now</Eyebrow>
          <p className="prose-p !mb-0">
            <b>Moonlit.AI</b> — EU legal-data platform (MCP server + REST API,
            authoritative corpus, public-sector users) is{" "}
            <b>currently raising</b>. The one move you could make this quarter.
            Get the deck, then dig the backend.
          </p>
        </div>
        <div className="mt-6">
          <Slot>Tier-A dossiers. Premortem the three: DeepJudge =
            partner-absorption, Lawstronaut = no-one-builds-on-it, Syllo =
            incumbent-bolts-on-genAI.</Slot>
        </div>
      </Section>

      <Section
        id="whitespace"
        eyebrow="03 — The white space"
        title="The category nobody owns"
      >
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

      <Section
        id="killlist"
        eyebrow="04 — The kill-list"
        title="The long bottom, with teeth"
      >
        <ul className="prose-p max-w-2xl space-y-3 list-none pl-0">
          <li>
            <b>Dead segment</b> — standalone vertical LLM apps, no interop
            (Crimson, Emma, PhaseLaw, Pivot, Mage). Features, not companies.
          </li>
          <li>
            <b>Dead-ish</b> — diagramming-as-data (Structureflow, Jigsaw). Good
            apps, capped ceilings.
          </li>
          <li>
            <b>Crowded / thin</b> — compliance-GRC, except where it points at the
            white space above.
          </li>
          <li>
            <b>Re-read, not killed</b> — Moritz: not a wrapper but the Thesis-2
            flagship, &ldquo;be the regulated AI firm.&rdquo;
          </li>
          <li>
            <b>Most exposed</b> — horizontal agent-builders (Airia, Eudia,
            Newcode, Wexler, Casey). The most clonable shape there is.
          </li>
          <li>
            <b>Liked-but-flawed niches</b> — the GDPR/certificates model
            (stalled, ~2022, real model) + others, annotated where the eye beats
            the screen.
          </li>
        </ul>
        <div className="mt-4">
          <Slot>Bottom-tier dossiers.</Slot>
        </div>
      </Section>

      <Section
        id="meaning"
        eyebrow="05 — What it means"
        title="So what do you do"
      >
        <p className="prose-p max-w-2xl">
          <b>White space</b> = the governed / guardrails layer (§3).{" "}
          <b>Acquire</b> = real-but-early infra before a partner absorbs it.{" "}
          <b>Build, don&rsquo;t buy</b> = the entire dead segment.
        </p>
        <p className="prose-p max-w-2xl">
          Deliberately out of scope: the $500M+ Series B giants. Opinions on them
          help no one and just pick a fight.
        </p>
      </Section>

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-page px-6 py-10 text-muted text-sm tech-token">
          LegalTechTalk 2026 teardown · evidence in the scorecard, judgment in
          the read · honest opinion on disclosed, cited facts.
        </div>
      </footer>
    </main>
  );
}
