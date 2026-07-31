export function Landing() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-page flex-col sm:min-h-[calc(100vh-80px)]">
      <section className="relative flex min-h-[520px] flex-1 overflow-hidden border-b border-rule">
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

        <div className="relative z-10 flex min-h-[520px] max-w-3xl flex-col justify-center px-4 py-16 sm:px-6 md:px-16 lg:px-24">
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

      <section className="grid shrink-0 border-b border-rule px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)] md:gap-16 md:px-16 md:py-12 lg:px-24">
        <div className="max-w-xl">
          <p className="eyebrow">Offline verification</p>
          <h2 className="mt-4 font-redaction35 text-[30px] leading-tight tracking-tight2 text-ink md:text-[36px]">
            The proof travels with the export.
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-prose md:text-base">
            Each matter export includes the hash-chained record and a standalone
            verifier. A recipient needs only Python 3 — no Legalise install,
            network, or database.
          </p>
          <a
            href="https://github.com/b1rdmania/legalise/blob/master/backend/app/core/export_chain_verifier.py"
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-block text-sm font-medium text-ink underline decoration-rule underline-offset-4 transition-colors hover:text-seal hover:decoration-seal"
          >
            Inspect the verifier ↗
          </a>
        </div>

        <pre className="tech-token mt-8 overflow-x-auto border-t border-rule pt-5 text-[13px] leading-7 text-prose md:mt-0">
          <code>{`$ unzip matter-export.zip -d matter-export
$ cd matter-export
$ python3 verify_chain.py
PASS: audit chain verified — …
unbroken from sequence 1.`}</code>
        </pre>
      </section>
    </div>
  );
}
