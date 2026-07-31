import { ArrowRight, Github } from "lucide-react";
import { Footer } from "../ui/Footer";

const REPO = "https://github.com/b1rdmania/legalise";

export function Landing() {
  return (
    <div className="mx-auto max-w-page">
      <section className="relative min-h-[680px] overflow-hidden border-b border-rule md:min-h-[760px]">
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

        <div className="relative z-10 flex min-h-[680px] max-w-4xl flex-col justify-center px-4 py-20 sm:px-6 md:min-h-[760px] md:px-16 lg:px-24">
          <p className="eyebrow mb-7">
            Open-source governance infrastructure · Evaluation release
          </p>
          <h1 className="max-w-4xl font-redaction35 text-[44px] leading-[1.02] tracking-tight2 text-ink sm:text-[62px] md:text-[76px]">
            The machine signs its record. The human signs the work.
          </h1>
          <div className="my-8 h-[3px] w-16 bg-seal" aria-hidden="true" />
          <p className="max-w-2xl text-lg leading-relaxed text-prose md:text-xl">
            Legalise is open-source governance and audit infrastructure for
            AI-assisted legal work: human sign-off, a database-enforced audit
            chain, and exports that can be verified offline.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href="/architecture"
              className="inline-flex min-h-[44px] items-center gap-2 bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-seal"
            >
              Architecture
              <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </a>
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 border border-rule px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-wash"
            >
              <Github size={16} strokeWidth={1.75} aria-hidden="true" />
              GitHub
            </a>
          </div>
        </div>
      </section>

      <div className="px-4 pb-8 sm:px-6 md:px-16 lg:px-24">
        <p className="border-b border-rule py-5 text-xs uppercase tracking-track2 text-muted">
          Evaluation release · England &amp; Wales · Self-hosted · Apache 2.0
        </p>
        <Footer />
      </div>
    </div>
  );
}
