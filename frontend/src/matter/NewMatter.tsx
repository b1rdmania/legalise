import { useState } from "react";
import type { FormEvent } from "react";
import { createMatter } from "../lib/api";
import { navigate } from "../lib/route";
import type { ReactNode } from "react";
import { ErrorCallout, PageHeader } from "../ui/primitives";

// Ledger-label form field (DESIGN.md P27): labels carry the 0.18em
// clerk's-ledger tier rather than the generic eyebrow-sm.
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
        {label}
        {hint && (
          <span className="ml-2 normal-case tracking-normal text-xs text-muted">
            ({hint})
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

export function NewMatter() {
  const [form, setForm] = useState({
    title: "",
    matter_type: "employment_tribunal",
    cause: "s.94 ERA 1996, unfair dismissal",
    case_theory: "",
    pivot_fact: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const matter = await createMatter(form);
      navigate(`/matters/${matter.slug}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "bg-paper border border-rule px-4 py-3 text-[16px] sm:text-[17px] focus:border-ink focus:outline-none transition-colors min-h-[44px] font-sans text-ink w-full";

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <PageHeader eyebrow="Open a new matter" title="New matter." />

      <form onSubmit={submit} className="space-y-6">
        <Field label="Title" hint="becomes the slug">
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Khan v Acme Trading Ltd"
            className={inputCls}
          />
        </Field>

        <Field label="Matter type">
          <input
            value={form.matter_type}
            onChange={(e) => setForm({ ...form, matter_type: e.target.value })}
            className={inputCls}
          />
        </Field>

        <Field label="Cause">
          <input
            value={form.cause}
            onChange={(e) => setForm({ ...form, cause: e.target.value })}
            className={inputCls}
          />
        </Field>

        <Field label="Case theory" hint="optional">
          <textarea
            rows={4}
            value={form.case_theory}
            onChange={(e) => setForm({ ...form, case_theory: e.target.value })}
            className={inputCls + " resize-y"}
          />
        </Field>

        <Field label="Pivot fact" hint="optional">
          <input
            value={form.pivot_fact}
            onChange={(e) => setForm({ ...form, pivot_fact: e.target.value })}
            className={inputCls}
          />
        </Field>

        {error && <ErrorCallout message={error} />}

        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={submitting || !form.title}
            className="bg-ink text-paper px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating…" : "Create matter"}
          </button>
          <a
            href="/matters"
            className="text-sm text-muted hover:text-seal transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
