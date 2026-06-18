import type { ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow mb-3">{children}</p>;
}

export function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="border-t border-rule py-16 md:py-20 scroll-mt-8"
    >
      <div className="mx-auto max-w-page px-6">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        {title && (
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight2 mb-6">
            {title}
          </h2>
        )}
        {children}
      </div>
    </section>
  );
}
