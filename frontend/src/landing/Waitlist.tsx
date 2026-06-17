export function Waitlist() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <div className="eyebrow text-muted mb-4">HOSTED ACCESS</div>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight2 text-ink leading-[1.05] max-w-2xl mb-6">
        Evaluation signup is open.
      </h1>
      <p className="prose-p max-w-2xl">
        Legalise is open source. The hosted site is an evaluation
        environment — not a live-client product. Create an account to run
        the Khan v Acme sample matter on the keyless demo model, or bring
        your own Anthropic / OpenAI key.
      </p>
      <div className="border border-rule p-6 sm:p-8 mt-8">
        <div className="eyebrow-sm text-muted mb-3">GET STARTED</div>
        <h2 className="text-xl font-semibold tracking-tight2 text-ink mb-3">
          Create an evaluation account
        </h2>
        <p className="text-sm text-prose leading-relaxed max-w-xl mb-6">
          Open evaluation, bring-your-own-key. If you just want to inspect
          the work, fork the repo and run it locally.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <a
            href="/guided-demo"
            className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
          >
            Walk the demo
          </a>
          <a
            href="https://github.com/b1rdmania/legalise"
            target="_blank"
            rel="noreferrer"
            className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
          >
            Fork on GitHub
          </a>
          <a href="/auth/signup" className="text-sm text-muted hover:text-ink transition-colors">
            Create an account
          </a>
        </div>
      </div>
      <p className="text-xs text-muted leading-relaxed mt-6 max-w-2xl">
        No legal advice. No live client matters. No server-side model key fallback in production.
      </p>
    </div>
  );
}
