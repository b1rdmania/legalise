// The sign-off scene (P34). The witness-statement summary as a signed
// artifact: the text the skill produced, the one tracked change the
// reviewer accepted (static spans in the P25 tracked-changes language —
// deletion struck in seal, insertion underlined in ink), and the
// signature block in the register idiom. Demo-only; no backend.

import { LedgerRow, SectionRule } from "../ui/certificate";

export function DemoSignedOutput() {
  return (
    <div className="mx-auto max-w-[820px]" data-testid="demo-signed-output">
      <div className="mb-6">
        <a
          href="/demo/assistant"
          className="text-sm text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
        >
          ← Chat
        </a>
      </div>

      <SectionRule label="Signed output" right="skill_response" />

      <header className="mt-6">
        <h1 className="text-3xl font-semibold tracking-tight2 text-ink sm:text-4xl">
          Summary of witness-statement-khan.docx
        </h1>
        <p className="mt-2 text-xs text-muted">
          Khan v Acme Trading Ltd · produced by a skill run · reviewed and
          signed 6 Apr 2026
        </p>
      </header>

      <div
        className="mt-8 border-t border-rule pt-8 text-[16px] leading-8 text-ink"
        data-testid="demo-signed-output-body"
      >
        <p>
          Ms Khan says the Instagram post treated as gross misconduct was made
          from a private account, outside working hours, to a closed audience
          of{" "}
          <span
            className="text-seal line-through decoration-seal decoration-1"
            data-testid="demo-signed-output-deletion"
          >
            roughly fifty followers
          </span>{" "}
          <span
            className="underline decoration-ink underline-offset-[3px]"
            data-testid="demo-signed-output-insertion"
          >
            47 approved followers
          </span>
          . She had raised a grievance about her line manager six weeks before
          the dismissal, and the same manager chaired the disciplinary meeting.
        </p>
        <p className="mt-6">
          Nothing in the statement suggests any customer, supplier, or
          colleague saw the post.
        </p>
      </div>

      <footer className="mt-12 border-t border-rule pt-4">
        <dl
          className="space-y-1 text-[11px] text-muted"
          data-testid="demo-signed-output-signature"
        >
          <LedgerRow label="Signed by" tone="ink">
            R. Patel, supervising solicitor
          </LedgerRow>
          <LedgerRow label="Author">assistant (skill run)</LedgerRow>
          <LedgerRow label="Sign-off">Signer is not the author</LedgerRow>
          <LedgerRow label="Date">2026-04-06</LedgerRow>
        </dl>
        <p className="mt-4 text-xs text-muted">
          <a
            href="/demo/audit"
            className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
          >
            See output.signed on the record →
          </a>
        </p>
        {/* The loop's last line is a way to reach the builder — the
            demo's one ask. */}
        <p className="mt-6 border-t border-rule pt-4 text-sm text-prose" data-testid="demo-capture-line">
          Supervise work product in a real firm? Tell me where this breaks,
          twenty minutes:{" "}
          <a
            href="mailto:andy@legalise.dev"
            className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
          >
            andy@legalise.dev
          </a>
        </p>
      </footer>
    </div>
  );
}
