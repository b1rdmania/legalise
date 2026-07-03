/**
 * Shared display helpers for the external skill catalogue — used by the
 * Skill library shelf (ModulesCatalog) and the importer picker
 * (LawveImport) so both render the same names and groupings.
 *
 * The catalogue rows carry raw slugs like "nda-review-jamie-tso"; the
 * legible name is derived client-side (strip the author suffix, space
 * the hyphens, fix known acronyms). Grouping is keyword-derived from
 * slug + description — a reading aid, not a taxonomy of record.
 */

export interface SkillLike {
  slug: string;
  description: string;
  author_name: string | null;
}

// Acronyms restored to caps after sentence-casing.
const ACRONYMS = new Set(["NDA", "GDPR", "DPIA", "CPR", "EU", "AI", "PDF"]);

/** Slug-safe tokens of the author name (diacritics folded), so
 * "Rafał Stanisław Fryc" strips "-rafal-fryc" from a slug tail. */
function authorTokens(authorName: string | null): Set<string> {
  if (!authorName) return new Set();
  return new Set(
    authorName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // Stroked letters don't decompose under NFD (\u0142 \u219b l + mark).
      .replace(/\u0142/gi, "l")
      .replace(/\u00f8/gi, "o")
      .replace(/\u0111/gi, "d")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

/** "nda-review-jamie-tso" → "NDA review"; "docx-processing-anthropic"
 * → "Docx processing". Keeps at least one token. */
export function skillDisplayName(slug: string, authorName: string | null): string {
  const author = authorTokens(authorName);
  const tokens = slug.split("-").filter(Boolean);
  while (tokens.length > 1 && author.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  const words = tokens.map((t, i) => {
    const upper = t.toUpperCase();
    if (ACRONYMS.has(upper)) return upper;
    if (i === 0) return t.charAt(0).toUpperCase() + t.slice(1);
    return t;
  });
  return words.join(" ");
}

export type SkillCategoryId =
  | "contracts"
  | "documents"
  | "privacy"
  | "disputes"
  | "research"
  | "practice"
  | "french";

export interface SkillCategory {
  id: SkillCategoryId;
  label: string;
  /** One-line note rendered under the group header, if any. */
  note?: string;
}

/** Display order. French law is deliberately last so England & Wales
 * skills lead the page. */
export const SKILL_CATEGORIES: SkillCategory[] = [
  { id: "contracts", label: "Contracts & NDAs" },
  { id: "documents", label: "Documents & drafting" },
  { id: "privacy", label: "Privacy & data" },
  { id: "disputes", label: "Disputes & litigation" },
  { id: "research", label: "Research & analysis" },
  { id: "practice", label: "Practice & workflow" },
  {
    id: "french",
    label: "French law (FR)",
    note:
      "Legalise's workspace is England & Wales — imported skills run under the same review either way.",
  },
];

// French-language skills group together regardless of topic.
const FRENCH_SLUG = /(assignation|politique|requete|licenciement|lanceur-alerte|confidentialite|cph|refere)/;
const FRENCH_DESCRIPTION = /(guide pour|rédaction|conformes? (?:au|à)|droit du travail)/i;

// Topical rules, checked in this order (privacy and disputes before
// documents, so "Draft GDPR privacy notices as .docx" lands under
// Privacy & data rather than Documents & drafting).
const TOPIC_RULES: Array<{ id: SkillCategoryId; pattern: RegExp }> = [
  { id: "contracts", pattern: /\bnda\b|\bcontract|\bnegotiat|\bvendor|\bclause/ },
  { id: "privacy", pattern: /\bgdpr\b|\bdpia\b|\bprivacy|\bbreach|\bconfidentialite|\bcookie|data protection/ },
  { id: "disputes", pattern: /\blitigation|\bdisput|\bmotion\b|\bstatute|\bcourt\b|\brefere\b|\bassignation/ },
  { id: "documents", pattern: /\bdocx\b|\bdocument|\bdraft|\bprocessing\b|\bword\b/ },
  { id: "research", pattern: /\bresearch|\banalysis\b|\brisk\b|\bbriefing\b|review of law/ },
];

export function skillCategory(skill: SkillLike): SkillCategoryId {
  const slug = skill.slug.toLowerCase();
  const haystack = `${slug} ${skill.description}`.toLowerCase();
  if (FRENCH_SLUG.test(slug) || FRENCH_DESCRIPTION.test(skill.description)) {
    return "french";
  }
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(haystack)) return rule.id;
  }
  return "practice";
}

export interface SkillGroup<T extends SkillLike> extends SkillCategory {
  skills: T[];
}

/** Group + sort (alphabetical by display name within each group).
 * Empty groups are dropped, so filters hide a group cleanly. */
export function groupSkills<T extends SkillLike>(skills: T[]): SkillGroup<T>[] {
  const byId = new Map<SkillCategoryId, T[]>();
  for (const s of skills) {
    const id = skillCategory(s);
    const bucket = byId.get(id);
    if (bucket) bucket.push(s);
    else byId.set(id, [s]);
  }
  return SKILL_CATEGORIES.flatMap((cat) => {
    const bucket = byId.get(cat.id);
    if (!bucket || bucket.length === 0) return [];
    bucket.sort((a, b) =>
      skillDisplayName(a.slug, a.author_name).localeCompare(
        skillDisplayName(b.slug, b.author_name),
      ),
    );
    return [{ ...cat, skills: bucket }];
  });
}

/** Licence chip text — honest when the source declares none. */
export function licenceLabel(license: string | null): string {
  return license ?? "unlicensed — check source";
}
