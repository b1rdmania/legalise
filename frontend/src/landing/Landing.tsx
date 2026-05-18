import { navigate } from "../lib/route";
import { useAuth } from "../auth/AuthProvider";
import { Footer } from "../ui/Footer";

const DEMO_SLUG = "khan-v-acme-trading-2026";

export function Landing() {
  const auth = useAuth();
  // Authed users see the demo matter directly; unauth users sign up and the
  // Day D on_after_verify hook copies Khan into their workspace.
  const onOpenDemo = () => navigate(`/matters/${DEMO_SLUG}`);

  const steps: { name: string; body: string }[] = [
    {
      name: "Open a matter",
      body: "A slug, the parties, the documents, the chronology, the privilege posture, the retention clock. Every model call from here on lives inside this matter.",
    },
    {
      name: "Ask the assistant",
      body: "Matter-scoped chat. Answers against the matter context. Cites documents and chronology by ID. Returns a chip into a structured workflow rather than improvising in prose.",
    },
    {
      name: "Install a legal module",
      body: "Modules declare the capabilities they need. The workspace grants those capabilities; you can revoke any time from the Modules page.",
    },
    {
      name: "Run it",
      body: "The module operates on the matter through a privilege-aware gateway. Cloud providers, local models, and tool calls all route through the same audit-and-posture layer.",
    },
    {
      name: "See what it touched",
      body: "Every model call, every document mutation, every chronology entry, every capability denial writes an audit row. The Audit tab is the canonical record.",
    },
    {
      name: "See the audit trail",
      body: "Filter by module. Export. Show a regulator, a client, or opposing counsel.",
    },
  ];

  const trust: string[] = [
    "Audit by default. Every action writes a row. Append-only by convention in v0.1; the row shape is bespoke and stable.",
    "Privilege posture as a dispatch constraint. A_cleared, B_mixed, or C_paused. The gateway reads it before every model call and refuses any call the posture doesn't permit.",
    "Capabilities, requested and granted and enforced. Modules declare what they need; the workspace grants at signup; runtime checks the grant before every privileged operation. A denial is a structured 403 plus an audit row.",
    "CPR 31.22 gate on chronology entries sourced from disclosed documents. Server-side, not UI.",
    "BYO provider keys, encrypted at rest. Your key, your provider, your records.",
  ];

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 py-16">
      <div className="max-w-4xl">
        {/* Hero */}
        <div className="mb-16">
          <div className="eyebrow font-mono text-muted mb-4">VERSION 0.1 - MAY 2026</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight2 text-ink mb-6 leading-[1.05]">
            Open a matter. Ask the assistant. Install a legal module. Run it.
            See what it touched. See the audit trail.
          </h1>
          <p className="text-xl text-muted leading-relaxed max-w-2xl">
            UK legal AI workspace. England &amp; Wales only. Matter-first.
            Open-source, Apache 2.0.
          </p>

          <div className="flex flex-wrap gap-x-10 gap-y-4 mt-10 pb-10 border-b border-rule">
            <div>
              <div className="eyebrow mb-1.5">Author</div>
              <div className="text-sm font-semibold">Andy Bird</div>
            </div>
            <div>
              <div className="eyebrow mb-1.5">License</div>
              <div className="text-sm font-semibold">Apache 2.0</div>
            </div>
            <div>
              <div className="eyebrow mb-1.5">Status</div>
              <div className="text-sm font-semibold text-[#00A35C]">v0.1 demo</div>
            </div>
          </div>

          {/* CTAs */}
          {auth.user ? (
            <div className="flex flex-wrap items-center gap-4 mt-8">
              <button
                onClick={onOpenDemo}
                className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px]"
              >
                Open demo matter
              </button>
              <a
                href="#/matters"
                className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
              >
                All matters
              </a>
              <a
                href="#/modules"
                className="text-sm text-muted hover:text-ink transition-colors"
              >
                Modules
              </a>
              <a
                href="https://github.com/b1rdmania/legalise"
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted hover:text-ink transition-colors"
              >
                GitHub
              </a>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 mt-8">
              <a
                href="#/demo"
                className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
              >
                Open the demo
              </a>
              <a
                href="#/auth/signup"
                className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
              >
                Sign up free
              </a>
              <a
                href="#/auth/signin"
                className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
              >
                Sign in
              </a>
              <a
                href="#/modules"
                className="text-sm text-muted hover:text-ink transition-colors"
              >
                Modules
              </a>
              <a
                href="https://github.com/b1rdmania/legalise"
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted hover:text-ink transition-colors"
              >
                GitHub
              </a>
            </div>
          )}

          <p className="text-sm text-muted mt-6 max-w-2xl">
            Bring your own Anthropic or OpenAI key after verification. Keys are encrypted at
            rest. The Khan v Acme sample matter seeds on first sign-in so the workspace is
            never empty.
          </p>
        </div>

        {/* How it works */}
        <section className="mb-24">
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            01. How it works
          </h2>
          <p className="prose-p">
            Six verbs. The product mechanic carried by the workflow, not by the architecture.
          </p>
          <ul className="list-none space-y-6 text-prose pl-0">
            {steps.map((s) => (
              <li key={s.name} className="flex items-start gap-4">
                <span className="text-ink font-bold">-</span>
                <span>
                  <strong className="text-ink font-semibold">{s.name}.</strong> {s.body}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Trust layer */}
        <section className="mb-24">
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            02. The trust layer
          </h2>
          <div className="bg-wash p-8 border-l-4 border-ink my-8">
            <p className="text-sm font-medium italic m-0">
              "Manifest requests capabilities. Workspace grants capabilities. Runtime enforces
              capabilities."
            </p>
          </div>
          <ul className="list-none space-y-4 text-prose text-sm pl-0">
            {trust.map((t, i) => (
              <li key={i} className="flex items-start gap-4">
                <span className="font-bold text-ink">-</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="prose-p mt-8">
            Honest about v0.1 limits: retention recorded but not enforced; append-only audit log
            by convention, not by Postgres grant; chronology-write capability wiring waits for
            the first module-driven chronology endpoint. See{" "}
            <a
              href="https://github.com/b1rdmania/legalise/blob/master/docs/TRUST.md"
              target="_blank"
              rel="noreferrer"
              className="text-[#0066CC] hover:underline"
            >
              docs/TRUST.md
            </a>
            .
          </p>
        </section>

        <Footer />
      </div>
    </div>
  );
}
