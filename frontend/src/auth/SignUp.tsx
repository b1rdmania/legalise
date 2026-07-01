/**
 * /auth/signup — Legalise is open source, so the primary path is to fork and
 * run the whole thing yourself. Hosted access is a secondary, by-request
 * evaluation option. No demo video here; the pitch is "run it".
 */
export function SignUp() {
  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
      <h1 className="font-redaction35 text-[52px] sm:text-[72px] leading-none tracking-tight2 text-ink">
        Run it yourself
      </h1>

      <div className="mt-8 max-w-xl space-y-6 text-base leading-relaxed text-prose">
        <p>
          Legalise is open source. Fork the repository and run the full
          workspace on your own machine, on your own keys — the whole thing,
          nothing held back.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <a
            href="https://github.com/b1rdmania/legalise"
            target="_blank"
            rel="noreferrer"
            className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] inline-flex items-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            Fork on GitHub
          </a>
          <a
            href="/guided-demo"
            className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
          >
            Walk the guided demo
          </a>
        </div>

        <pre className="border border-rule bg-wash p-4 text-[13px] leading-relaxed overflow-x-auto text-ink">
          <code>git clone https://github.com/b1rdmania/legalise{"\n"}cd legalise{"\n"}./scripts/quickstart.sh</code>
        </pre>
        <p className="text-sm text-muted">
          Open{" "}
          <span className="tech-token">localhost:3000</span> and create the
          first account — it&apos;s seeded with the Khan v Acme sample matter.
        </p>
      </div>

      <div className="mt-14 max-w-xl border-t border-rule pt-8">
        <h2 className="text-lg font-bold tracking-tight2 text-ink">Prefer hosted?</h2>
        <div className="mt-4 space-y-5 text-base leading-relaxed text-prose">
          <p>
            Run it on our infrastructure instead. The hosted site is an
            evaluation environment —{" "}
            <strong className="font-semibold text-ink">not for live client matters</strong>.
            Bring your own key, or use the keyless demo model.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="/auth/join"
              className="border border-ink hover:bg-ink hover:text-paper text-ink px-4 py-2 transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
            >
              Create an account
            </a>
            <a
              href="/auth/login"
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              Sign in &rarr;
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
