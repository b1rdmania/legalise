export function Footer() {
  return (
    <footer className="mt-32 pt-12 border-t border-rule flex flex-wrap gap-y-4 justify-between items-center text-xs text-muted uppercase tracking-track2">
      <span>© 2026 Legalise</span>
      <div className="flex gap-6">
        <a
          href="https://github.com/b1rdmania/legalise"
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink"
        >
          View on GitHub
        </a>
        <a href="mailto:andrew@legalise.dev" className="hover:text-ink">
          Email
        </a>
      </div>
    </footer>
  );
}
