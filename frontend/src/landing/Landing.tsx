import { Github } from "lucide-react";
import { navigate } from "../lib/route";
import { useAuth } from "../auth/AuthProvider";
import { Footer } from "../ui/Footer";

const DEMO_SLUG = "khan-v-acme-trading-2026";

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
              <a
                href="/architecture"
                className="text-sm text-muted hover:text-seal transition-colors"
              >
                Why we built it
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

      <Footer />
    </div>
  );
}
