// PrivilegeControl - monochrome posture selector.
// No semantic colour fills for A_cleared / B_mixed. Reads as a
// plain mono dropdown sitting inline with the surrounding sidebar text.
// Matches the document-as-product idiom.
//
// C_paused is the single exception — text turns seal because
// posture C refuses cloud calls, and the gateway refusal is itself an
// audited event. The seal hint flags it before any action is attempted.

export function PrivilegeControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isPaused = value === "C_paused";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Privilege control"
      className={
        "bg-transparent text-sm font-semibold tech-token border-none outline-none cursor-pointer p-0 -ml-0.5 focus-visible:underline focus-visible:underline-offset-4 " +
        (isPaused ? "text-seal" : "text-ink")
      }
    >
      <option value="A_cleared">A_cleared</option>
      <option value="B_mixed">B_mixed</option>
      <option value="C_paused">C_paused</option>
    </select>
  );
}
