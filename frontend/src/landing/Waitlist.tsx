import { WAITLIST_EMAIL, WAITLIST_MAILTO } from "../lib/access";

export function Waitlist() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <div className="eyebrow text-muted mb-4">HOSTED ACCESS</div>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight2 text-ink leading-[1.05] max-w-2xl mb-6">
        Hosted access is by request.
      </h1>
      <p className="prose-p max-w-2xl">
        Legalise is open source. The hosted site is an evaluation
        environment — not a live-client product. The guided demo and the
        repository are open now; a hosted evaluation account is by request —
        email <a href={WAITLIST_MAILTO} className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal">{WAITLIST_EMAIL}</a>{" "}
        to run the Khan v Acme sample on the keyless demo model, or with your
        own Anthropic / OpenAI key.
      </p>
      <div className="border border-rule p-6 sm:p-8 mt-8">
        <div className="eyebrow-sm text-muted mb-3">GET STARTED</div>
        <h2 className="text-xl font-semibold tracking-tight2 text-ink mb-3">
          Request an evaluation account
        </h2>
        <p className="text-sm text-prose leading-relaxed max-w-xl mb-6">
          Bring your own key. If you just want to inspect the work, fork the
          repo and run it locally.
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
          <a href={WAITLIST_MAILTO} className="text-sm text-muted hover:text-ink transition-colors">
            Request an account
          </a>
        </div>
      </div>
      <p className="text-xs text-muted leading-relaxed mt-6 max-w-2xl">
        No legal advice. No live client matters. No server-side model key fallback in production.
      </p>
    </div>
  );
}
