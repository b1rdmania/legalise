import type { ReactNode } from "react";

export function AuthCard({
  eyebrow: _eyebrow,
  heading,
  intro,
  children,
}: {
  eyebrow?: string;
  heading: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight2 text-ink mb-4 leading-[1.1]">
        {heading}
      </h1>
      {intro && <p className="prose-p mb-8">{intro}</p>}
      <div className="border border-rule p-6 sm:p-8">{children}</div>
    </div>
  );
}
