import { Github } from "lucide-react";
import { navigate } from "../lib/route";
import { useAuth } from "../auth/AuthProvider";
import { Footer } from "../ui/Footer";
import { LedgerLine, SectionRule } from "../ui/certificate";

const DEMO_SLUG = "khan-v-acme-trading-2026";

// The demo, framed before the click: the three moves a visitor watches.
const DEMO_MOVES: { title: string; body: string }[] = [
  {
    title: "Raw",
    body: "Ask an ordinary model about the matter. It answers in confident prose, and gets a load-bearing fact wrong.",
  },
  {
    title: "Caught",
    body: "Ask again through a skill. It tests the claim against the documents, finds no support, and refuses. The refusal is struck onto the record.",
  },
  {
    title: "Signed",
    body: "A named human reviews the output, amends it, and signs. The record now shows who stood behind it.",
  },
];

const QUICKSTART_CMD =
  "git clone https://github.com/b1rdmania/legalise && cd legalise && ./scripts/quickstart.sh";

function QuickstartCommand() {
  const onCopy = () => {
    void navigator.clipboard?.writeText(QUICKSTART_CMD);
  };
  return (
    <div className="mt-6 flex max-w-xl items-center gap-3 border border-rule bg-wash px-4 py-3">
      <code className="tech-token min-w-0 flex-1 truncate text-xs text-prose">
        <span className="select-none text-muted">$ </span>
        {QUICKSTART_CMD}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 text-xs font-medium text-muted underline underline-offset-4 decoration-rule transition-colors hover:decoration-seal hover:text-seal"
      >
        Copy
      </button>
    </div>
  );
}

