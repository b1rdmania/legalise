import { Github } from "lucide-react";
import { navigate } from "../lib/route";
import { useAuth } from "../auth/AuthProvider";
import { Footer } from "../ui/Footer";

const DEMO_SLUG = "khan-v-acme-trading-2026";

const SURFACES: { title: string; body: string }[] = [
  {
    title: "Open project",
    body: "A matter workspace holds the documents, skills, outputs, signatures, and record in one place.",
  },
  {
    title: "Add skill",
    body: "Skills are governed legal work units. They declare what they read, what they write, and how they run.",
  },
  {
    title: "Run against documents",
    body: "The AI works inside the matter file, not in a loose prompt window. Sources stay attached.",
  },
  {
    title: "Review output",
    body: "Outputs are drafts until a human reads them, changes them where needed, and decides what to stand behind.",
  },
  {
    title: "Sign",
    body: "Professional sign-off pins the output and records who took responsibility for it.",
  },
  {
    title: "Export record",
    body: "The working pack carries the outputs, source context, signatures, and audit record.",
  },
];

const QUICKSTART_CMD =
  "git clone https://github.com/b1rdmania/legalise && cd legalise && ./scripts/quickstart.sh";

function QuickstartCommand() {
  const onCopy = () => {
    void navigator.clipboard?.writeText(QUICKSTART_CMD);
  };
  return (
    <div className="mt-6 flex max-w-xl items-center gap-3 border border-rule bg-wash px-4 py-3">
      <code className="tech-token min-w-0 flex-1 truncate text-xs text-prose">
        <span className="select-none text-muted">$ </span>
        {QUICKSTART_CMD}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 text-xs font-medium text-muted underline underline-offset-4 decoration-rule transition-colors hover:decoration-seal hover:text-seal"
      >
        Copy
      </button>
    </div>
  );
}

export function Landing() {
  const auth = useAuth();
  const onOpenDemo = () => navigate(`/matters/${DEMO_SLUG}`);

  return (
    <div className="max-w-page mx-auto">
      <section className="relative overflow-hidden border-b border-rule">
        <div className="relative z-20 flex justify-end gap-3 px-4 pt-4 sm:px-6 md:px-16 lg:px-24">
          {auth.user ? (
            <a
              href="/matters"
              className="border border-rule px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-wash"
            >
              Open workspace
            </a>
          ) : (
            <>
              <a
                href="/auth/signin"
                className="px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                Sign in
              </a>
              <a
                href="/auth/signup"
                className="border border-rule px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-wash"
              >
                Create account
              </a>
            </>
          )}
        </div>
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
          <div className="eyebrow text-muted mb-5">
            Open source · Apache 2.0 · v0.1
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight2 text-ink mb-2 leading-[1.05]">
            Legal AI that signs its work.
          </h1>
          <div className="w-16 h-[3px] bg-seal mt-3 mb-6" aria-hidden="true" />
          <p className="text-xl text-muted leading-relaxed max-w-xl">
            An open-source workspace for England &amp; Wales. Plug in a legal
            skill, run it from chat, watch the supervised run. Every output
            knows its sources, its permissions, and who stood behind it.
          </p>

          {/* CTAs */}
          {auth.user ? (
            <div className="flex flex-wrap items-center gap-4 mt-10">
              <button
                onClick={onOpenDemo}
                className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px]"
              >
                Open demo project
              </button>
              <a
                href="/matters"
                className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
              >
                Matters
              </a>
              <a
                href="/skills"
                className="text-sm text-muted hover:text-seal transition-colors"
              >
                Skills
              </a>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 mt-10">
              <a
                href="/demo"
                className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
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

          <QuickstartCommand />

          <p className="eyebrow mt-8 text-muted">
            Not a law firm. Not legal advice. Bring your own model key.
          </p>
        </div>
      </section>

      <section className="border-b border-rule px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
        <div className="max-w-page mx-auto">
          <div className="eyebrow text-muted mb-3">How it works</div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight2 text-ink mb-10 leading-tight max-w-2xl">
            Six steps, and a record of every one.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            {SURFACES.map((s, i) => (
              <div
                key={s.title}
                className="bg-paper p-6 md:p-8 hover:bg-wash transition-colors"
              >
                <div className="tech-token text-xs text-muted mb-4">
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

      <section
        id="manifesto"
        className="border-b border-rule px-4 sm:px-6 md:px-16 lg:px-24 py-20"
      >
        <div className="max-w-4xl">
          <div className="eyebrow text-muted mb-6">What we are building</div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight2 text-ink mb-8 leading-tight">
            Infrastructure a regulated firm could inspect, insure, and explain.
          </h2>
          <div className="grid gap-8 md:grid-cols-2 text-base leading-relaxed text-prose">
            <p>
              A law firm cannot just “use AI” and hope the supervision story
              works out later. It needs a matter file, source visibility,
              permission checks, professional sign-off, and an audit record.
            </p>
            <p>
              Claude is the MVP target because the skills format works well
              there. The architecture is built so a firm can later run other
              approved model providers or local models inside its own controls.
            </p>
          </div>
          <div className="mt-10 grid gap-px border border-rule bg-rule md:grid-cols-3">
            <div className="bg-paper p-5">
              <h3 className="font-semibold text-ink">Solicitor accountable</h3>
              <p className="mt-2 text-sm leading-relaxed text-prose">
                AI prepares. The human reviews, changes, and signs.
              </p>
            </div>
            <div className="bg-paper p-5">
              <h3 className="font-semibold text-ink">Sources visible</h3>
              <p className="mt-2 text-sm leading-relaxed text-prose">
                Outputs point back to the documents the reviewer should check.
              </p>
            </div>
            <div className="bg-paper p-5">
              <h3 className="font-semibold text-ink">Record exportable</h3>
              <p className="mt-2 text-sm leading-relaxed text-prose">
                The working pack carries outputs, signatures, and audit trail.
              </p>
            </div>
          </div>
          <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted">
            The hosted site is a demonstration. The build is aimed at real
            regulated deployment.
          </p>
        </div>
      </section>

      <section className="border-b border-rule px-4 sm:px-6 md:px-16 lg:px-24 py-16">
        <div className="max-w-3xl">
          <div className="eyebrow text-muted mb-5">Try it</div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight2 text-ink leading-tight">
            See a Khan v Acme demo matter with documents, skills, and a record.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-prose">
            No sign-in. Click through the matter, inspect the documents, open
            a skill preview, and read the record.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="/demo"
              className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
            >
              Open the demo
            </a>
            <a
              href="/skills"
              className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
            >
              Browse skills
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
