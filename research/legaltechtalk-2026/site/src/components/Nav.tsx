const LINKS = [
  ["map", "Map"],
  ["gems", "Gems"],
  ["whitespace", "White space"],
  ["killlist", "Kill-list"],
  ["meaning", "So what"],
];

export function Nav() {
  return (
    <nav className="sticky top-0 z-20 bg-paper/90 backdrop-blur border-b border-rule">
      <div className="mx-auto max-w-page px-6 h-12 flex items-center justify-between">
        <a href="#top" className="font-bold tracking-tight2 text-sm">
          LegalTechTalk 2026 · Teardown
        </a>
        <div className="hidden sm:flex items-center gap-5 text-sm text-prose">
          {LINKS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="hover:text-ink">
              {label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
