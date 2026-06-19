// Single data source for the site: /public/data/companies.json.
// Editorial model: each company carries a tier (where it renders) and a
// first-person `my_take` (the verdict, in Andy's voice). Penalties are the
// explicit deductions (geo / stale / design). The research machinery
// (confidence, [PROVISIONAL], rubric language) stays in the data but is NOT
// surfaced — this reads as one author's take.

export interface ScoreDim {
  score: number;
  justification: string;
}
export interface Source {
  url: string;
  accessed: string;
  what_it_supports: string;
}
export interface Penalty {
  type: "geo" | "stale" | "design";
  points: number;
}
export interface Premortem {
  intro: string;
  risks: { h: string; body: string }[];
}

// Where a company renders. "hidden" = kept in the data, shown nowhere.
export type Tier =
  | "scorecard" // worth watching
  | "thesis2" // regulated AI firms
  | "whitespace" // the space worth owning
  | "eye" // liked on the floor, low score
  | "killed" // the kill-list
  | "hidden";

export interface Company {
  id: string;
  name: string;
  cat: string;
  site: string;
  logo: string;
  screenshot: string;
  tier: Tier;
  my_take: string;
  premortem?: Premortem;
  comp: number;
  conf: string;
  verdict: string;
  U: number;
  T: number;
  I: number;
  D: number;
  X: number;
  Tm: number;
  scores: Record<string, ScoreDim>;
  facts: Record<string, string | string[]>;
  red_flags: string[];
  sources: Source[];
  penalties?: Penalty[];
  geo_note?: string;
}

export async function loadCompanies(): Promise<Company[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/companies.json`);
  if (!res.ok) throw new Error(`companies.json: ${res.status}`);
  const rows = (await res.json()) as Company[];
  return rows.slice().sort((a, b) => b.comp - a.comp);
}

export const byTier = (rows: Company[], tier: Tier): Company[] =>
  rows.filter((c) => c.tier === tier);

export const PENALTY_BADGE: Record<Penalty["type"], string> = {
  geo: "🌍 geo-capped",
  stale: "⏳ stale",
  design: "🎨 design",
};

export const NICHE_LABEL: Record<string, string> = {
  "infra-platform": "Infrastructure",
  knowledge: "Knowledge / KM",
  research: "Legal research",
  "drafting-redline": "Drafting & redline",
  clm: "CLM",
  ip: "IP",
  ediscovery: "eDiscovery & litigation",
  "agentic-horizontal": "Agentic / horizontal",
  "compliance-risk": "Compliance & risk",
  "practice-mgmt": "Practice management",
  "services-consulting": "Services / firm model",
  other: "Other",
};
export const nicheLabel = (cat: string): string => NICHE_LABEL[cat] ?? cat;

// Detail-page label maps.
export const FACT_LABEL: [string, string][] = [
  ["founded", "Founded"],
  ["hq", "HQ"],
  ["total_funding", "Total funding"],
  ["last_round", "Last round"],
  ["lead_investor", "Lead investor"],
  ["headcount", "Headcount"],
  ["customers", "Customers"],
  ["integrations", "Integrations"],
  ["agentic_interop", "Agentic / interop"],
  ["tech_model", "Tech model"],
  ["pricing", "Pricing"],
  ["name_collision_check", "Name-collision check"],
];
export const DIM_LABEL: [string, string][] = [
  ["uniqueness", "Uniqueness"],
  ["thesis_fit", "Thesis-fit"],
  ["investability", "Investability"],
  ["defensibility", "Defensibility"],
  ["interoperability", "Interoperability"],
  ["team", "Team"],
];
