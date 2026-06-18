import { useEffect, useMemo, useState } from "react";
import { loadScorecard, THESIS2_IDS, type ScoreRow } from "../data/scorecard";

const confDot: Record<string, string> = {
  high: "bg-ink",
  medium: "bg-muted",
  low: "bg-rule",
};

function Row({ row, rank }: { row: ScoreRow; rank: number }) {
  const isT2 = THESIS2_IDS.has(row.id);
  return (
    <tr className="border-t border-rule align-top">
      <td className="py-3 pr-3 tech-token text-muted">{rank}</td>
      <td className="py-3 pr-3">
        <span className="font-bold">{row.name}</span>
        {isT2 && (
          <span className="ml-2 align-middle text-[10px] uppercase tracking-track1 text-seal border border-seal px-1 py-0.5">
            Thesis 2
          </span>
        )}
        <div className="text-muted text-sm">{row.cat}</div>
      </td>
      <td className="py-3 pr-3 tech-token text-right font-bold">
        {row.comp.toFixed(0)}
        <span className="text-muted font-normal">/35</span>
      </td>
      <td className="py-3 pr-3 tech-token text-muted text-right hidden sm:table-cell">
        {row.T}×2
      </td>
      <td className="py-3 pr-3 hidden md:table-cell">
        <span
          className={`inline-block w-2 h-2 mr-1.5 ${confDot[row.conf] ?? "bg-rule"}`}
        />
        <span className="text-muted text-sm">{row.conf}</span>
      </td>
      <td className="py-3 prose-p !mb-0 text-sm hidden lg:table-cell max-w-[34rem]">
        {row.verdict}
      </td>
    </tr>
  );
}

export function Scorecard() {
  const [rows, setRows] = useState<ScoreRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [slim, setSlim] = useState(false);

  useEffect(() => {
    loadScorecard().then(setRows).catch((e) => setErr(String(e)));
  }, []);

  const shown = useMemo(
    () => (rows ? (slim ? rows.slice(0, 20) : rows) : []),
    [rows, slim],
  );

  if (err) return <p className="prose-p text-seal">Could not load scorecard: {err}</p>;
  if (!rows) return <p className="prose-p">Loading the screen…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-muted text-sm tech-token">
          {shown.length} of {rows.length} — composite /35, thesis-fit ×2
        </p>
        <button
          onClick={() => setSlim((s) => !s)}
          className="text-sm border border-ink px-3 py-1 hover:bg-ink hover:text-paper transition-colors"
        >
          {slim ? "Show all 33" : "Slim to top 20"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="eyebrow">
              <th className="py-2 pr-3 font-bold">#</th>
              <th className="py-2 pr-3 font-bold">Company</th>
              <th className="py-2 pr-3 font-bold text-right">Comp</th>
              <th className="py-2 pr-3 font-bold text-right hidden sm:table-cell">
                Thesis
              </th>
              <th className="py-2 pr-3 font-bold hidden md:table-cell">Conf</th>
              <th className="py-2 font-bold hidden lg:table-cell">Read</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <Row key={r.id} row={r} rank={i + 1} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
