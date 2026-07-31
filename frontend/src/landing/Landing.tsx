export function Landing() {
  return (
    <div className="mx-auto max-w-page">
      <section className="relative min-h-[520px] overflow-hidden border-b border-rule md:min-h-[600px]">
        <div
          className="pointer-events-none absolute inset-0 z-0 hidden md:block"
          aria-hidden="true"
          style={{
            opacity: 0.07,
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

        <div className="relative z-10 flex min-h-[520px] max-w-3xl flex-col justify-center px-4 py-16 sm:px-6 md:min-h-[600px] md:px-16 lg:px-24">
          <h1 className="max-w-2xl font-redaction35 text-[42px] leading-[1.06] tracking-tight2 text-ink sm:text-[52px] md:text-[64px]">
            Governance infrastructure for legal AI.
          </h1>
          <p className="mt-7 max-w-xl text-base leading-relaxed text-prose md:text-lg">
            Human sign-off. Tamper-evident records. Offline verification.
          </p>
          <a
            href="https://github.com/b1rdmania/legalise"
            target="_blank"
            rel="noreferrer"
            className="mt-8 w-fit text-sm font-medium text-ink underline decoration-rule underline-offset-4 transition-colors hover:text-seal hover:decoration-seal"
          >
            View on GitHub ↗
          </a>
        </div>
      </section>
    </div>
  );
}
