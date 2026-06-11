/**
 * "Request this skill" — the non-admin path out of the
 * "ask an administrator" dead end. One POST to
 * /api/modules/requests; the audit row is the request. Quiet
 * confirmation, no further chrome — the admin sees the ask on
 * /skills under "Requested by your workspace".
 */

import { useState } from "react";
import { requestModule } from "../lib/api";

type RequestState = "idle" | "sending" | "done" | "error";

export function RequestSkillButton({
  moduleId,
  source,
}: {
  moduleId: string;
  source?: string;
}) {
  const [state, setState] = useState<RequestState>("idle");
  const [err, setErr] = useState<string | null>(null);

  if (state === "done") {
    return (
      <p className="text-sm text-muted" data-testid="request-skill-confirmation">
        Requested — your administrator will see it.
      </p>
    );
  }

  const onRequest = async () => {
    setErr(null);
    setState("sending");
    try {
      await requestModule(moduleId, source);
      setState("done");
    } catch (e) {
      setErr(String(e));
      setState("error");
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onRequest}
        disabled={state === "sending"}
        data-testid="request-skill"
        className="inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm text-paper hover:bg-seal disabled:opacity-50"
      >
        {state === "sending" ? "Requesting…" : "Request this skill"}
      </button>
      {err && <p className="mt-2 text-xs text-seal">{err}</p>}
    </div>
  );
}
