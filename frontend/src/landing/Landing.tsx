import { navigate } from "../lib/route";
import { useAuth } from "../auth/AuthProvider";
import { Footer } from "../ui/Footer";

const DEMO_SLUG = "khan-v-acme-trading-2026";

export function Landing() {
  const auth = useAuth();
  const onOpenDemo = () => navigate(`/matters/${DEMO_SLUG}`);

  return (
    <div className="max-w-page mx-auto">
      {/* Hero: two-column above the fold, with a one-shot signature
          flourish ambient behind the text (animation by Olga Zamaraeva
          on LottieFiles, recoloured toward seal via CSS filter). */}
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
        <div className="relative z-10 px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20 grid grid-cols-1 lg:grid-cols-[minmax(0,42rem)_minmax(22rem,1fr)] gap-12 lg:gap-16 items-start">
        {/* Left column: text + CTAs */}
        <div>
          <div className="eyebrow text-muted mb-5">v0.4 evaluation release</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight2 text-ink mb-2 leading-[1.05]">
            An open-source workspace for AI-augmented legal work.
          </h1>
          {/* Combo C accent — short seal tick pressed under the headline. */}
          <div className="w-16 h-[3px] bg-seal mt-3 mb-6" aria-hidden="true" />
          <p className="text-xl text-muted leading-relaxed max-w-xl">
            Built so a solicitor can show a regulator what the AI did, what
            it touched, and who signed off.
          </p>
          <p className="text-base text-prose leading-relaxed mt-5 max-w-xl">
            v0.4 ships the workspace. The supervisor-gate primitive lands
            next. Not for live client matters.
          </p>

          {/* CTAs */}
          {auth.user ? (
            <div className="flex flex-wrap items-center gap-4 mt-10">
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
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 mt-10">
              <a
                href="#/demo"
                className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
              >
                Open the demo
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
          )}
        </div>

        {/* Right column: proof panel */}
        <div className="border border-rule bg-paper p-8">
          <div className="eyebrow text-muted mb-6">What is already here</div>
          <dl className="space-y-5 text-sm">
            <div>
              <dt className="font-semibold text-ink mb-1">Matter workspace</dt>
              <dd className="text-prose leading-relaxed">
                Every model call lives inside a matter. Documents,
                chronology, posture, audit.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink mb-1">Runtime gates</dt>
              <dd className="text-prose leading-relaxed">
                Permission and privilege posture checked before every AI
                call. Denials are logged, not silenced.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink mb-1">Modules</dt>
              <dd className="text-prose leading-relaxed">
                Modules declare what they need. Workspace grants. Runtime
                enforces.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink mb-1">Bring your own model keys</dt>
              <dd className="text-prose leading-relaxed">
                Anthropic, OpenAI, or local Ollama. No shared keys, no
                resale.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink mb-1">Audit trail</dt>
              <dd className="text-prose leading-relaxed">
                Who saw what, when, under what permission. Every call.
                Every denial.
              </dd>
            </div>
          </dl>
        </div>
        </div>
      </section>

      {/* Manifesto excerpt: the homepage carries the thesis, /manifesto carries the essay */}
      <section
        id="manifesto"
        className="border-b border-rule px-4 sm:px-6 md:px-16 lg:px-24 py-20"
      >
        <div className="max-w-3xl">
          <div className="eyebrow text-muted mb-6">Manifesto</div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight2 text-ink mb-8 leading-tight">
            Supervised autonomy, not unsupervised automation.
          </h2>
          <div className="space-y-5 text-lg leading-relaxed text-ink">
            <p>
              The interesting question is no longer only what AI can automate.
              It is what a firm would choose not to automate, where human
              judgement must remain named, and how the system proves that
              boundary held.
            </p>
            <p>
              Legalise is not trying to make legal work unsupervised. It is
              trying to make supervision explicit, inspectable, and auditable.
            </p>
            <p>
              The unit is not a prompt. It is a matter. The control points are
              permissions, privilege posture, source evidence, review gates, and
              audit rows. Audit is not the product. Audit is the receipt.
            </p>
          </div>
          <div className="mt-8">
            <a
              href="#/manifesto"
              className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
            >
              Read the full manifesto
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
