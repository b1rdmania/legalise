/**
 * /about — the business-card landing (DESIGN.md P28).
 *
 * Cards in circulation point at legalise.dev; the people holding one
 * land here. One short register-idiom page: who built this, why, what a
 * reader can do about it. Pitch register — specificity, no superlatives.
 */

import { Footer } from "../ui/Footer";
import { Colophon } from "../ui/certificate";

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
            <p>
              I&apos;m Andrew. Not a lawyer. Not a law firm founder. I come at
              this from the outside.
            </p>
            <p>
              The credential that matters here: I&apos;ve been through the FCA
              and Bank of England sandbox as an applicant. I&apos;ve seen up
              close what a regulator wants from a technical build before they
              sign it off.
            </p>
            <p>
              That&apos;s my lens. Not &ldquo;what can AI do&rdquo;. In my other
              work the answer to that is everything. The question I care about is
              what a regulator or an insurer needs to see before a firm puts AI
              at the centre of how it works.
            </p>
            <p>
              So I built Legalise. I kept watching AI get legal work wrong.
              Confidently, and with no trail of how it got there. Legalise keeps
              the trail. Every output is supervised, signed, and on a record you
              could hand a regulator. Open source, Apache 2.0, unfinished, and
              open to anyone who wants to contribute.
            </p>
            <p>
              I&apos;m unimpressed by most of the legal AI incumbents. Closed
              models, aggressive per-head pricing. The open source work building
              across a few projects right now raises the bar, and I want
              Legalise in that fight.
            </p>
          </div>

          <div className="mt-10 max-w-xl">
            <p className="text-[11px] uppercase tracking-[0.3em] text-seal">
              Up for meeting
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-prose marker:text-seal">
              <li>legal tech nerds bored in slow-moving internal roles</li>
              <li>UK solicitors curious what an SRA sandbox pilot could look like</li>
              <li>people thinking about AI and access to law</li>
              <li>anyone building coherently in open source</li>
            </ul>
            <p className="mt-5 text-base leading-relaxed text-prose">
              Or just tell me where this breaks. DMs open.
            </p>
          </div>

          {/* Links — one line at the close. */}
          <p className="mt-8 text-sm text-muted">
            <a href={X_PROFILE} target="_blank" rel="noreferrer" className={linkClass}>
              X
            </a>
            {" · "}
            <a href={LINKEDIN} target="_blank" rel="noreferrer" className={linkClass}>
              LinkedIn
            </a>
            {" · "}
            <a href="mailto:andrew@legalise.dev" className={linkClass}>
              andrew@legalise.dev
            </a>
            {" · "}
            <a href={GITHUB_PROFILE} target="_blank" rel="noreferrer" className={linkClass}>
              GitHub
            </a>
          </p>
        </header>

        <Colophon>Not a law firm. Not legal advice. One builder, in the open.</Colophon>

        <Footer />
      </div>
    </div>
  );
}
