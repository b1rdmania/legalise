import { PENALTY_BADGE, type Company } from "../data/scorecard";

export function CompanyCard({ c, showScore = true }: { c: Company; showScore?: boolean }) {
  return (
    <a
      href={`#/c/${c.id}`}
      className="block border border-rule rounded-card overflow-hidden bg-panel/40 hover:border-ink transition-colors"
    >
      <img
        src={c.screenshot}
        alt=""
        className="w-full aspect-[16/10] object-cover object-top border-b border-rule bg-wash"
        loading="lazy"
      />
      <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={c.logo}
            alt=""
            width={28}
            height={28}
            className="rounded shrink-0 bg-paper"
            loading="lazy"
          />
          <span className="font-bold text-lg leading-tight underline decoration-rule underline-offset-4 truncate">
            {c.name}
          </span>
        </div>
        {showScore && (
          <span className="tech-token font-bold whitespace-nowrap">
            {c.comp.toFixed(0)}
            <span className="text-muted font-normal">/35</span>
          </span>
        )}
      </div>

      {c.penalties && c.penalties.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {c.penalties.map((p) => (
            <span
              key={p.type}
              className="text-[10px] uppercase tracking-track1 text-seal border border-seal px-1 py-0.5"
            >
              {PENALTY_BADGE[p.type]} {p.points}
            </span>
          ))}
        </div>
      )}

      <p className="prose-p !mb-0 mt-3 text-sm">
        <span className="italic">My take: </span>
        {c.my_take}
      </p>
      </div>
    </a>
  );
}
