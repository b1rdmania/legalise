export function Footer() {
  return (
    <footer className="mt-32 pt-12 border-t border-rule flex flex-wrap gap-y-4 justify-between items-center text-xs text-muted uppercase tracking-track2">
      <span>© 2026 Legalise</span>
      {/* P28: doc deep-links (Trust / Security / Roadmap) moved to
          /architecture as citations; the footer keeps the four doors. */}
      <div className="flex gap-6">
        <a href="/architecture" className="hover:text-ink">
          Architecture
        </a>
        <a href="/about" className="hover:text-ink">
          About
        </a>
        <a href="mailto:andrew@legalise.dev" className="hover:text-ink">
          andrew@legalise.dev
        </a>
        <a
          href="https://github.com/b1rdmania/legalise"
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink"
        >
          GitHub
        </a>
        <a
          href="https://github.com/b1rdmania/legalise/blob/master/LICENSE"
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink"
        >
          Apache 2.0
        </a>
      </div>
    </footer>
  );
}
