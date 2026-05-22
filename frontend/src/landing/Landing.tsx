import { useEffect, useRef, useState } from "react";
import { navigate } from "../lib/route";
import { useAuth } from "../auth/AuthProvider";
import { Footer } from "../ui/Footer";
import { WAITLIST_HREF } from "../lib/access";

const DEMO_SLUG = "khan-v-acme-trading-2026";

type Section = { id: string; label: string; sub?: boolean };

const SECTIONS: Section[] = [
  { id: "manifesto", label: "00. Manifesto" },
  { id: "abstract", label: "01. What it is" },
  { id: "how", label: "02. How it works" },
  { id: "trust", label: "03. The trust layer" },
  { id: "posture", label: "3.1 Privilege posture", sub: true },
  { id: "capabilities", label: "3.2 Capabilities", sub: true },
  { id: "limits", label: "04. What v0.1 is not" },
  { id: "keys", label: "05. Bring your own key" },
  { id: "source", label: "06. Open source" },
];

export function Landing() {
  const auth = useAuth();
  const onOpenDemo = () => navigate(`/matters/${DEMO_SLUG}`);

  const refs = useRef<Record<string, HTMLElement | null>>({});
  const [active, setActive] = useState<string>("abstract");

  useEffect(() => {
    const scrollToManifestoHash = () => {
      if (window.location.hash !== "#manifesto") return;
      window.setTimeout(() => {
        const el = refs.current.manifesto;
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.pageYOffset - 100;
        window.scrollTo({ top, behavior: "smooth" });
        setActive("manifesto");
      }, 0);
    };

    scrollToManifestoHash();

    const onScroll = () => {
      let current = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = refs.current[s.id];
        if (el) {
          const top = el.getBoundingClientRect().top;
          if (top <= 140) current = s.id;
        }
      }
      setActive(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("hashchange", scrollToManifestoHash);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("hashchange", scrollToManifestoHash);
    };
  }, []);

  const jump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = refs.current[id];
    if (el) {
      const top = el.getBoundingClientRect().top + window.pageYOffset - 100;
      window.scrollTo({ top, behavior: "smooth" });
      setActive(id);
    }
  };

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

  return (
    <div className="max-w-page mx-auto">
      {/* Hero: two-column above the fold */}
      <section className="px-4 sm:px-6 md:px-16 lg:px-24 py-16 grid grid-cols-1 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)] gap-12 lg:gap-16 items-start border-b border-rule">
        {/* Left column: text + CTAs */}
        <div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight2 text-ink mb-6 leading-[1.05]">
            Open-source infrastructure for supervised legal AI.
          </h1>
          <p className="text-xl text-muted leading-relaxed max-w-xl">
            Matter files, legal modules, privilege posture, capability gates,
            and an audit trail you can inspect.
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
              <a
                href={WAITLIST_HREF}
                className="text-sm text-muted hover:text-ink transition-colors"
              >
                Request hosted access
              </a>
            </div>
          )}
        </div>

        {/* Right column: editorial splash artwork */}
        <div className="hidden lg:block">
          <img
            src="/hero-splash.webp"
            width={2000}
            height={980}
            alt=""
            aria-hidden="true"
            className="w-full h-auto block select-none"
            draggable={false}
          />
        </div>
      </section>

      {/* Trust strip: stack credibility below the hero */}
      <section className="border-b border-rule px-4 sm:px-6 md:px-16 lg:px-24 py-12">
        <div className="eyebrow text-center mb-8">Built on</div>
        <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-6 max-w-4xl mx-auto">
          <span className="text-sm font-semibold text-ink">Anthropic Claude</span>
          <span className="text-sm font-semibold text-ink">OpenAI</span>
          <span className="text-sm font-semibold text-ink">FastAPI</span>
          <span className="text-sm font-semibold text-ink">Postgres + pgvector</span>
          <span className="text-sm font-semibold text-ink">Apache 2.0</span>
          <a
            href="https://github.com/b1rdmania/legalise"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-ink hover:text-prose transition-colors underline-offset-4 hover:underline"
          >
            github.com/b1rdmania/legalise
          </a>
        </div>
      </section>

      {/* Why I built this — editorial, sits above the whitepaper */}
      <section className="border-b border-rule px-4 sm:px-6 md:px-16 lg:px-24 py-20">
        <div className="max-w-2xl">
          <div className="eyebrow text-muted mb-6">Why I built this</div>
          <p className="text-lg text-ink leading-relaxed mb-5">
            I built Legalise because I think legal AI is starting in the wrong place.
          </p>
          <p className="text-lg text-ink leading-relaxed mb-5">
            The work does not begin with a chatbot. It begins with a matter
            file, a professional duty, a client document, and someone
            accountable.
          </p>
          <p className="text-lg text-ink leading-relaxed mb-10">
            If AI is going to advance legal work, the substrate should be
            inspectable: what it saw, what it did, what it produced, and who
            signed off.
          </p>
          <p className="text-base text-prose leading-relaxed">
            I&rsquo;m Andy Bird. I&rsquo;m not launching a law firm here.
            I&rsquo;m putting an open-source thesis in public so lawyers,
            engineers, and regulators can argue with it.
          </p>
        </div>
      </section>

      {/* Manifesto excerpt: the page carries the thesis, GitHub carries the full file */}
      <section
        id="manifesto"
        ref={(el) => { refs.current.manifesto = el; }}
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
              href="https://github.com/b1rdmania/legalise/blob/master/docs/MANIFESTO.md"
              target="_blank"
              rel="noreferrer"
              className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
            >
              Read the full manifesto
            </a>
          </div>
        </div>
      </section>

      {/* Whitepaper body: sidebar TOC + numbered sections */}
      <div className="flex">
      {/* Sidebar TOC, Warp shape */}
      <aside
        className="w-80 hidden lg:block sticky top-[80px] h-[calc(100vh-80px)] border-r border-rule p-10 overflow-y-auto"
        aria-label="Whitepaper sections"
      >
        <div className="eyebrow mb-8">Whitepaper</div>
        <nav className="flex flex-col gap-1">
          {SECTIONS.map((s) => {
            const isActive = active === s.id;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={jump(s.id)}
                className={
                  "py-2 border-l-2 transition-all " +
                  (s.sub ? "pl-8 text-xs " : "pl-4 text-sm ") +
                  (isActive
                    ? "border-ink text-ink font-semibold"
                    : "border-transparent text-muted hover:text-ink")
                }
              >
                {s.label}
              </a>
            );
          })}
        </nav>

        <div className="mt-12 pt-8 border-t border-rule">
          <div className="eyebrow-sm mb-4">Resources</div>
          <ul className="flex flex-col gap-3 text-sm">
            <li>
              <a
                href="https://github.com/b1rdmania/legalise"
                target="_blank"
                rel="noreferrer"
                className="text-ink hover:text-muted transition-colors"
              >
                GitHub repository
              </a>
            </li>
            <li>
              <a
                href="https://github.com/b1rdmania/legalise/blob/master/docs/MANIFESTO.md"
                target="_blank"
                rel="noreferrer"
                className="text-ink hover:text-muted transition-colors"
              >
                Manifesto
              </a>
            </li>
            <li>
              <a
                href="https://github.com/b1rdmania/legalise/blob/master/docs/TRUST.md"
                target="_blank"
                rel="noreferrer"
                className="text-ink hover:text-muted transition-colors"
              >
                Trust posture
              </a>
            </li>
            <li>
              <a
                href="https://github.com/b1rdmania/legalise/blob/master/docs/ROADMAP.md"
                target="_blank"
                rel="noreferrer"
                className="text-ink hover:text-muted transition-colors"
              >
                Roadmap
              </a>
            </li>
          </ul>
        </div>
      </aside>

      {/* Document column */}
      <main className="flex-1 px-4 sm:px-6 md:px-16 lg:px-24 py-16 max-w-4xl mx-auto">
        {/* 01. What it is */}
        <section
          id="abstract"
          ref={(el) => { refs.current.abstract = el; }}
          className="mb-24"
        >
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            01. What it is
          </h2>
          <p className="prose-p">
            Legalise is a single-tenant workspace for a single matter. The
            matter is the unit. Documents, chronology, audit, model calls,
            module installs, capability grants all hang off it. Open the
            Khan v Acme sample matter to see the surface end-to-end without
            signing up.
          </p>
          <p className="prose-p">
            Built for England &amp; Wales work. Privilege posture is a
            dispatch-time constraint, not a checkbox. The runtime refuses
            cloud calls when posture is C_paused. Capabilities are declared
            in module manifests, granted at install, and enforced before
            every privileged operation.
          </p>
          <p className="prose-p">
            The thesis is supervised autonomy. The system can advance work
            only inside a matter, under named permissions, with human review
            points and an audit trail that shows what happened.
          </p>
        </section>

        {/* 02. How it works */}
        <section
          id="how"
          ref={(el) => { refs.current.how = el; }}
          className="mb-24"
        >
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            02. How it works
          </h2>
          <p className="prose-p">
            Six verbs. The product mechanic carried by the workflow, not the
            architecture.
          </p>
          <ul className="list-none space-y-4 text-prose text-sm pl-0">
            {steps.map((s) => (
              <li key={s.name} className="flex items-start gap-4">
                <span className="font-bold text-ink">-</span>
                <span>
                  <strong className="text-ink font-semibold">{s.name}.</strong>{" "}
                  {s.body}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* 03. The trust layer */}
        <section
          id="trust"
          ref={(el) => { refs.current.trust = el; }}
          className="mb-24"
        >
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            03. The trust layer
          </h2>
          <p className="prose-p">
            Trust is not a marketing word here. It is the runtime contract
            between a module and the workspace. One sentence carries the
            whole posture.
          </p>
          <div className="bg-wash p-8 border-l-4 border-ink my-8">
            <p className="text-sm font-medium italic text-prose m-0">
              "Manifest requests capabilities. Workspace grants capabilities.
              Runtime enforces capabilities."
            </p>
          </div>

          <h3
            id="posture"
            ref={(el) => { refs.current.posture = el; }}
            className="text-lg font-bold tracking-tight2 text-ink mt-10 mb-4"
          >
            3.1 Privilege posture
          </h3>
          <p className="prose-p">
            Every matter carries one of three postures. A_cleared excludes
            privileged material and permits cloud providers. B_mixed
            requires opt-in per matter. C_paused refuses cloud calls
            altogether and routes only to local models. The gateway reads
            posture before every model call and writes an audit row on
            every denial.
          </p>

          <h3
            id="capabilities"
            ref={(el) => { refs.current.capabilities = el; }}
            className="text-lg font-bold tracking-tight2 text-ink mt-10 mb-4"
          >
            3.2 Capabilities
          </h3>
          <p className="prose-p">
            Seven capability names. Each module manifest lists the ones
            it needs. The workspace grants on install. The runtime checks
            the grant before each privileged operation; a denial is a
            structured 403 plus an audit row. Per-skill overrides keep
            grants tight to what each skill actually touches.
          </p>
        </section>

        {/* 04. What v0.1 is not */}
        <section
          id="limits"
          ref={(el) => { refs.current.limits = el; }}
          className="mb-24"
        >
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            04. What v0.1 is not
          </h2>
          <p className="prose-p">
            Honest about the limits so the live posture is legible.
          </p>
          <ul className="list-none space-y-4 text-prose text-sm pl-0">
            <li className="flex items-start gap-4">
              <span className="font-bold text-ink">-</span>
              <span>
                <strong className="text-ink font-semibold">Retention is recorded, not enforced.</strong>{" "}
                The retention clock is in the matter row; nothing yet acts on it.
              </span>
            </li>
            <li className="flex items-start gap-4">
              <span className="font-bold text-ink">-</span>
              <span>
                <strong className="text-ink font-semibold">Audit is append-only by convention.</strong>{" "}
                No Postgres revoke on DELETE yet. The application never deletes;
                the database does not refuse.
              </span>
            </li>
            <li className="flex items-start gap-4">
              <span className="font-bold text-ink">-</span>
              <span>
                <strong className="text-ink font-semibold">No multi-tenant isolation.</strong>{" "}
                Single workspace per deploy. Bring your own deploy if you need
                isolation. Multi-tenant is post-v0.2.
              </span>
            </li>
            <li className="flex items-start gap-4">
              <span className="font-bold text-ink">-</span>
              <span>
                <strong className="text-ink font-semibold">Not a substitute for counsel.</strong>{" "}
                The assistant cites; it does not advise. Module output is
                drafted material for a qualified solicitor to review.
              </span>
            </li>
            <li className="flex items-start gap-4">
              <span className="font-bold text-ink">-</span>
              <span>
                <strong className="text-ink font-semibold">Not for live client matters.</strong>{" "}
                The hosted demo is an evaluation workspace. Real AI workflows
                require your own model key — Legalise does not bundle or
                resell model access. Self-host for any work approaching real
                client material.
              </span>
            </li>
          </ul>
          <p className="prose-p mt-8">
            Full posture in{" "}
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

        {/* 05. Bring your own key */}
        <section
          id="keys"
          ref={(el) => { refs.current.keys = el; }}
          className="mb-24"
        >
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            05. Bring your own key
          </h2>
          <p className="prose-p">
            After email verification, attach an Anthropic or OpenAI key
            from the Profile page. Keys are encrypted at rest. The workspace
            never proxies through a shared key; every model call is billed
            against the operator's own provider account. Revoke at any
            time.
          </p>
          <p className="prose-p">
            The Khan v Acme sample matter seeds on first sign-in so the
            workspace is never empty.
          </p>
        </section>

        {/* 06. Open source */}
        <section
          id="source"
          ref={(el) => { refs.current.source = el; }}
          className="mb-24"
        >
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            06. Open source
          </h2>
          <p className="prose-p">
            Apache 2.0. Read the source, run it locally, fork it, ship a
            module against it. The plugin catalogue lives in a separate
            repo; the workspace pins a commit SHA so the install surface is
            reproducible.
          </p>
          <div className="flex flex-wrap gap-4 mt-6">
            <a
              href="https://github.com/b1rdmania/legalise"
              target="_blank"
              rel="noreferrer"
              className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
            >
              github.com/b1rdmania/legalise
            </a>
            <a
              href="https://github.com/b1rdmania/claude-for-uk-legal"
              target="_blank"
              rel="noreferrer"
              className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
            >
              Plugin catalogue
            </a>
          </div>
        </section>

        <Footer />
      </main>
      </div>
    </div>
  );
}
