import { WAITLIST_MAILTO } from "../lib/access";

export function Waitlist() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <div className="eyebrow text-muted mb-4">HOSTED ACCESS</div>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight2 text-ink leading-[1.05] max-w-2xl mb-6">
        The hosted evaluation environment is limited while we harden the backend.
      </h1>
      <p className="prose-p max-w-2xl">
        Legalise is open source. The hosted site is a small evaluation environment, not a live-client
        product. We are keeping account creation closed while the production-hardening pass finishes.
      </p>
      <div className="border border-rule p-6 sm:p-8 mt-8">
        <div className="eyebrow-sm text-muted mb-3">WAITLIST</div>
        <h2 className="text-xl font-semibold tracking-tight2 text-ink mb-3">
          Request hosted evaluation access
        </h2>
        <p className="text-sm text-prose leading-relaxed max-w-xl mb-6">
          Tell us who you are and what you want to test. If you just want to inspect the work,
          fork the repo and run it locally.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <a
            href={WAITLIST_MAILTO}
            className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
          >
            Request access
          </a>
          <a
            href="https://github.com/b1rdmania/legalise"
            target="_blank"
            rel="noreferrer"
            className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
          >
            Fork on GitHub
          </a>
          <a href="#/demo" className="text-sm text-muted hover:text-ink transition-colors">
            Browse the demo
          </a>
        </div>
      </div>
      <p className="text-xs text-muted leading-relaxed mt-6 max-w-2xl">
        No legal advice. No live client matters. No server-side model key fallback in production.
      </p>
    </div>
  );
}
