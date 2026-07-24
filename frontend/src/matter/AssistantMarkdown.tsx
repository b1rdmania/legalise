import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Markdown renderer for assistant chat turns. Lazy-loaded by MessageBubble
// (default export) so react-markdown + remark-gfm stay out of the
// first-paint bundle — MatterDetail (and so MessageBubble) is statically
// routed, unlike the editor stack.
//
// Styling stays inside the paper/ink/rule/seal token system and mirrors the
// document-editor prose rules (index.css `.legalise-document-editor`):
// restrained margins, disc/decimal lists, quiet bordered tables. Sizes are
// em-relative so the compact demo bubbles inherit the caller's text size.

type MdProps<T extends keyof React.JSX.IntrinsicElements> =
  ComponentPropsWithoutRef<T>;

const components = {
  p: (props: MdProps<"p">) => <p className="mb-3 last:mb-0" {...props} />,
  ul: (props: MdProps<"ul">) => (
    <ul className="mb-3 list-disc pl-5 last:mb-0" {...props} />
  ),
  ol: (props: MdProps<"ol">) => (
    <ol className="mb-3 list-decimal pl-5 last:mb-0" {...props} />
  ),
  li: (props: MdProps<"li">) => <li className="mb-1 last:mb-0" {...props} />,
  // Claude occasionally opens with an h1/h2; in chat every heading renders
  // at one modest tier — the answer is prose, not a document.
  h1: (props: MdProps<"h1">) => (
    <p className="mb-2 mt-4 text-[1.05em] font-semibold first:mt-0" {...props} />
  ),
  h2: (props: MdProps<"h2">) => (
    <p className="mb-2 mt-4 text-[1.05em] font-semibold first:mt-0" {...props} />
  ),
  h3: (props: MdProps<"h3">) => (
    <p className="mb-2 mt-3 font-semibold first:mt-0" {...props} />
  ),
  h4: (props: MdProps<"h4">) => (
    <p className="mb-2 mt-3 font-semibold first:mt-0" {...props} />
  ),
  h5: (props: MdProps<"h5">) => (
    <p className="mb-2 mt-3 font-semibold first:mt-0" {...props} />
  ),
  h6: (props: MdProps<"h6">) => (
    <p className="mb-2 mt-3 font-semibold first:mt-0" {...props} />
  ),
  blockquote: (props: MdProps<"blockquote">) => (
    <blockquote className="mb-3 border-l-2 border-rule pl-3 text-prose" {...props} />
  ),
  a: (props: MdProps<"a">) => (
    <a
      className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  code: (props: MdProps<"code">) => (
    <code className="rounded-xs bg-wash px-1 py-0.5 text-[0.92em]" {...props} />
  ),
  pre: (props: MdProps<"pre">) => (
    <pre
      className="mb-3 overflow-x-auto rounded-item border border-rule bg-wash p-3 text-[0.92em] [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  table: (props: MdProps<"table">) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-[0.92em]" {...props} />
    </div>
  ),
  th: (props: MdProps<"th">) => (
    <th
      className="border border-rule bg-wash px-2 py-1 text-left align-top font-semibold"
      {...props}
    />
  ),
  td: (props: MdProps<"td">) => (
    <td className="border border-rule px-2 py-1 text-left align-top" {...props} />
  ),
  hr: (props: MdProps<"hr">) => <hr className="my-4 border-rule" {...props} />,
};

export default function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
