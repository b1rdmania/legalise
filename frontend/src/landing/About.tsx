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

export function About() {
  return (
    <div className="max-w-page mx-auto">
      <div className="px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
        {/* Masthead */}
        <header>
          <div className="flex items-baseline justify-between border-b border-ink pb-2">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
              Legalise · About
            </p>
            <p className="text-[10px] uppercase tracking-[0.3em] text-ink">
              London
            </p>
          </div>
          <h1 className="mt-10 font-redaction35 text-[52px] sm:text-[72px] leading-none tracking-tight2 text-ink">
            Andy Bird
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-muted">
            Builder of Legalise
          </p>
          <p className="mt-8 max-w-xl text-sm leading-relaxed text-prose">
            If a card with legalise.dev on it brought you here, this is the
            person behind it, and this page is the fastest way to understand
            what you were handed.
          </p>
        </header>

        <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <SectionRule label="The short version" />
            <div className="mt-6 space-y-5 text-base leading-relaxed text-prose">
              <p>
                I build software in London. Legalise is the current build: an
                open-source workspace for AI legal work in England &amp; Wales,
                designed so that every output knows its sources, its
                permissions, and who stood behind it.
              </p>
              <p>
                The position is simple. The models already do the work, and
                they are available to everyone. What a regulated firm actually
                lacks is the apparatus around the work: admission, supervision,
                refusal, sign-off, record. That apparatus is what I am
                building, in the open, under Apache 2.0.
              </p>
              <p>
                Right now I want one thing: conversations with practising
                solicitors. If you supervise work product in a real firm and
                are willing to tell me where this breaks, I would like to hear
                from you.
              </p>
            </div>

            <div className="mt-12">
              <SectionRule label="Start here" />
              <div className="mt-6 flex flex-wrap gap-4">
                <a
                  href="/demo"
                  className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
                >
                  Open the demo
                </a>
                <a
                  href="/architecture"
                  className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
                >
                  Read the architecture
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
