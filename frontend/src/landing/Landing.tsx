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
          <div className="eyebrow text-muted mb-6">
            Open source · England &amp; Wales · Evaluation release
          </div>
          <h1 className="font-redaction35 text-[40px] sm:text-[56px] md:text-[64px] leading-[1.04] tracking-tight2 text-ink max-w-2xl">
            AI can draft the case. It cannot sign it.
          </h1>
          <div className="w-16 h-[3px] bg-seal mt-6 mb-8" aria-hidden="true" />
          <p className="text-lg md:text-xl text-muted leading-relaxed max-w-2xl">
            Legalise keeps AI work inside the matter file, with a record of
            every human review, edit, approval, and sign-off.
          </p>
          <p className="mt-5 text-base text-muted">
            Unfinished. Experimental. Come break it.
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-10">
            {auth.user ? (
              <button
                onClick={onOpenDemo}
                className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px]"
              >
                Open the demo matter
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

          {/* Scroll cue to the demo video — sits on the splash. */}
          <a
            href="#demo-video"
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById("demo-video")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
            className="mt-12 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-seal transition-colors min-h-[44px]"
          >
            <span>Watch a 30-second demo</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="animate-bounce"
            >
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </a>
        </div>
      </section>

      {/* The demo: a quick, silent scan through the workspace. */}
      <section
        id="demo-video"
        className="scroll-mt-8 px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20"
      >
        <div className="max-w-3xl mx-auto">
          {/* The video is a desktop screen-scan — at phone widths it renders
              a whole three-pane workspace ~350px wide, illegible and
              autoplaying. Phones get the guided demo instead. */}
          <a
            href="/guided-demo"
            className="block border border-ink/70 bg-paper p-6 sm:hidden"
          >
            <p className="eyebrow mb-3">Demo</p>
            <p className="text-sm text-prose leading-relaxed mb-4">
              The 30-second scan is filmed on a desktop screen. On a phone,
              walk the demo instead — the same loop, step by step.
            </p>
            <span className="text-sm font-semibold text-ink">
              Walk the demo →
            </span>
          </a>
          <div className="hidden border border-ink/70 bg-paper p-2 sm:block">
            <video
              src="/media/backend-demo-v3.mp4"
              poster="/media/backend-demo-v3-poster.jpg"
              className="block w-full border border-rule/60"
              loop
              autoPlay
              playsInline
              controls
              preload="metadata"
              ref={(el) => {
                // Don't spin the video up behind the phone-width swap card.
                if (el && window.matchMedia("(min-width: 640px)").matches) {
                  el.muted = true;
                  void el.play().catch(() => undefined);
                }
              }}
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
