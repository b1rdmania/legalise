export function BrandMark() {
  // simple 24×24 ink-on-paper mark — block "M" so brand stamp reads as a workmark
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" stroke="currentColor" strokeWidth="2" />
      <path d="M7 17V7l5 6 5-6v10" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter" />
    </svg>
  );
}
