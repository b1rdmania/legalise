/**
 * skillDisplay — shared catalogue legibility helpers.
 *
 * Display names strip the author suffix and fix known acronyms;
 * grouping is keyword-derived with French-language skills always
 * collected under the final "French law (FR)" section.
 */

import { describe, expect, it } from "vitest";

import {
  groupSkills,
  licenceLabel,
  skillCategory,
  skillDisplayName,
} from "./skillDisplay";

function skill(slug: string, description: string, author: string | null) {
  return { slug, description, author_name: author };
}

describe("skillDisplayName", () => {
  it("strips the author suffix and spaces the hyphens", () => {
    expect(skillDisplayName("nda-review-jamie-tso", "Jamie Tso")).toBe(
      "NDA review",
    );
    expect(skillDisplayName("docx-processing-anthropic", "Anthropic")).toBe(
      "Docx processing",
    );
  });

  it("strips partial author suffixes with folded diacritics", () => {
    // Author "Rafał Stanisław Fryc" → slug tail is only "-rafal-fryc".
    expect(
      skillDisplayName("statute-analysis-rafal-fryc", "Rafał Stanisław Fryc"),
    ).toBe("Statute analysis");
    expect(
      skillDisplayName("legal-risk-assessment-zacharie-laik", "Zacharie Laïk"),
    ).toBe("Legal risk assessment");
  });

  it("uppercases known acronyms anywhere in the name", () => {
    expect(
      skillDisplayName(
        "gdpr-privacy-notice-eu-oliver-schmidt-prietz",
        "Oliver Schmidt-Prietz",
      ),
    ).toBe("GDPR privacy notice EU");
    expect(
      skillDisplayName("dpia-sentinel-oliver-schmidt-prietz", "Oliver Schmidt-Prietz"),
    ).toBe("DPIA sentinel");
  });

  it("never strips the whole slug and survives a null author", () => {
    expect(skillDisplayName("anthropic", "Anthropic")).toBe("Anthropic");
    expect(skillDisplayName("contract-review", null)).toBe("Contract review");
  });
});

describe("skillCategory", () => {
  it("routes by slug + description keywords", () => {
    expect(
      skillCategory(skill("nda-review-jamie-tso", "Guide for reviewing NDAs", "Jamie Tso")),
    ).toBe("contracts");
    expect(
      skillCategory(skill("docx-processing-anthropic", "Document creation and editing", "Anthropic")),
    ).toBe("documents");
    expect(
      skillCategory(
        skill("compliance-anthropic", "Navigate privacy regulations (GDPR, CCPA)", "Anthropic"),
      ),
    ).toBe("privacy");
    expect(
      skillCategory(skill("statute-analysis-rafal-fryc", "Applying US statutes", "Rafał Fryc")),
    ).toBe("disputes");
    expect(
      skillCategory(
        skill("legal-risk-assessment-anthropic", "Assess and classify legal risks", "Anthropic"),
      ),
    ).toBe("research");
    expect(
      skillCategory(skill("skill-creator-anthropic", "Guide for creating skills", "Anthropic")),
    ).toBe("practice");
  });

  it("keeps GDPR drafting skills under privacy even when the description mentions .docx", () => {
    expect(
      skillCategory(
        skill(
          "gdpr-privacy-notice-eu-oliver-schmidt-prietz",
          "Draft GDPR-compliant privacy notices as .docx for any EU/EEA jurisdiction",
          "Oliver Schmidt-Prietz",
        ),
      ),
    ).toBe("privacy");
  });

  it("collects French-language skills regardless of topic", () => {
    expect(
      skillCategory(
        skill(
          "politique-confidentialite-malik-taiar",
          "Guide pour la rédaction de politiques de confidentialité",
          "Malik Taiar",
        ),
      ),
    ).toBe("french");
    expect(
      skillCategory(
        skill(
          "notification-licenciement-selim-brihi",
          "Guide pour la rédaction de notifications de licenciement",
          "Sélim Brihi",
        ),
      ),
    ).toBe("french");
  });
});

describe("groupSkills", () => {
  it("orders groups with French law last, drops empty groups, sorts by display name", () => {
    const groups = groupSkills([
      skill("politique-cookies-malik-taiar", "Guide pour la rédaction de politiques cookies", "Malik Taiar"),
      skill("vendor-due-diligence-patrick-munro", "Framework for assessing IT vendors", "Patrick Munro"),
      skill("nda-triage-anthropic", "Screen incoming NDAs", "Anthropic"),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["contracts", "french"]);
    expect(groups[0].skills.map((s) => s.slug)).toEqual([
      "nda-triage-anthropic",
      "vendor-due-diligence-patrick-munro",
    ]);
    // The French section carries the England & Wales note.
    expect(groups[1].note).toMatch(/England & Wales/);
  });
});

describe("licenceLabel", () => {
  it("is honest about missing licences", () => {
    expect(licenceLabel("Apache-2.0")).toBe("Apache-2.0");
    expect(licenceLabel(null)).toBe("unlicensed — check source");
  });
});
