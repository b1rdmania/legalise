// Editorial narrative for the "gems" section — the calls and the game-theory,
// kept here so the page reads as one coherent argument. Mirrors OPINIONATED-READ.md.

export interface Gem {
  name: string;
  site: string;
  tag: string;
  what: string;
  game: string;
}

export const GEMS: Gem[] = [
  {
    name: "DeepJudge",
    site: "https://www.deepjudge.ai/",
    tag: "The knowledge layer agents plug into",
    what: "Institutional-knowledge retrieval that Harvey, CoCounsel and MCP agents call into. Picks-and-shovels, not a wrapper. ~$52M raised, $300M valuation, real AmLaw logos.",
    game: "The moat and the kill are the same thing — its biggest partners (Harvey, Thomson Reuters) are its most obvious in-house substitutes. The day a partner decides retrieval is core, DeepJudge is a feature. Endgame is binary: acquired at a premium, or absorbed for free. White space: nobody owns the governed version — audit + privilege posture on the retrieval layer.",
  },
  {
    name: "Lawstronaut",
    site: "https://lawstronaut.com/",
    tag: "The legal-data API / MCP infra play",
    what: "The most thesis-pure thing here: a RESTful legal-data API + explicit MCP server, provenance in every response, backed by a profitable ~9-year parent (filerskeepers).",
    game: "If agents become the interface to law, someone owns the data-access layer they call — this is a bet to be it. Earliest and thinnest: all metrics self-reported. High-variance — the pick of the bunch or vapour. The call hinges on one thing: who actually builds on it.",
  },
  {
    name: "Syllo",
    site: "https://syllo.ai/",
    tag: "Agentic document review at AmLaw scale",
    what: "$30M Venrock, litigator-founded, multi-LLM agentic review proven at scale. Real supervised autonomy doing real work.",
    game: "eDiscovery is a real budget line with real pain — closer to revenue than the infra plays. The whole call hinges on one unknown: interop depth. An open agentic layer is defensible; a great closed app is exposed the moment Relativity bolts on genAI.",
  },
];

// The deeper-look set — worth a second pass; Moonlit flagged as the timely move.
export interface Watch {
  name: string;
  site: string;
  note: string;
  highlight?: boolean;
}

export const WATCH: Watch[] = [
  {
    name: "Moonlit.AI",
    site: "https://www.moonlit.ai/",
    note: "EU legal-data platform (MCP server + REST API, authoritative corpus, marquee public-sector users). Currently raising — the timely, actionable one. Get the deck, then dig the backend.",
    highlight: true,
  },
  {
    name: "Ankar",
    site: "https://ankar.ai/",
    note: "Best-evidenced of the set: well-funded, agentic, citation-accountable patent OS with real integrations and named customers.",
  },
  {
    name: "Definely",
    site: "https://www.definely.com/",
    note: "Drafting inside Word with real AmLaw logos and a $30M Series B. The question is whether the moat is data/integration or rented from the model.",
  },
];
