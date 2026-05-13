import { useEffect, useState } from "react";

type HealthState = "checking" | "ok" | "error";

interface HealthResponse {
  status: string;
  version: string;
  database: string;
  environment: string;
}

export default function App() {
  const [health, setHealth] = useState<HealthState>("checking");
  const [info, setInfo] = useState<HealthResponse | null>(null);

  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((data: HealthResponse) => {
        setInfo(data);
        setHealth(data.database === "ok" ? "ok" : "error");
      })
      .catch(() => setHealth("error"));
  }, []);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Legalise</h1>
          <StatusBadge state={health} info={info} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-12 gap-6">
          <aside className="col-span-3">
            <nav className="space-y-1 text-sm text-stone-600">
              <div className="font-medium text-stone-900 mb-2">Matters</div>
              <div className="text-stone-400 italic">No matters yet</div>
            </nav>
          </aside>

          <section className="col-span-9">
            <h2 className="text-2xl font-semibold mb-2">Workspace</h2>
            <p className="text-stone-600 max-w-prose">
              UK legal practice has a missing middle layer between expensive BigLaw and gutted
              legal aid. Legalise is the open-source workspace built to help fill it — matter-first,
              privilege-preserving, England &amp; Wales.
            </p>
            <p className="text-stone-500 text-sm mt-6 max-w-prose">
              Day 1 of the v0.1 build is live: skeleton boots, database reachable, frontend renders.
              Matter CRUD, audit log, and privilege posture land on Days 2&ndash;3. See
              {" "}<code className="font-mono text-xs">BUILD_PLAN.md</code> in the repo.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ state, info }: { state: HealthState; info: HealthResponse | null }) {
  const colour =
    state === "checking"
      ? "bg-stone-100 text-stone-600"
      : state === "ok"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-red-50 text-red-700";

  const label =
    state === "checking"
      ? "Checking…"
      : state === "ok"
      ? `v${info?.version ?? "?"} · ${info?.environment ?? "?"} · db ok`
      : "Backend unreachable";

  return (
    <span className={`text-xs font-mono px-2 py-1 rounded ${colour}`}>
      {label}
    </span>
  );
}
