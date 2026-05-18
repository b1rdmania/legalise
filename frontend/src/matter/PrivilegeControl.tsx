export function PrivilegeControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const colour =
    value === "A_cleared"
      ? "#00A35C"
      : value === "B_mixed"
        ? "#E67E22"
        : value === "C_paused"
          ? "#D9304F"
          : "#181818";
  return (
    <label
      className="relative inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono uppercase text-[10px] tracking-track2 font-bold cursor-pointer"
      style={{ borderColor: colour, color: colour }}
    >
      <span className="w-1.5 h-1.5" style={{ backgroundColor: colour }} />
      {value.replace("_", " ").toUpperCase()}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label="Privilege posture"
      >
        <option value="A_cleared">A_cleared - frontier OK</option>
        <option value="B_mixed">B_mixed - local preferred</option>
        <option value="C_paused">C_paused - LLM blocked</option>
      </select>
    </label>
  );
}
