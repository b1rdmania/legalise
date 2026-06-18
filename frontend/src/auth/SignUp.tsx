/**
 * /auth/signup — hosted sign-up is closed during the beta. Instead of a
 * form, the page says the hosted backend is in private beta, points to a
 * contact, and shows the demo. The sign-in page still exists for testers.
 */

export function SignUp() {
  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 md:px-16 lg:px-24 py-16 md:py-20">
      <h1 className="font-redaction35 text-[52px] sm:text-[72px] leading-none tracking-tight2 text-ink">
        Hosted beta
      </h1>
      <div className="mt-8 max-w-xl space-y-5 text-base leading-relaxed text-prose">
        <p>
          We&apos;re beta testing the hosted backend next week. Sign-up
          isn&apos;t open yet.
        </p>
        <p>
          If you&apos;d like to join the testing, get in touch:{" "}
          <a
            href="mailto:andrew@legalise.dev"
            className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
          >
            andrew@legalise.dev
          </a>
          .
        </p>
      </div>

      <div className="mt-12 max-w-3xl">
        <h2 className="text-lg font-bold tracking-tight2 text-ink">Here&apos;s a demo</h2>
        <div className="mt-4 border border-ink/70 bg-paper p-2">
          <video
            src="/media/backend-demo-v2.mp4"
            poster="/media/backend-demo-v2-poster.jpg"
            className="block w-full border border-rule/60"
            loop
            autoPlay
            playsInline
            controls
            preload="metadata"
            ref={(el) => {
              if (el) {
                el.muted = true;
                void el.play().catch(() => undefined);
              }
            }}
          />
        </div>
        <p className="mt-4 text-sm text-muted">
          Or{" "}
          <a
            href="/guided-demo"
            className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
          >
            walk the guided demo &rarr;
          </a>
        </p>
      </div>
    </div>
  );
}
