import { Github } from "lucide-react";
import { navigate } from "../lib/route";
import { useAuth } from "../auth/AuthProvider";
import { Footer } from "../ui/Footer";

const DEMO_SLUG = "khan-v-acme-trading-2026";

// "What is already here" — six surfaces laid out as a 3×2 grid below
// the hero. Numbered eyebrows ("01 / 06") give a quiet specimen feel.
const SURFACES: { title: string; body: string }[] = [
  {
    title: "Matter workspace",
    body: "Every model call lives inside a matter. Documents, chronology, posture, audit.",
  },
  {
    title: "Privilege posture",
    body: "A_cleared, B_mixed, C_paused. The gateway reads the posture before every model call and refuses what isn't permitted.",
  },
  {
    title: "Capability gates",
    body: "Modules declare what they need. The workspace grants. The runtime enforces, every call.",
  },
  {
    title: "Modules",
    body: "Legal skills installed as plugins. Open catalogue. No vendor lock to ours.",
  },
  {
    title: "Bring your own model keys",
    body: "Anthropic, OpenAI, or local Ollama. No shared keys, no resale, no provider liability we shouldn't carry.",
  },
  {
    title: "Audit trail",
    body: "Who saw what, when, under what permission. Every call. Every denial. Append-only.",
  },
];

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
        <div className="relative z-10 px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-24 max-w-3xl">
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
                className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center gap-2"
              >
                <Github size={16} strokeWidth={1.75} aria-hidden="true" />
                GitHub
              </a>
            </div>
          )}
        </div>
      </section>

      {/* "What is already here" — Warp-style 6-card specimen grid.
          Thin grid lines via gap-px on a rule-coloured wrapper. */}
      <section className="border-b border-rule px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
        <div className="max-w-page mx-auto">
          <div className="eyebrow text-muted mb-3">What is already here</div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight2 text-ink mb-10 leading-tight max-w-2xl">
            Six surfaces. One workspace.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            {SURFACES.map((s, i) => (
              <div
                key={s.title}
                className="bg-paper p-6 md:p-8 hover:bg-wash transition-colors"
              >
                <div className="font-mono text-xs text-muted mb-4">
                  {String(i + 1).padStart(2, "0")} / 06
                </div>
                <h3 className="text-lg font-bold text-ink mb-3 tracking-tight2">
                  {s.title}
                </h3>
                <p className="text-sm text-prose leading-relaxed">{s.body}</p>
              </div>
            ))}
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
