import { Github } from "lucide-react";
import { navigate } from "../lib/route";
import { useAuth } from "../auth/AuthProvider";
import { Footer } from "../ui/Footer";

const DEMO_SLUG = "khan-v-acme-trading-2026";

export function Landing() {
  const auth = useAuth();
  const onOpenDemo = () => navigate(`/matters/${DEMO_SLUG}`);

  return (
    <div className="max-w-page mx-auto">
      {/* Hero: the problem, the answer, one way in. */}
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
        <div className="relative z-10 px-4 sm:px-6 md:px-16 lg:px-24 py-20 md:py-32 max-w-3xl">
          <div className="eyebrow text-muted mb-5">
            Open source · England &amp; Wales · v0.1
          </div>
          <p className="text-lg md:text-xl text-prose leading-relaxed max-w-2xl mb-6">
            AI drafts your case, cites cases that never happened, and leaves no
            trace of how it got there.
          </p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight2 text-ink mb-2 leading-[1.05]">
            The register underneath the AI.
          </h1>
          <div className="w-16 h-[3px] bg-seal mt-3 mb-6" aria-hidden="true" />
          <p className="text-xl text-muted leading-relaxed max-w-xl">
            Legalise runs AI inside a matter file and keeps a record: what it
            read, what it refused to do, and who signed it off.
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-10">
            {auth.user ? (
              <button
                onClick={onOpenDemo}
                className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px]"
              >
                Open demo project
              </button>
            ) : (
              <a
                href="/guided-demo"
                className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
              >
                See it work
              </a>
            )}
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
        </div>
      </section>

      {/* One proof band: the count that makes the problem real. */}
      <section className="border-b border-rule px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-24">
        <div className="max-w-3xl flex flex-col sm:flex-row sm:items-baseline sm:gap-8">
          <div className="font-redaction35 text-ink text-[64px] sm:text-[112px] leading-none tracking-tight2">
            1,500+
          </div>
          <p className="mt-3 sm:mt-0 text-lg md:text-xl text-prose leading-relaxed max-w-xl">
            court rulings, and counting, where AI cited cases that never
            happened.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
