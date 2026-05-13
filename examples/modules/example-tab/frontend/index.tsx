import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useMatter } from "@/shared/hooks";
import { api } from "@/lib/api";

import { Hello } from "./components/Hello";

export default function ExampleTab() {
  const matter = useMatter();
  const [output, setOutput] = useState<string>("");

  const helloMutation = useMutation({
    mutationFn: () => api.post(`/api/modules/example-tab/hello`, { matter_slug: matter.slug }),
    onSuccess: (data) => setOutput(data.output),
  });

  return (
    <div className="p-6 space-y-4">
      <Hello matterTitle={matter.title} />
      <button
        onClick={() => helloMutation.mutate()}
        disabled={helloMutation.isPending}
        className="px-4 py-2 rounded bg-stone-900 text-white text-sm disabled:opacity-50"
      >
        {helloMutation.isPending ? "Calling..." : "Say hello"}
      </button>
      {output && (
        <pre className="p-4 bg-stone-100 rounded text-sm whitespace-pre-wrap">{output}</pre>
      )}
    </div>
  );
}
