/**
 * /about — the business-card landing (DESIGN.md P28).
 *
 * Cards in circulation point at legalise.dev; the people holding one
 * land here. One short register-idiom page: who built this, why, what a
 * reader can do about it. Pitch register — specificity, no superlatives.
 */

import { Github } from "lucide-react";
import { Footer } from "../ui/Footer";
import { CertCard, CertEyebrow, Colophon, LedgerRow, SectionRule } from "../ui/certificate";

const GITHUB_PROFILE = "https://github.com/b1rdmania";
const REPO = "https://github.com/b1rdmania/legalise";
const LINKEDIN = "https://www.linkedin.com/in/andrew-bird-nomos/";
const X_PROFILE = "https://x.com/b1rdmania";

/** Brand marks lucide doesn't carry (X) or styles poorly (LinkedIn).
 * Official glyph paths, currentColor, sized to match the Github icon. */
function XMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function MailMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

export function About() {
  return (
    <div className="max-w-page mx-auto">
      <div className="px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
        {/* Masthead — the monument carries the page alone (P30). */}
        <header>
          <h1 className="font-redaction35 text-[52px] sm:text-[72px] leading-none tracking-tight2 text-ink">
            Andy Bird
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-muted">
            Builder of Legalise
          </p>
          <p className="mt-8 max-w-xl text-base leading-relaxed text-prose">
            I&apos;m Andy. I&apos;m not a lawyer. I&apos;m not selling you
            anything. I kept watching AI get legal work wrong, with full
            confidence and no trail of how. So I built the thing that keeps the
            trail. It&apos;s an open experiment. If you find it useful, or you can
            break it, my DMs are open.
          </p>
        </header>

        <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <SectionRule label="Why I built it" />
            <div className="mt-6 space-y-5 text-base leading-relaxed text-prose">
              <p>
                The question I&apos;m chasing is simple. What would AI look like
                if it sat at the base of a law firm the SRA regulates, or a
                sandbox version of one, built so regulators and insurers were
                happy to sign off? And under that: where is AI good, where is it
                bad, where does a human have to stay in the loop, and who carries
                the blame when a decision goes wrong?
              </p>
              <p>
                What I built grew bigger than I planned. Every question I opened
                led to another. It is not a finished product. It&apos;s an open
                experiment under Apache 2.0, and anyone can contribute.
              </p>
              <p>
                I&apos;m not a legal expert and I&apos;m not after a retainer.
                What I know is where AI breaks and where it can help. The thing
                worth trying: small pilots, built to pass regulatory approval.
              </p>
            </div>

            <div className="mt-12">
              <SectionRule label="Reach me" />
              <p className="mt-6 max-w-xl text-base leading-relaxed text-prose">
                If you check legal work in a real firm, give me twenty minutes
                and tell me where this breaks:{" "}
                <a
                  href="mailto:andy@legalise.dev"
                  className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                >
                  andy@legalise.dev
                </a>
                . Or see it run first.
              </p>
              <div className="mt-6 flex flex-wrap gap-4">
                <a
                  href="mailto:andy@legalise.dev"
                  className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
                >
                  Email Andy
                </a>
                <a
                  href="/guided-demo"
                  className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
                >
                  See the demo
                </a>
              </div>
            </div>
          </div>

          <aside>
            <CertCard>
              <CertEyebrow left="Record 01" right="The builder" />
              <h2 className="mt-3 text-[22px] leading-tight tracking-tight2 text-ink">
                Andy Bird
              </h2>
              <p className="mt-1 text-xs text-muted">b1rdmania</p>
              <div className="mt-4 border-t border-rule pt-3">
                <dl className="space-y-1 text-[11px] text-muted">
                  <LedgerRow label="Based">London</LedgerRow>
                  <LedgerRow label="Builds" tone="ink">
                    Legalise
                  </LedgerRow>
                  <LedgerRow label="Licence">Apache 2.0</LedgerRow>
                  <LedgerRow label="Jurisdiction">England &amp; Wales</LedgerRow>
                </dl>
              </div>
              <div className="mt-4 border-t border-rule pt-3 space-y-2">
                <a
                  href="mailto:andy@legalise.dev"
                  className="flex items-center gap-2 text-xs text-ink transition-colors hover:text-seal"
                >
                  <MailMark />
                  andy@legalise.dev
                </a>
                <a
                  href={LINKEDIN}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-xs text-ink transition-colors hover:text-seal"
                >
                  <LinkedInMark />
                  andrew-bird-nomos
                </a>
                <a
                  href={X_PROFILE}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-xs text-ink transition-colors hover:text-seal"
                >
                  <XMark />
                  @b1rdmania
                </a>
                <a
                  href={GITHUB_PROFILE}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-xs text-ink transition-colors hover:text-seal"
                >
                  <Github size={14} strokeWidth={1.75} aria-hidden="true" />
                  github.com/b1rdmania
                </a>
                <a
                  href={REPO}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-xs text-muted transition-colors hover:text-seal"
                >
                  <Github size={14} strokeWidth={1.75} aria-hidden="true" />
                  b1rdmania/legalise
                </a>
              </div>
            </CertCard>
          </aside>
        </div>

        <Colophon>Not a law firm. Not legal advice. One builder, in the open.</Colophon>

        <Footer />
      </div>
    </div>
  );
}
