export function Footer() {
  return (
    <footer className="mt-32 pt-12 border-t border-rule flex flex-wrap gap-y-4 justify-between items-center text-xs text-muted uppercase tracking-track2">
      <span>© 2026 Legalise - Apache 2.0</span>
      <div className="flex gap-6">
        <a
          href="https://github.com/b1rdmania/legalise/blob/master/docs/TRUST.md"
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink"
        >
          Trust
        </a>
        <a
          href="https://github.com/b1rdmania/legalise"
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}
