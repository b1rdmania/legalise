// PrivilegeControl - monochrome posture selector.
// v0.3: no semantic colour fills. Reads as a plain mono dropdown
// sitting inline with the surrounding sidebar text. No coloured pill,
// no coloured square. Matches the document-as-product idiom.

export function PrivilegeControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Privilege posture"
      className="bg-transparent text-sm font-semibold font-mono text-ink border-none outline-none cursor-pointer p-0 -ml-0.5 focus-visible:underline focus-visible:underline-offset-4"
    >
      <option value="A_cleared">A_cleared</option>
      <option value="B_mixed">B_mixed</option>
      <option value="C_paused">C_paused</option>
    </select>
  );
}
