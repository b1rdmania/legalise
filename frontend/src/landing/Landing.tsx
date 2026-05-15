import { navigate } from "../lib/route";
import { useAuth } from "../auth/AuthProvider";
import { Footer } from "../ui/Footer";

const DEMO_SLUG = "khan-v-acme-trading-2026";

export function Landing() {
  const auth = useAuth();
  // Authed users see the demo matter directly; unauth users sign up and the
  // Day D on_after_verify hook copies Khan into their workspace.
  const onOpenDemo = () => navigate(`/matters/${DEMO_SLUG}`);

  const parts: { name: string; body: string }[] = [
    {
      name: "Catalogue",
      body: "Plain-text SKILL.md files. claude-for-uk-legal is the default catalogue: fork it, review changes by PR diff, pin an approved SHA.",
    },
    {
      name: "Bridge",
      body: "Loads SKILL.md, injects matter context, dispatches through the privilege-aware model gateway, and writes plugin.invoked + model.call audit rows.",
    },
    {
      name: "Surfaces",
      body: "Three proven render patterns: generic invoke, curated multi-skill selection (Letters), and bespoke orchestration (Pre-Motion fans out across 4 stages, 9 calls). Surfaces are proof, not identity.",
    },
    {
      name: "Discovery",
      body: "The installed skills page shows what is present at PLUGINS_ROOT, grouped by plugin, with source links and prompt bodies for review.",
    },
    {
      name: "Install / approval",
      body: "Installation is Git: fork the catalogue, approve prompt changes in code review, pin PLUGINS_REPO_REF, deploy. No ratings, no marketplace database.",
    },
  ];

  const trust: string[] = [
    "Audit log per LLM call and per matter mutation, append-only by convention in v0.1.",
    "Privilege posture is a first-class matter property — A_cleared / B_mixed / C_paused — read by the gateway before any model call.",
    "CPR 31.22 gate on chronology entries sourced from disclosed documents — server-side, not UI.",
    "BYO provider keys, encrypted at rest. Your Anthropic or OpenAI key is the only thing the gateway uses on your matters; revoke at any time from Settings · API keys.",
    "Local-model toggle in self-host: point the gateway at Ollama or vLLM, keep frontier models for A_cleared only.",
  ];

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 py-16">
      <div className="max-w-4xl">
        {/* P3 hero */}
        <div className="mb-16">
          <div className="eyebrow font-mono text-muted mb-4">VERSION 0.1 — MAY 2026</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight2 text-ink mb-6 leading-[1.05]">
            Legalise turns reviewable legal skills into audited matter workflows.
          </h1>
          <p className="text-xl text-muted leading-relaxed max-w-2xl">
            Open-source UK legal AI workspace. SKILL.md files, matter context, audit log per LLM
            call, CPR 31.22 gate on disclosed material. Skills come from{" "}
            <span className="text-ink">claude-for-uk-legal</span> by default; fork the catalogue,
            review the skills, point <span className="text-ink">PLUGINS_ROOT</span> at your fork.
            Approval is code review. Provenance is git history.
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

          {/* P12 buttons */}
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
                Installed skills
              </a>
              <a
                href="#/modules/submit"
                className="text-sm text-muted hover:text-ink transition-colors"
              >
                Submit a skill
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
                See it in action — no signup
              </a>
              <a
                href="#/auth/signup"
                className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
              >
                Sign up — free, BYO key
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
                Installed skills
              </a>
              <a
                href="#/modules/submit"
                className="text-sm text-muted hover:text-ink transition-colors"
              >
                Submit a skill
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
            Signup is free. Bring your own Anthropic or OpenAI key after
            verification — keys are stored encrypted server-side and used
            only by the privilege-aware model gateway on your matters. The
            seeded Khan v Acme demo matter is copied into your workspace on
            confirm so the first sign-in lands on something live.
          </p>
        </div>

        {/* Five parts — P7 em-dash list */}
        <section className="mb-24">
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            01. Execution layer — five parts
          </h2>
          <p className="prose-p">
            The execution layer is a small, named set of moving parts. Each is replaceable; none
            is a marketplace.
          </p>
          <ul className="list-none space-y-6 text-prose pl-0">
            {parts.map((p) => (
              <li key={p.name} className="flex items-start gap-4">
                <span className="text-ink font-bold">—</span>
                <span>
                  <strong className="text-ink font-semibold">{p.name}.</strong> {p.body}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Trust posture */}
        <section className="mb-24">
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            02. Trust posture
          </h2>
          <div className="bg-wash p-8 border-l-4 border-ink my-8">
            <p className="text-sm font-medium italic m-0">
              "If a matter has disclosure-tainted entries, the user must acknowledge the implied
              undertaking before those entries become readable. This is enforced server-side,
              not in the UI."
            </p>
          </div>
          <ul className="list-none space-y-4 text-prose text-sm pl-0">
            {trust.map((t, i) => (
              <li key={i} className="flex items-start gap-4">
                <span className="font-bold text-ink">—</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="prose-p mt-8">
            Honest about v0.1 limits: retention recorded but not enforced; append-only audit
            log by convention not by Postgres grant; module install / per-workspace policy is
            v0.2 work. See{" "}
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