export function Landing() {
  const auth = useAuth();
  const onOpenDemo = () => navigate(`/matters/${DEMO_SLUG}`);

  return (
    <div className="max-w-page mx-auto">
      {/* Hero: the felt problem first, the answer second, the demo framed. */}
      <section className="relative overflow-hidden border-b border-rule">
        <div
          className="pointer-events-none absolute inset-0 z-0 hidden md:block"
          aria-hidden="true"
          style={{
            opacity: 0.12,
            filter: "sepia(1) saturate(7) hue-rotate(-30deg) brightness(0.55)",
          }}
        >
          <lottie-player
            src="/animations/signature.json"
            autoplay
            speed="0.5"
            background="transparent"
            style={{ width: "100%", height: "100%" }}
          />
        </div>
        <div className="relative z-10 px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-24 max-w-3xl">
          <div className="eyebrow text-muted mb-5">
            Open source · England &amp; Wales · v0.1
          </div>
          <p className="text-lg md:text-xl text-prose leading-relaxed max-w-2xl mb-6">
            Today&rsquo;s models draft your case fluently, cite authorities that
            were never decided, and leave no record of how they got there.
          </p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight2 text-ink mb-2 leading-[1.05]">
            The register underneath the AI.
          </h1>
          <div className="w-16 h-[3px] bg-seal mt-3 mb-6" aria-hidden="true" />
          <p className="text-xl text-muted leading-relaxed max-w-xl">
            Legalise runs AI inside a matter file and keeps the kind of record
            you could hand a regulator: what it read, what it refused to do, and
            the named person who signed the work off. Open source, built for
            England &amp; Wales.
          </p>

          {/* CTAs */}
          {auth.user ? (
            <div className="flex flex-wrap items-center gap-4 mt-10">
              <button
                onClick={onOpenDemo}
                className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px]"
              >
                Open demo project
              </button>
              <a
                href="/matters"
                className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
              >
                Matters
              </a>
              <a
                href="/skills"
                className="text-sm text-muted hover:text-seal transition-colors"
              >
                Skills
              </a>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 mt-10">
              <a
                href="/demo"
                className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
              >
                Walk the demo
              </a>
              <a
                href="https://github.com/b1rdmania/legalise"
                target="_blank"
                rel="noreferrer"
                className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center gap-2"
              >
                <Github size={16} strokeWidth={1.75} aria-hidden="true" />
                GitHub
              </a>
            </div>
          )}

          <p className="mt-5 max-w-xl text-sm leading-relaxed text-prose">
            A real unfair-dismissal matter. Watch the AI get a fact wrong, watch
            the guardrail catch it, and watch a human sign it off.
          </p>

          <QuickstartCommand />

          <p className="eyebrow mt-8 text-muted">
            Not a law firm. Not legal advice. Bring your own model key.
          </p>
        </div>
      </section>

      {/* Why this exists: the cost of capability alone, earned early. */}
      <section className="border-b border-rule px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
        <SectionRule label="Why this exists" right="The cost of capability alone" />
        <div className="mt-8 max-w-3xl">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-8">
            <div className="font-redaction35 text-ink text-[64px] sm:text-[88px] leading-none tracking-tight2">
              1,500+
            </div>
            <p className="mt-3 sm:mt-0 text-lg text-prose leading-relaxed max-w-xl">
              court decisions, and counting, where AI put citations to cases
              that were never decided in front of a judge. Damien Charlotin has
              been cataloguing them, and the count keeps climbing.
            </p>
          </div>
          <p className="mt-8 max-w-2xl text-base leading-relaxed text-prose">
            The models are capable enough to be trusted and confident enough to
            be wrong. The missing piece is not a better model. It is a record:
            of what the AI did, what it would not do, and who took
            responsibility.
          </p>
          <a
            href="/architecture"
            className="mt-6 inline-flex text-sm text-muted underline underline-offset-4 decoration-rule transition-colors hover:decoration-seal hover:text-seal"
          >
            Read the full argument
          </a>
        </div>
      </section>

      {/* The demo, framed: raw -> caught -> signed. */}
      <section className="border-b border-rule px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
        <div className="max-w-page mx-auto">
          <SectionRule label="The demo" right="Three moves" />
          <h2 className="mt-5 text-3xl md:text-4xl font-bold tracking-tight2 text-ink mb-10 leading-tight max-w-2xl">
            Watch it work, catch it, and sign it.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            {DEMO_MOVES.map((m, i) => (
              <div key={m.title} className="bg-paper p-6 md:p-8">
                <div className="text-[10px] uppercase tracking-[0.25em] text-muted mb-4">
                  {String(i + 1).padStart(2, "0")} / 03
                </div>
                <h3 className="text-lg font-bold text-ink mb-3 tracking-tight2">
                  {m.title}
                </h3>
                <p className="text-sm text-prose leading-relaxed">{m.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <a
              href="/demo"
              className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
            >
              Walk the demo
            </a>
          </div>
        </div>
      </section>

      {/* The register depth: for the visitor who is now bought in. */}
      <section className="border-b border-rule px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
        <SectionRule label="The record" right="In three lines" />
        <div className="max-w-3xl">
          <h2 className="mt-5 text-3xl md:text-4xl font-bold tracking-tight2 text-ink leading-tight">
            A register that records refusals as faithfully as approvals.
          </h2>
          <div className="mt-8">
            <LedgerLine index={1} label="Admission">
              counsel admitted · manifest verified · source pinned
            </LedgerLine>
            <div className="text-seal">
              <LedgerLine index={2} label="Refusal">
                <span className="line-through decoration-seal">
                  privileged read on a paused matter
                </span>{" "}
                · gate held · struck on the record
              </LedgerLine>
            </div>
            <LedgerLine index={3} label="Sign-off">
              output reviewed, amended, and signed by a named human
            </LedgerLine>
          </div>
          <p className="mt-8 max-w-2xl text-base leading-relaxed text-prose">
            Skills are admitted like counsel, gated by privilege posture, and
            build a supervised track record. The full argument is one page.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="/architecture"
              className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
            >
              Read the architecture
            </a>
            <a
              href="/skills"
              className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
            >
              Browse the skills
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
