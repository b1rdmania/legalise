/**
 * /about — the business-card landing (DESIGN.md P28).
 *
 * Cards in circulation point at legalise.dev; the people holding one
 * land here. One short register-idiom page: who built this, why, what a
 * reader can do about it. Pitch register — specificity, no superlatives.
 */

import { Footer } from "../ui/Footer";
import { Colophon, SectionRule } from "../ui/certificate";

const GITHUB_PROFILE = "https://github.com/b1rdmania";
const LINKEDIN = "https://www.linkedin.com/in/andrew-bird-nomos/";
const X_PROFILE = "https://x.com/b1rdmania";

const linkClass =
  "text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal";

export function About() {
  return (
    <div className="max-w-page mx-auto">
      <div className="px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
        {/* Masthead — the monument carries the page alone (P30). */}
        <header>
          <h1 className="font-redaction35 text-[52px] sm:text-[72px] leading-none tracking-tight2 text-ink">
            About
          </h1>

          <div className="mt-8 max-w-xl space-y-5 text-base leading-relaxed text-prose">
            <p>I&apos;m Andrew.</p>
            <p>
              A few months building in legal AI. Outside it, I&apos;ve been
              through the FCA and Bank of England sandbox process as an
              applicant, so I&apos;ve seen what a regulator actually wants from a
              technical build.
            </p>
            <p>
              I&apos;m not a lawyer. I&apos;m not a law firm founder. I come at
              this as an outsider.
            </p>
            <p>
              So I don&apos;t look at legal AI through &ldquo;what can AI
              do&rdquo;. In my other work, the answer to that is everything.
            </p>
            <p>
              I look at what a regulator or an insurer needs to see before a law
              firm makes AI central to how it works.
            </p>
            <p>
              I&apos;m also resolutely unimpressed by a lot of the legal AI
              incumbents. Closed models, aggressive per-head pricing.
            </p>
            <p>
              The open-source momentum building across a few projects right now
              raises the bar for everyone.
            </p>
            <p>
              The new UK SRA sandbox interests me. Pilot programmes, or someone
              who wants to build a regulated, AI-augmented law firm. My DMs are
              open.
            </p>
          </div>

          {/* Links — one line directly under the intro. */}
          <p className="mt-6 text-sm text-muted">
            <a href={X_PROFILE} target="_blank" rel="noreferrer" className={linkClass}>
              X
            </a>
            {" · "}
            <a href={LINKEDIN} target="_blank" rel="noreferrer" className={linkClass}>
              LinkedIn
            </a>
            {" · "}
            <a href="mailto:andy@legalise.dev" className={linkClass}>
              andy@legalise.dev
            </a>
            {" · "}
            <a href={GITHUB_PROFILE} target="_blank" rel="noreferrer" className={linkClass}>
              GitHub
            </a>
          </p>
        </header>

        <div className="mt-16 max-w-xl">
          <SectionRule label="Why I built it" />
          <div className="mt-6 space-y-5 text-base leading-relaxed text-prose">
            <p>
              It&apos;s an open experiment in audit trails and modular workflows
              for a legal platform. It is not a finished product. It&apos;s open
              under Apache 2.0, and anyone can contribute.
            </p>
            <p>
              I&apos;m open to criticism and collaboration. If you find it
              useful, or you can break it, get in touch.
            </p>
          </div>
        </div>

        <Colophon>Not a law firm. Not legal advice. One builder, in the open.</Colophon>

        <Footer />
      </div>
    </div>
  );
}
