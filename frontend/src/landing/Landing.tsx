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
            AI drafts your case, cites cases that never happened, and no one is
            on the hook for it.
          </p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight2 text-ink mb-2 leading-[1.05]">
            AI does the work. A named solicitor signs it off.
          </h1>
          <div className="w-16 h-[3px] bg-seal mt-3 mb-6" aria-hidden="true" />
          <p className="text-xl text-muted leading-relaxed max-w-xl">
            Legalise runs AI inside a matter file, and the record shows every
            point where a human stepped in and took responsibility.
          </p>

          <p className="mt-6 text-base text-prose">
            Unfinished on purpose. Come break it.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium">
            {auth.user ? (
              <button
                onClick={onOpenDemo}
                className="inline-flex items-center text-ink hover:text-seal transition-colors min-h-[44px]"
              >
                See it work
              </button>
            ) : (
              <a
                href="/guided-demo"
                className="inline-flex items-center text-ink hover:text-seal transition-colors min-h-[44px]"
              >
                See it work
              </a>
            )}
            <span className="text-rule" aria-hidden="true">·</span>
            <a
              href="#demo-video"
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById("demo-video")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              className="inline-flex items-center text-ink hover:text-seal transition-colors min-h-[44px]"
            >
              30 sec
            </a>
            <span className="text-rule" aria-hidden="true">·</span>
            <a
              href="https://github.com/b1rdmania/legalise"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-ink hover:text-seal transition-colors min-h-[44px]"
            >
              <Github size={15} strokeWidth={1.75} aria-hidden="true" />
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* The demo: a quick, silent scan through the workspace. */}
      <section
        id="demo-video"
        className="scroll-mt-8 px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20"
      >
        <div className="max-w-3xl mx-auto">
          <div className="border border-ink/70 bg-paper p-2">
            <video
              src="/media/backend-demo-v2.mp4"
              poster="/media/backend-demo-v2-poster.jpg"
              className="block w-full border border-rule/60"
              loop
              autoPlay
              playsInline
              controls
              preload="metadata"
              ref={(el) => {
                if (el) {
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
