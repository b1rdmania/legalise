import { Footer } from "../ui/Footer";

const TENETS = [
  {
    title: "The matter is the unit of work",
    body: "Documents, skills, model calls, outputs, signatures, and records all sit inside a matter. The AI does not float outside the file.",
  },
  {
    title: "The solicitor stays accountable",
    body: "AI prepares work. A human reviews it, changes it where needed, and signs what they are prepared to stand behind.",
  },
  {
    title: "Skills are controlled work units",
    body: "A skill declares what it reads and what it writes. Legalise checks that before it runs, then records what happened.",
  },
  {
    title: "The record is the receipt",
    body: "The audit trail is not the product. It is the evidence. It answers what the system saw, what it produced, and who took responsibility.",
  },
  {
    title: "Sources must stay visible",
    body: "Outputs should point back to the documents they used. A citation is not a guarantee, but it gives the reviewer somewhere concrete to check.",
  },
  {
    title: "Providers are replaceable",
    body: "Claude is the MVP target because the skill format works well there. The architecture is built so a firm can later run GPT, local models, or its own approved stack.",
  },
];

const STACK = [
  "Matter workspace",
  "Document store and reader",
  "Skill install and permission checks",
  "Model gateway",
  "Professional sign-off",
  "Audit record and working pack export",
];

export function Manifesto() {
  return (
    <div className="max-w-page mx-auto">
      <section className="px-4 sm:px-6 md:px-16 lg:px-24 py-20 border-b border-rule">
        <div className="max-w-4xl">
          <div className="eyebrow text-muted mb-6">Manifesto</div>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight2 text-ink leading-[1.04] max-w-4xl">
            Legalise is backend infrastructure for regulated AI legal work.
          </h1>
          <p className="mt-8 text-xl md:text-2xl leading-relaxed text-prose max-w-3xl">
            We are building the rails for an SRA-regulated, insurable law firm
            to use AI without losing control of the matter, the documents, or
            the professional record.
          </p>
        </div>
      </section>

      <main className="px-4 sm:px-6 md:px-16 lg:px-24 py-16">
        <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight2 text-ink">
              What we are actually building
            </h2>
            <div className="mt-6 space-y-5 text-base leading-relaxed text-prose">
              <p>
                Not a chatbot for legal questions. Not a replacement lawyer.
                Not a black box that drafts documents and hopes someone checks
                them.
              </p>
              <p>
                Legalise is a matter workspace where a solicitor can open a
                project, add documents, run legal skills, review the output,
                sign what they accept, and export the working record.
              </p>
              <p>
                AI does not do legal work by itself. It prepares more of the
                work, faster, while the solicitor keeps judgement,
                responsibility, and a record that can be inspected later.
              </p>
            </div>
          </div>

          <aside className="border border-rule bg-paper-sunken p-5 h-fit">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              The product loop
            </p>
            <ol className="mt-4 space-y-3 text-sm text-ink">
              {["Open project", "Install skill", "Run against documents", "Review output", "Sign", "Export record"].map(
                (item, idx) => (
                  <li key={item} className="flex gap-3">
                    <span className="tech-token text-muted">{idx + 1}</span>
                    <span>{item}</span>
                  </li>
                ),
              )}
            </ol>
          </aside>
        </section>

        <section className="mt-20 border-t border-rule pt-14">
          <div className="max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight2 text-ink">
              Why this exists
            </h2>
            <p className="mt-5 text-base leading-relaxed text-prose">
              A regulated firm cannot just “use AI” and hope the supervision
              story works out afterwards. It needs a system that knows which
              matter the work belongs to, which documents were used, which
              model ran, what was produced, who reviewed it, and what became
              part of the final file.
            </p>
            <p className="mt-5 text-base leading-relaxed text-prose">
              That is what makes AI work insurable and defensible to a
              regulator. Not magic prompts. Not a prettier chat window. A
              controlled backend with a clean surface on top.
            </p>
          </div>
        </section>

        <section className="mt-20">
          <div className="mb-8 max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Tenets
            </p>
            <h2 className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight2 text-ink">
              The rules we build against
            </h2>
          </div>
          <div className="grid gap-px border border-rule bg-rule md:grid-cols-2">
            {TENETS.map((tenet) => (
              <section key={tenet.title} className="bg-paper p-5">
                <h3 className="text-base font-semibold text-ink">
                  {tenet.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-prose">
                  {tenet.body}
                </p>
              </section>
            ))}
          </div>
        </section>

        <section className="mt-20 grid gap-10 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              What is in the stack
            </p>
            <h2 className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight2 text-ink">
              Boring infrastructure, legal shape.
            </h2>
          </div>
          <div className="grid gap-px border border-rule bg-rule sm:grid-cols-2">
            {STACK.map((item) => (
              <div key={item} className="bg-paper p-4 text-sm font-medium text-ink">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20 border border-rule bg-paper-sunken p-6">
          <div className="max-w-3xl">
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight2 text-ink">
              What this is not
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-prose">
              The hosted demo is not a law firm and does not give legal advice.
              It is a working product demonstration. The ambition is bigger:
              infrastructure a real regulated firm could deploy, inspect,
              insure, and explain.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
