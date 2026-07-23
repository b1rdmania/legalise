export function Waitlist() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <div className="eyebrow text-muted mb-4">HOSTED BACKEND</div>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight2 text-ink leading-[1.05] max-w-2xl mb-6">
        The hosted backend is off.
      </h1>
      <p className="prose-p max-w-2xl">
        legalise.dev contains a guided demo and documentation. It does not
        provide accounts, model calls, or matter storage. Run the full
        workspace locally or on infrastructure you control.
      </p>
      <div className="border border-rule p-6 sm:p-8 mt-8">
        <div className="eyebrow-sm text-muted mb-3">GET STARTED</div>
        <h2 className="text-xl font-semibold tracking-tight2 text-ink mb-3">
          Run Legalise yourself
        </h2>
        <p className="text-sm text-prose leading-relaxed max-w-xl mb-6">
          Fork the repository, start the local stack, and use your own model
          key.
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
        </div>
      </div>
      <p className="text-xs text-muted leading-relaxed mt-6 max-w-2xl">
        No legal advice. No live client matters. No hosted application backend.
      </p>
    </div>
  );
}
