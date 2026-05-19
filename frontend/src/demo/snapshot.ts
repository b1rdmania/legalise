// Hard-coded snapshot for the public read-only demo at `#/demo`.
//
// Everything MatterDetail consumes is pre-rendered here as plain JSON-shaped
// TypeScript. No backend calls. No skill/plugin substrate is surfaced — the
// solicitor sees the workspace, not the mechanism.
//
// Source material:
//   - backend/app/core/seed.py (Khan v Acme canonical content)
//   - backend/tests/test_smoke_evals.py (contract-review canned envelopes)

import type {
  AssistantMessage,
  AuditEntry,
  ChronologyResponse,
  ContractReviewResult,
  LetterCatalogue,
  LetterDraft,
  Matter,
  MatterCitationRead,
  MatterDocument,
  PreMotionRunResult,
  ReviewSummary,
} from "../lib/api";

export const DEMO_SLUG = "khan-v-acme-trading-2026";

// Stable UUID-shaped strings — the demo never persists, but components key
// off these (audit row id, document id, citation id) and React warns on dupes.
const ID = {
  matter: "11111111-1111-1111-1111-111111111111",
  user: "22222222-2222-2222-2222-222222222222",
  dismissal: "33333333-3333-3333-3333-333333333301",
  witness: "33333333-3333-3333-3333-333333333302",
  nda: "33333333-3333-3333-3333-333333333303",
  reviewCorrespondence: "44444444-4444-4444-4444-444444444401",
  reviewDisclosure: "44444444-4444-4444-4444-444444444402",
  citationBurchell: "55555555-5555-5555-5555-555555555501",
  citationIceland: "55555555-5555-5555-5555-555555555502",
  citationPolkey: "55555555-5555-5555-5555-555555555503",
};

const MATTER: Matter = {
  id: ID.matter,
  slug: DEMO_SLUG,
  title: "Khan v Acme Trading Ltd",
  matter_type: "employment_tribunal",
  cause: "s.94 ERA 1996, unfair dismissal",
  status: "open",
  case_theory:
    "Ms Khan was dismissed by Acme Trading Ltd on 12 March 2026, after three years and four months of continuous service. The stated reason was conduct — a single alleged breach of the company's social-media policy — but the dismissal followed a documented grievance Ms Khan had raised six weeks earlier concerning her line manager's pattern of conduct toward female members of the warehouse team.\n\nOur case is that the conduct reason is pretextual. The real reason for dismissal falls within s.103A ERA 1996 (protected disclosure) or, in the alternative, constitutes victimisation under s.27 Equality Act 2010. The Burchell test fails on the second and third limbs: the investigator was the manager who was the subject of Ms Khan's prior grievance, and the sanction sat outside the band of reasonable responses given a clean disciplinary record and Iceland Frozen Foods proportionality.",
  pivot_fact:
    "The social-media post the respondent treats as gross misconduct was a private comment on a personal Instagram account, set to a closed audience of 47 followers, none of whom were customers, suppliers, or named in the post.",
  privilege_posture: "B_mixed",
  default_model_id: "claude-opus-4-7",
  facts: {
    side: "claimant",
    parties: { client: "Jasmine Khan", opposing: ["Acme Trading Ltd"] },
    computed: { latest_et1: "2026-07-03" },
  },
  opened_at: "2026-04-02T09:14:22Z",
  closed_at: null,
  retention_until: "2032-04-02T00:00:00Z",
  created_by_id: ID.user,
};

const DOCUMENTS: MatterDocument[] = [
  {
    id: ID.dismissal,
    matter_id: ID.matter,
    filename: "khan-dismissal-letter.pdf",
    mime_type: "application/pdf",
    size_bytes: 412_000,
    sha256: "a31cf78d20e94b5e89f4c216de7d8f04a6c5f9b2d4310a7fbb9f4e0d2c5a83e9",
    tag: "disclosure",
    from_disclosure: true,
    uploaded_at: "2026-04-02T09:32:11Z",
    uploaded_by_id: ID.user,
  },
  {
    id: ID.witness,
    matter_id: ID.matter,
    filename: "witness-statement-khan.docx",
    mime_type:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size_bytes: 128_000,
    sha256: "b7e2d4c9183fa70d5e1b6a93f24e8b0d61eb15bd3f4ad62c8d9e10b7f3a4c512",
    tag: "draft",
    from_disclosure: false,
    uploaded_at: "2026-04-03T15:48:02Z",
    uploaded_by_id: ID.user,
  },
  {
    id: ID.nda,
    matter_id: ID.matter,
    filename: "synthetic-mutual-nda.docx",
    mime_type:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size_bytes: 41_280,
    sha256: "c9d3f1b5a8472e0c63a8b2d75ec104f9b1d2a3e6f4c8b9d0e1a2f3b4c5d6e7f8",
    tag: "contract",
    from_disclosure: false,
    uploaded_at: "2026-04-04T11:12:55Z",
    uploaded_by_id: ID.user,
  },
];

// Audit narrates the workspace: open matter → upload docs → build
// chronology → draft LBA → run pre-motion → run contract review → run
// anonymisation. NO plugin/skill detail surfaced.
const AUDIT: AuditEntry[] = [
  {
    id: "audit-01",
    timestamp: "2026-04-02T09:14:22Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "matter.create",
    module: null,
    resource_type: "matter",
    resource_id: ID.matter,
    model_used: null,
    prompt_hash: null,
    response_hash: null,
    token_count: null,
    latency_ms: 32,
    payload: {},
  },
  {
    id: "audit-02",
    timestamp: "2026-04-02T09:32:11Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "document.upload",
    module: null,
    resource_type: "document",
    resource_id: ID.dismissal,
    model_used: null,
    prompt_hash: null,
    response_hash: null,
    token_count: null,
    latency_ms: 184,
    payload: { filename: "khan-dismissal-letter.pdf" },
  },
  {
    id: "audit-03",
    timestamp: "2026-04-02T09:32:42Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "document.extract",
    module: "documents",
    resource_type: "document_body",
    resource_id: ID.dismissal,
    model_used: null,
    prompt_hash: "a1b2c3d4",
    response_hash: "f9e8d7c6",
    token_count: null,
    latency_ms: 612,
    payload: { extraction_method: "pdf-text" },
  },
  {
    id: "audit-04",
    timestamp: "2026-04-03T15:48:02Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "document.upload",
    module: null,
    resource_type: "document",
    resource_id: ID.witness,
    model_used: null,
    prompt_hash: null,
    response_hash: null,
    token_count: null,
    latency_ms: 142,
    payload: { filename: "witness-statement-khan.docx" },
  },
  {
    id: "audit-05",
    timestamp: "2026-04-04T11:12:55Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "document.upload",
    module: null,
    resource_type: "document",
    resource_id: ID.nda,
    model_used: null,
    prompt_hash: null,
    response_hash: null,
    token_count: null,
    latency_ms: 121,
    payload: { filename: "synthetic-mutual-nda.docx" },
  },
  {
    id: "audit-06",
    timestamp: "2026-04-04T13:02:09Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "chronology.build",
    module: "chronology",
    resource_type: "matter",
    resource_id: ID.matter,
    model_used: "claude-opus-4-7",
    prompt_hash: "12ad9f8b",
    response_hash: "0c4e3b71",
    token_count: 4_812,
    latency_ms: 5_104,
    payload: { events: 7 },
  },
  {
    id: "audit-07",
    timestamp: "2026-04-04T13:02:14Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "chronology.gate.confirm",
    module: "chronology",
    resource_type: "matter",
    resource_id: ID.matter,
    model_used: null,
    prompt_hash: null,
    response_hash: null,
    token_count: null,
    latency_ms: 28,
    payload: { acknowledgement: "CPR 31.22 implied undertaking" },
  },
  {
    id: "audit-08",
    timestamp: "2026-04-05T10:14:00Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "case_law.search",
    module: "research",
    resource_type: "matter",
    resource_id: ID.matter,
    model_used: "claude-opus-4-7",
    prompt_hash: "8f1c9bd2",
    response_hash: "32c7a8e1",
    token_count: 1_864,
    latency_ms: 2_983,
    payload: { query: "Burchell unfair dismissal" },
  },
  {
    id: "audit-09",
    timestamp: "2026-04-05T10:16:42Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "citation.create",
    module: "research",
    resource_type: "citation",
    resource_id: ID.citationBurchell,
    model_used: null,
    prompt_hash: null,
    response_hash: null,
    token_count: null,
    latency_ms: 41,
    payload: { case_name: "British Home Stores Ltd v Burchell" },
  },
  {
    id: "audit-10",
    timestamp: "2026-04-05T10:18:11Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "citation.create",
    module: "research",
    resource_type: "citation",
    resource_id: ID.citationIceland,
    model_used: null,
    prompt_hash: null,
    response_hash: null,
    token_count: null,
    latency_ms: 38,
    payload: { case_name: "Iceland Frozen Foods Ltd v Jones" },
  },
  {
    id: "audit-11",
    timestamp: "2026-04-05T10:18:46Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "citation.create",
    module: "research",
    resource_type: "citation",
    resource_id: ID.citationPolkey,
    model_used: null,
    prompt_hash: null,
    response_hash: null,
    token_count: null,
    latency_ms: 35,
    payload: { case_name: "Polkey v A E Dayton Services Ltd" },
  },
  {
    id: "audit-12",
    timestamp: "2026-04-05T14:33:21Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "letter.draft",
    module: "letters",
    resource_type: "letter_draft",
    resource_id: "letter-lba-01",
    model_used: "claude-opus-4-7",
    prompt_hash: "7a4f2d31",
    response_hash: "be3d2c10",
    token_count: 3_512,
    latency_ms: 7_204,
    payload: { letter_type: "lba" },
  },
  {
    id: "audit-13",
    timestamp: "2026-04-05T14:34:09Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "letter.export.docx",
    module: "letters",
    resource_type: "letter_draft",
    resource_id: "letter-lba-01",
    model_used: null,
    prompt_hash: null,
    response_hash: null,
    token_count: null,
    latency_ms: 412,
    payload: { bytes: 28_416 },
  },
  {
    id: "audit-14",
    timestamp: "2026-04-06T09:02:18Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "pre_motion.run",
    module: "pre_motion",
    resource_type: "matter",
    resource_id: ID.matter,
    model_used: "claude-opus-4-7",
    prompt_hash: "9e2a4b8c",
    response_hash: "1d3f5b7a",
    token_count: 18_402,
    latency_ms: 42_311,
    payload: { stages: 4, sub_agents: 9 },
  },
  {
    id: "audit-15",
    timestamp: "2026-04-06T09:02:24Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "pre_motion.stage.optimistic",
    module: "pre_motion",
    resource_type: "matter",
    resource_id: ID.matter,
    model_used: "claude-opus-4-7",
    prompt_hash: "ab12cd34",
    response_hash: "de56fg78",
    token_count: 2_104,
    latency_ms: 4_812,
    payload: { stage: "optimistic" },
  },
  {
    id: "audit-16",
    timestamp: "2026-04-06T09:02:41Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "pre_motion.stage.evidence",
    module: "pre_motion",
    resource_type: "matter",
    resource_id: ID.matter,
    model_used: "claude-opus-4-7",
    prompt_hash: "bc23de45",
    response_hash: "ef67gh89",
    token_count: 4_812,
    latency_ms: 11_204,
    payload: { stage: "evidence", sub_agents: 3 },
  },
  {
    id: "audit-17",
    timestamp: "2026-04-06T09:03:08Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "pre_motion.stage.premortem",
    module: "pre_motion",
    resource_type: "matter",
    resource_id: ID.matter,
    model_used: "claude-opus-4-7",
    prompt_hash: "cd34ef56",
    response_hash: "fg78hi90",
    token_count: 8_204,
    latency_ms: 18_402,
    payload: { stage: "premortem", sub_agents: 4 },
  },
  {
    id: "audit-18",
    timestamp: "2026-04-06T09:03:42Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "pre_motion.stage.synthesis",
    module: "pre_motion",
    resource_type: "matter",
    resource_id: ID.matter,
    model_used: "claude-opus-4-7",
    prompt_hash: "de45fg67",
    response_hash: "gh89ij01",
    token_count: 3_282,
    latency_ms: 7_893,
    payload: { stage: "synthesis" },
  },
  {
    id: "audit-19",
    timestamp: "2026-04-06T09:08:14Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "pre_motion.export.pdf",
    module: "pre_motion",
    resource_type: "matter",
    resource_id: ID.matter,
    model_used: null,
    prompt_hash: null,
    response_hash: null,
    token_count: null,
    latency_ms: 814,
    payload: { bytes: 184_213 },
  },
  {
    id: "audit-20",
    timestamp: "2026-04-06T10:42:18Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "contract_review.run",
    module: "contract_review",
    resource_type: "document",
    resource_id: ID.nda,
    model_used: "claude-opus-4-7",
    prompt_hash: "ef56gh78",
    response_hash: "ij01kl23",
    token_count: 12_104,
    latency_ms: 28_482,
    payload: { stages: 4, document: "synthetic-mutual-nda.docx" },
  },
  {
    id: "audit-21",
    timestamp: "2026-04-06T11:14:02Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "document.anonymise",
    module: "anonymisation",
    resource_type: "document",
    resource_id: ID.witness,
    model_used: "presidio",
    prompt_hash: null,
    response_hash: "kl23mn45",
    token_count: null,
    latency_ms: 1_204,
    payload: { engine: "presidio", entities: 8 },
  },
  {
    id: "audit-22",
    timestamp: "2026-04-06T11:18:55Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "review.create",
    module: "reviews",
    resource_type: "review",
    resource_id: ID.reviewCorrespondence,
    model_used: null,
    prompt_hash: null,
    response_hash: null,
    token_count: null,
    latency_ms: 48,
    payload: { title: "Acme correspondence — relevance" },
  },
  {
    id: "audit-23",
    timestamp: "2026-04-06T11:32:11Z",
    actor_id: ID.user,
    matter_id: ID.matter,
    action: "review.run",
    module: "reviews",
    resource_type: "review",
    resource_id: ID.reviewCorrespondence,
    model_used: "claude-opus-4-7",
    prompt_hash: "fg67hi89",
    response_hash: "mn45op67",
    token_count: 6_402,
    latency_ms: 9_812,
    payload: { cells_run: 24, cells_failed: 0 },
  },
];

const CHRONOLOGY: ChronologyResponse = {
  matter_slug: DEMO_SLUG,
  events: [
    {
      id: "ev-01",
      event_date: "2022-11-08",
      description: "Ms Khan begins continuous service at Acme Trading Ltd.",
      significance: 3,
      source_doc_ids: [],
      source_doc_filenames: [],
      priv_flag: false,
      from_disclosure: false,
      proceedings_refs: [],
      created_at: "2026-04-04T13:02:09Z",
      redacted: false,
    },
    {
      id: "ev-02",
      event_date: "2026-01-29",
      description:
        "Ms Khan raises internal grievance re: line manager's conduct toward female warehouse staff.",
      significance: 4,
      source_doc_ids: [ID.witness],
      source_doc_filenames: ["witness-statement-khan.docx"],
      priv_flag: false,
      from_disclosure: false,
      proceedings_refs: [],
      created_at: "2026-04-04T13:02:09Z",
      redacted: false,
    },
    {
      id: "ev-03",
      event_date: "2026-02-18",
      description:
        "Grievance acknowledged by HR; investigator appointed (same line manager subject of grievance).",
      significance: 3,
      source_doc_ids: [],
      source_doc_filenames: [],
      priv_flag: false,
      from_disclosure: false,
      proceedings_refs: [],
      created_at: "2026-04-04T13:02:09Z",
      redacted: false,
    },
    {
      id: "ev-04",
      event_date: "2026-03-05",
      description:
        "Personal Instagram post made (private, audience 47, no customers / suppliers named).",
      significance: 3,
      source_doc_ids: [],
      source_doc_filenames: [],
      priv_flag: false,
      from_disclosure: false,
      proceedings_refs: [],
      created_at: "2026-04-04T13:02:09Z",
      redacted: false,
    },
    {
      id: "ev-05",
      event_date: "2026-03-12",
      description: "Acme dismisses Ms Khan citing social-media policy breach. EDT.",
      significance: 5,
      source_doc_ids: [ID.dismissal],
      source_doc_filenames: ["khan-dismissal-letter.pdf"],
      priv_flag: false,
      from_disclosure: true,
      proceedings_refs: ["ET case 2406432/2026"],
      created_at: "2026-04-04T13:02:09Z",
      redacted: false,
    },
    {
      id: "ev-06",
      event_date: "2026-05-02",
      description: "ACAS Day A — EC notification submitted.",
      significance: 4,
      source_doc_ids: [],
      source_doc_filenames: [],
      priv_flag: false,
      from_disclosure: false,
      proceedings_refs: [],
      created_at: "2026-04-04T13:02:09Z",
      redacted: false,
    },
    {
      id: "ev-07",
      event_date: "2026-05-24",
      description: "ACAS Day B — EC certificate issued.",
      significance: 4,
      source_doc_ids: [],
      source_doc_filenames: [],
      priv_flag: false,
      from_disclosure: false,
      proceedings_refs: [],
      created_at: "2026-04-04T13:02:09Z",
      redacted: false,
    },
  ],
  gate: {
    required: true,
    confirmed: true,
    confirmed_at: "2026-04-04T13:02:14Z",
    tainted_event_count: 1,
  },
  statement_of_facts_variant: [
    {
      id: "ev-01",
      event_date: "2022-11-08",
      description: "Ms Khan begins continuous service at Acme Trading Ltd.",
      significance: 3,
      source_doc_ids: [],
      source_doc_filenames: [],
      priv_flag: false,
      from_disclosure: false,
      proceedings_refs: [],
      created_at: "2026-04-04T13:02:09Z",
      redacted: false,
    },
    {
      id: "ev-02",
      event_date: "2026-01-29",
      description:
        "Claimant raised an internal grievance concerning her line manager's conduct.",
      significance: 4,
      source_doc_ids: [],
      source_doc_filenames: [],
      priv_flag: false,
      from_disclosure: false,
      proceedings_refs: [],
      created_at: "2026-04-04T13:02:09Z",
      redacted: false,
    },
    {
      id: "ev-05",
      event_date: "2026-03-12",
      description: "Claimant was dismissed by the Respondent. EDT.",
      significance: 5,
      source_doc_ids: [],
      source_doc_filenames: [],
      priv_flag: false,
      from_disclosure: false,
      proceedings_refs: [],
      created_at: "2026-04-04T13:02:09Z",
      redacted: false,
    },
    {
      id: "ev-06",
      event_date: "2026-05-02",
      description: "ACAS Day A — EC notification submitted.",
      significance: 4,
      source_doc_ids: [],
      source_doc_filenames: [],
      priv_flag: false,
      from_disclosure: false,
      proceedings_refs: [],
      created_at: "2026-04-04T13:02:09Z",
      redacted: false,
    },
    {
      id: "ev-07",
      event_date: "2026-05-24",
      description: "ACAS Day B — EC certificate issued.",
      significance: 4,
      source_doc_ids: [],
      source_doc_filenames: [],
      priv_flag: false,
      from_disclosure: false,
      proceedings_refs: [],
      created_at: "2026-04-04T13:02:09Z",
      redacted: false,
    },
  ],
};

const LETTER_CATALOGUE: LetterCatalogue = {
  matter_slug: DEMO_SLUG,
  matter_type: "employment_tribunal",
  letter_types: [
    {
      id: "lba",
      label: "Letter Before Action — unfair dismissal",
      plugin: "uk-employment-legal",
      skill: "lba-drafter",
      summary:
        "ACAS Code-compliant LBA setting out the s.94 ERA claim, the protected disclosure point under s.103A, and the proposed remedy ahead of ET1.",
      is_default: true,
    },
    {
      id: "subject-access",
      label: "Subject access request — UK GDPR Art 15",
      plugin: "uk-employment-legal",
      skill: "subject-access-request",
      summary:
        "Article 15 DSAR addressed to the employer covering personnel file, grievance papers, and panel deliberation notes.",
      is_default: false,
    },
    {
      id: "without-prejudice",
      label: "Without-prejudice settlement opener",
      plugin: "uk-employment-legal",
      skill: "settlement-opener",
      summary:
        "Open negotiation framed around basic / compensatory award limits and the protected-disclosure uplift exposure.",
      is_default: false,
    },
  ],
};

const LETTER_DRAFT: LetterDraft = {
  matter_slug: DEMO_SLUG,
  letter_type: "lba",
  plugin: "uk-employment-legal",
  skill: "lba-drafter",
  draft_markdown: `# LETTER BEFORE ACTION

**Sent by:** Counsel for Ms Jasmine Khan
**To:** Acme Trading Ltd · Warehouse 4, Lockwood Industrial Estate, Bradford, BD12 9XX
**FAO:** Mr R. Holland, Operations Director
**Date:** 16 April 2026

Dear Sirs

## Re: Ms Jasmine Khan — proposed proceedings in the Employment Tribunal

We act for Ms Jasmine Khan. This letter is sent in accordance with the ACAS Code of Practice on Disciplinary and Grievance Procedures and Practice Direction 8(b) of the Tribunal Rules. It puts you on notice of intended proceedings and invites resolution before an ET1 is filed.

## The claims in outline

1. **Unfair dismissal** — s.94 Employment Rights Act 1996. Our client had three years and four months of continuous service when summarily dismissed on 12 March 2026. The conduct relied on (a private Instagram post to a closed audience of 47 followers, naming no customer, supplier or colleague) is not capable of constituting gross misconduct, and in any event the procedure adopted breaches *British Home Stores Ltd v Burchell* [1978] IRLR 379 limbs two and three. The investigator was the manager who was the subject of our client's earlier grievance — a structural failure of impartiality.

2. **Automatic unfair dismissal** — s.103A ERA 1996. The grievance of 29 January 2026 amounted to a qualifying protected disclosure under s.43B ERA. The dismissal followed within six weeks. We will say the disclosed reason was pretextual.

3. **Victimisation** — s.27 Equality Act 2010. The grievance was a protected act. The dismissal is the detriment. We invite your account of the causal connection.

## Procedural failings

- Investigator conflicted (subject of the earlier grievance).
- Disciplinary panel chaired by the same individual.
- Screenshots relied on not disclosed to the claimant in advance of the hearing.
- Sanction outside the band of reasonable responses on *Iceland Frozen Foods Ltd v Jones* [1982] IRLR 439.

## Remedy sought

Reinstatement is not viable on the facts. Our client seeks:

- Basic award per s.119 ERA on three years' service.
- Compensatory award per s.123 ERA reflecting an extended period of loss to a like-paid role.
- Uplift of up to 25% under s.207A TULR(C)A 1992 for breach of the ACAS Code.
- Aggravated damages reflecting the manner of dismissal.

We are willing to discuss commercial resolution and will treat any reasonable proposal as without prejudice save as to costs.

## Response

Please respond substantively within fourteen days of the date of this letter. In the absence of a response, ACAS Early Conciliation has already been notified (Day A: 2 May 2026) and we will be in a position to lodge ET1 after the certificate issues.

Yours faithfully

**Counsel for Ms Jasmine Khan**`,
  model_used: "claude-opus-4-7",
  token_count: 3_512,
  latency_ms: 7_204,
};

const PRE_MOTION: PreMotionRunResult = {
  matter_slug: DEMO_SLUG,
  started_at: "2026-04-06T09:02:18Z",
  completed_at: "2026-04-06T09:03:46Z",
  total_duration_ms: 42_311,
  total_token_count: 18_402,
  model_used: "claude-opus-4-7",
  stages: [
    {
      name: "optimistic",
      sub_agent_count: 1,
      duration_ms: 4_812,
      token_count: 2_104,
      errors: [],
    },
    {
      name: "evidence",
      sub_agent_count: 3,
      duration_ms: 11_204,
      token_count: 4_812,
      errors: [],
    },
    {
      name: "premortem",
      sub_agent_count: 4,
      duration_ms: 18_402,
      token_count: 8_204,
      errors: [],
    },
    {
      name: "synthesis",
      sub_agent_count: 1,
      duration_ms: 7_893,
      token_count: 3_282,
      errors: [],
    },
  ],
  optimistic: {
    key_arguments: [
      {
        argument:
          "Conduct reason is pretextual; real reason falls within s.103A ERA (protected disclosure).",
        supporting_evidence:
          "Grievance of 29 Jan precedes the dismissal by six weeks; investigator was the subject of the grievance.",
        case_law: "Royal Mail Group v Jhuti [2019] UKSC 55",
      },
      {
        argument:
          "Burchell test fails on limbs two and three — investigation not reasonable, sanction outside band.",
        supporting_evidence:
          "Single private post, closed audience, no customer/supplier referenced, clean disciplinary record.",
        case_law:
          "British Home Stores v Burchell [1978] IRLR 379; Iceland Frozen Foods v Jones [1982] IRLR 439",
      },
      {
        argument:
          "Article 8 ECHR engaged — private social-media activity within a closed audience.",
        supporting_evidence:
          "Audience of 47 personal followers, no public broadcast, post deleted within hours.",
        case_law: "Smith v Trafford Housing Trust [2012] EWHC 3221 (Ch)",
      },
    ],
    supporting_evidence: [
      {
        item: "Witness statements from two colleagues referenced in the original grievance",
        weight: "high",
        what_it_proves:
          "Establishes the protected disclosure was substantive, not opportunistic.",
      },
      {
        item: "Instagram audience settings + follower list export",
        weight: "high",
        what_it_proves:
          "Defeats the 'brought company into disrepute' framing — closed audience, no public reach.",
      },
      {
        item: "Acme Social Media Policy (October 2024) — clause 7.3",
        weight: "medium",
        what_it_proves:
          "Policy is ambiguous on personal-account out-of-hours conduct; sanction outside band.",
      },
    ],
    expected_counterarguments: [
      "Respondent will argue the grievance was unrelated and the dismissal solely concerns conduct.",
      "Respondent will rely on clause 7.3 as a clear policy breach justifying summary action.",
      "Respondent may argue the panel acted independently of the grievance investigator.",
    ],
    optimistic_outcome:
      "Tribunal finding of automatic unfair dismissal under s.103A with full compensatory award plus 25% ACAS uplift.",
  },
  evidence_flags: [
    {
      flag: "Witness statement is in draft and unsigned.",
      severity: "medium",
      category: "evidentiary",
      source_document: "witness-statement-khan.docx",
      event: "Witness preparation",
      date: "2026-04-03",
    },
    {
      flag: "No contemporaneous record of the objection to investigator appointment.",
      severity: "medium",
      category: "evidentiary",
      source_document: null,
      event: "Grievance investigation",
      date: "2026-02-19",
    },
    {
      flag: "Instagram post text recovered only via screenshot — original deleted.",
      severity: "low",
      category: "evidentiary",
      source_document: null,
      event: "Disciplinary hearing",
      date: "2026-03-10",
    },
  ],
  synthesis: {
    verdict: "steelman",
    verdict_reasoning:
      "The case is genuinely strong. Three concurrent claim routes (s.94, s.103A, s.27 EqA), a clean disciplinary record, a structurally compromised investigation, and an audience-of-47 Instagram post that cannot plausibly bear the weight of 'gross misconduct.' The pre-mortem flagged real procedural risks (ACAS Day A timing, unsigned witness statement, single-screenshot evidence) but none undermines the core narrative. Recommend filing ET1 promptly after EC certificate issues.",
    summary:
      "The conduct framing collapses on examination. Once the grievance is in evidence, the timing alone shifts the burden under Jhuti. The Burchell points are textbook. The remaining risk is procedural, not substantive — the witness statement needs to be signed and the screenshot chain documented before disclosure.",
    failure_scenarios: [
      {
        category: "procedural",
        scenario:
          "ET1 filed outside the s.207B extended limit because ACAS Day B was misread as Day A.",
        probability: "Low",
        impact: "High",
        mitigation:
          "Computed deadline (2026-07-03) locked in the matter facts; calendar reminders set ten and three working days out.",
      },
      {
        category: "substantive",
        scenario:
          "Tribunal accepts the disciplinary panel acted independently of the grievance investigator, severing the protected-disclosure link.",
        probability: "Medium",
        impact: "High",
        mitigation:
          "Disclose internal email between Caldwell and the panel chair on 11 March; cross-examine on independence.",
      },
      {
        category: "evidentiary",
        scenario:
          "Instagram audience-settings export rejected as unauthenticated.",
        probability: "Low",
        impact: "Medium",
        mitigation:
          "Obtain Meta data download with verification metadata before exchange.",
      },
      {
        category: "strategic",
        scenario:
          "Respondent settles late and high, leaving costs unrecovered because no Calderbank offer was made.",
        probability: "Medium",
        impact: "Low",
        mitigation:
          "Draft a without-prejudice opener at LBA stage so the costs trail is preserved.",
      },
    ],
    evidence_inconsistencies: [
      {
        claim: "Audience was closed and limited to 47 followers.",
        issue:
          "Witness statement draft says 'approximately 50' — tighten to the exact figure with the audience export.",
        severity: "low",
      },
      {
        claim: "Investigator was the subject of the grievance.",
        issue:
          "We need a single document fixing both facts — current evidence is split between the grievance and HR correspondence.",
        severity: "medium",
      },
    ],
    blind_spots: [
      "We do not yet have disclosure on panel-deliberation notes — a DSAR ahead of ET1 may surface adverse material we would rather know about now.",
      "No view yet on Acme's insurer position. ETOs sit with the insurer and shift settlement appetite.",
      "Polkey reduction risk — even if the dismissal is unfair, the tribunal may find the underlying conduct point would have led to a written warning, capping compensation.",
    ],
    if_we_lose_this_will_be_why:
      "The tribunal finds the disciplinary panel acted independently of the grievance investigator and treats the Instagram post as a stand-alone conduct breach, even on a closed audience, because clause 7.3 is broad enough to cover personal-device, out-of-hours posts that reference 'the company' obliquely.",
  },
};

const CONTRACT_REVIEW: ContractReviewResult = {
  matter_slug: DEMO_SLUG,
  document_id: ID.nda,
  document_filename: "synthetic-mutual-nda.docx",
  started_at: "2026-04-06T10:42:18Z",
  completed_at: "2026-04-06T10:42:46Z",
  total_duration_ms: 28_482,
  total_token_count: 12_104,
  model_used: "claude-opus-4-7",
  stages: [
    {
      name: "parser",
      status: "done",
      sub_agent_count: 1,
      duration_ms: 4_212,
      token_count: 2_802,
      errors: [],
    },
    {
      name: "analyst",
      status: "done",
      sub_agent_count: 1,
      duration_ms: 9_104,
      token_count: 4_318,
      errors: [],
    },
    {
      name: "redliner",
      status: "done",
      sub_agent_count: 1,
      duration_ms: 8_812,
      token_count: 3_204,
      errors: [],
    },
    {
      name: "summariser",
      status: "done",
      sub_agent_count: 1,
      duration_ms: 6_354,
      token_count: 1_780,
      errors: [],
    },
  ],
  parsed: {
    title: "Mutual Non-Disclosure Agreement",
    parties: ["Acme Trading Ltd", "North Mill Consulting Limited"],
    document_type: "nda",
    governing_law_stated: null,
    clauses: [
      {
        id: "c1",
        section: "1",
        title: "Purpose",
        type: "scope",
        text: "The Parties wish to exchange confidential information in connection with North Mill providing advisory services to Acme in relation to a contemplated commercial arrangement.",
        defined_terms_used: ["Purpose"],
        cross_references: [],
      },
      {
        id: "c2",
        section: "2",
        title: "Confidential Information",
        type: "definitions",
        text: "Confidential Information means any and all information disclosed by one Party to the other, whether orally, in writing, or in any other form, that is identified as confidential or that a reasonable person would understand to be confidential.",
        defined_terms_used: ["Confidential Information"],
        cross_references: [],
      },
      {
        id: "c3",
        section: "3",
        title: "Obligations",
        type: "confidentiality",
        text: "The Receiving Party shall use the Confidential Information solely for the Purpose and shall not disclose it to any third party without the prior written consent of the Disclosing Party. The Receiving Party shall take all reasonable steps to protect the Confidential Information.",
        defined_terms_used: ["Confidential Information", "Purpose"],
        cross_references: [],
      },
      {
        id: "c4",
        section: "4",
        title: "Data Protection",
        type: "data_protection",
        text: "To the extent that the exchange of Confidential Information involves personal data, each Party shall comply with applicable data protection laws and shall handle such personal data in a careful and appropriate manner.",
        defined_terms_used: ["Confidential Information"],
        cross_references: [],
      },
      {
        id: "c5",
        section: "5",
        title: "Indemnity",
        type: "indemnity",
        text: "The Receiving Party shall indemnify the Disclosing Party against all losses, damages, costs, expenses and liabilities of whatever nature arising from any breach of this Agreement by the Receiving Party, its employees, agents or sub-contractors.",
        defined_terms_used: [],
        cross_references: [],
      },
      {
        id: "c6",
        section: "6",
        title: "Term",
        type: "term",
        text: "This Agreement shall commence on the date hereof and shall continue in force for a period of three (3) years. The obligations of confidentiality shall survive termination of this Agreement and shall continue indefinitely.",
        defined_terms_used: [],
        cross_references: [],
      },
      {
        id: "c7",
        section: "8",
        title: "Notices",
        type: "boilerplate",
        text: "All notices under this Agreement shall be in writing and shall be delivered by hand or sent by first-class post to the registered office of the relevant Party.",
        defined_terms_used: [],
        cross_references: [],
      },
    ],
  },
  analyses: [
    {
      clause_id: "c3",
      risk_score: 3,
      summary:
        "Obligation is framed as 'reasonable steps' rather than the stricter 'same standard of care as own confidential information' UK NDA norm.",
      uk_issues: [
        {
          category: "other",
          statute_ref: "UK NDA market norm",
          description:
            "Standard of care wording is weaker than typical UK mutual NDAs and may not satisfy the disclosing party's audit obligations.",
          severity: "medium",
        },
      ],
      posture_note:
        "Balanced posture — tighten symmetrically; do not introduce one-way carve-outs.",
    },
    {
      clause_id: "c4",
      risk_score: 4,
      summary:
        "Data-protection clause does not address UK GDPR Article 28 processor/controller distinction or schedule the required terms (purpose, duration, sub-processing, security).",
      uk_issues: [
        {
          category: "uk_gdpr_art28",
          statute_ref: "UK GDPR Art 28",
          description:
            "If personal data is shared, an Article 28 processor agreement is required. The current wording does not constitute one.",
          severity: "high",
        },
      ],
      posture_note:
        "Either carve personal data out of the NDA entirely, or attach a compliant DPA schedule.",
    },
    {
      clause_id: "c5",
      risk_score: 4,
      summary:
        "Unlimited mutual indemnity for 'all losses, damages, costs, expenses and liabilities' is unusual in a UK mutual NDA and likely unenforceable in part under UCTA s.3.",
      uk_issues: [
        {
          category: "ucta_s2_s3",
          statute_ref: "UCTA 1977 s.3",
          description:
            "Unlimited indemnity on what is effectively a standard form may fail the reasonableness test for non-negligent breach.",
          severity: "high",
        },
        {
          category: "liability_cap",
          statute_ref: "—",
          description:
            "No liability cap; no carve-out for consequential / indirect losses; no exclusion of loss of profits.",
          severity: "high",
        },
      ],
      posture_note:
        "Replace with a clean cause-of-action remedy + injunctive relief carve-out. Indemnity is not the right tool here.",
    },
    {
      clause_id: "c7",
      risk_score: 2,
      summary:
        "No governing law or jurisdiction clause — and the notice clause is silent on email.",
      uk_issues: [
        {
          category: "governing_law",
          statute_ref: "—",
          description:
            "No governing-law clause. UK courts will apply private international law conflict rules absent express choice.",
          severity: "high",
        },
        {
          category: "jurisdiction",
          statute_ref: "—",
          description:
            "No exclusive jurisdiction clause. Both parties are England & Wales, so add E&W exclusive jurisdiction.",
          severity: "medium",
        },
      ],
      posture_note:
        "Standard boilerplate fix — add governing law (E&W), jurisdiction (exclusive E&W courts), and email notice.",
    },
  ],
  redlines: [
    {
      clause_id: "c3",
      original_text:
        "The Receiving Party shall take all reasonable steps to protect the Confidential Information.",
      suggested_text:
        "The Receiving Party shall protect the Confidential Information using the same standard of care it applies to its own confidential information of a similar nature, and in any event no less than a reasonable standard of care.",
      explanation:
        "Aligns with UK mutual NDA market practice and gives the disclosing party a quantifiable benchmark.",
      priority: "must",
    },
    {
      clause_id: "c4",
      original_text:
        "To the extent that the exchange of Confidential Information involves personal data, each Party shall comply with applicable data protection laws and shall handle such personal data in a careful and appropriate manner.",
      suggested_text:
        "The Parties do not anticipate the exchange of personal data under this Agreement. If personal data is exchanged, the Parties shall execute a UK GDPR Article 28-compliant Data Processing Addendum prior to disclosure, addressing purpose, duration, sub-processing, security, and audit.",
      explanation:
        "Either rules out personal data entirely or requires a proper Article 28 instrument — current wording is non-compliant.",
      priority: "must",
    },
    {
      clause_id: "c5",
      original_text:
        "The Receiving Party shall indemnify the Disclosing Party against all losses, damages, costs, expenses and liabilities of whatever nature arising from any breach of this Agreement.",
      suggested_text:
        "Each Party acknowledges that damages may not be an adequate remedy for breach and that the Disclosing Party shall be entitled to seek injunctive relief in addition to any other remedies available at law. Liability under this Agreement is limited to direct losses and shall not exceed £250,000 in aggregate. Nothing in this Agreement limits liability for fraud, fraudulent misrepresentation, or death or personal injury caused by negligence.",
      explanation:
        "Replaces an unlimited indemnity (likely unenforceable under UCTA s.3) with a market-standard liability cap plus injunctive relief carve-out.",
      priority: "must",
    },
    {
      clause_id: "c7",
      original_text:
        "All notices under this Agreement shall be in writing and shall be delivered by hand or sent by first-class post to the registered office of the relevant Party.",
      suggested_text:
        "This Agreement is governed by the law of England and Wales and the Parties submit to the exclusive jurisdiction of the courts of England and Wales. All notices under this Agreement shall be in writing and shall be delivered by hand, sent by first-class post, or sent by email to the address each Party notifies in writing for the purpose.",
      explanation:
        "Adds governing law + exclusive jurisdiction (currently absent) and brings notice into the modern era.",
      priority: "suggested",
    },
  ],
  summary: {
    executive_summary:
      "The draft mutual NDA is broadly serviceable but carries three must-fix points: an unlimited indemnity that is unlikely to be enforceable under UCTA, a data-protection clause that does not address UK GDPR Article 28, and a complete absence of governing-law / jurisdiction wording. The confidentiality standard of care is weaker than UK market norm and should be tightened. With those four redlines, the agreement reflects standard balanced UK mutual-NDA practice and can be signed.",
    key_terms: [
      "Mutual — both parties act as Disclosing and Receiving Party",
      "Three-year term; confidentiality obligations survive indefinitely",
      "Purpose: advisory engagement contemplated between Acme and North Mill",
      "No governing-law / jurisdiction clause",
      "Unlimited indemnity (must be replaced)",
    ],
    risk_overview:
      "Two high-risk findings (UCTA-exposed indemnity, missing UK GDPR Art 28 framing) and one medium (no governing-law / jurisdiction). Posture is balanced — fixes should apply symmetrically.",
    uk_specific_callouts: [
      "Indemnity wording exposed to UCTA s.3 reasonableness test on a standard form.",
      "Data-protection clause does not satisfy UK GDPR Art 28 — needs DPA schedule or carve-out.",
      "Add England & Wales governing law and exclusive jurisdiction.",
      "Tighten standard of care to UK NDA market language ('same standard as own').",
    ],
    recommendation:
      "Apply the four redlines (standard of care, data-protection, indemnity, governing-law) and execute. No need to renegotiate the commercial scope.",
  },
  posture: "balanced",
  contract_type: "nda",
};

const REVIEWS: ReviewSummary[] = [
  {
    id: ID.reviewCorrespondence,
    title: "Acme correspondence — relevance to dismissal",
    column_count: 4,
    row_count: 6,
    last_run_at: "2026-04-06T11:32:11Z",
    created_at: "2026-04-06T11:18:55Z",
    updated_at: "2026-04-06T11:32:11Z",
  },
  {
    id: ID.reviewDisclosure,
    title: "Disclosure list — date / from / to / privilege",
    column_count: 5,
    row_count: 12,
    last_run_at: null,
    created_at: "2026-04-06T11:42:08Z",
    updated_at: "2026-04-06T11:42:08Z",
  },
];

const CITATIONS: MatterCitationRead[] = [
  {
    id: ID.citationBurchell,
    matter_id: ID.matter,
    case_name: "British Home Stores Ltd v Burchell",
    citation_ref: "[1978] IRLR 379",
    citation_text:
      "Three-limb test for fair conduct dismissal: (1) genuine belief in misconduct; (2) reasonable grounds for that belief; (3) reasonable investigation. The investigator-conflict and absence of pre-hearing disclosure of evidence both engage limbs two and three.",
    source_url: "https://caselaw.nationalarchives.gov.uk",
    added_by_id: ID.user,
    added_at: "2026-04-05T10:16:42Z",
  },
  {
    id: ID.citationIceland,
    matter_id: ID.matter,
    case_name: "Iceland Frozen Foods Ltd v Jones",
    citation_ref: "[1982] IRLR 439",
    citation_text:
      "Band of reasonable responses — tribunal substitutes its own view for the employer's only where the sanction falls outside the band. A single private social-media post to a closed audience, against a clean record, lies outside the band.",
    source_url: "https://caselaw.nationalarchives.gov.uk",
    added_by_id: ID.user,
    added_at: "2026-04-05T10:18:11Z",
  },
  {
    id: ID.citationPolkey,
    matter_id: ID.matter,
    case_name: "Polkey v A E Dayton Services Ltd",
    citation_ref: "[1987] UKHL 8",
    citation_text:
      "Procedural unfairness alone makes the dismissal unfair; remedy is then adjusted for the chance the same outcome would have occurred on a fair procedure. Polkey reduction is the key compensation risk here.",
    source_url: "https://caselaw.nationalarchives.gov.uk",
    added_by_id: ID.user,
    added_at: "2026-04-05T10:18:46Z",
  },
];

const ASSISTANT_MESSAGES: AssistantMessage[] = [
  {
    id: "asst-msg-01",
    role: "user",
    content: "summarise the NDA",
    suggested_actions: [],
    created_at: "2026-04-06T12:01:14Z",
  },
  {
    id: "asst-msg-02",
    role: "assistant",
    content:
      `This three-year mutual NDA [doc:${ID.nda}] between Acme Trading Ltd and North Mill Consulting Limited has three issues worth flagging. Confidentiality obligations survive indefinitely. The unlimited mutual indemnity is unlikely to be enforceable under UCTA s.3. The data-protection clause does not satisfy UK GDPR Art 28. And there is no governing law or jurisdiction clause.`,
    suggested_actions: [
      {
        type: "review_contract",
        label: "Review this NDA for issues",
        params: {},
      },
    ],
    created_at: "2026-04-06T12:01:18Z",
  },
  {
    id: "asst-msg-03",
    role: "user",
    content: "what was the dismissal date?",
    suggested_actions: [],
    created_at: "2026-04-06T12:02:41Z",
  },
  {
    id: "asst-msg-04",
    role: "assistant",
    content:
      "12 March 2026. Acme dismissed Ms Khan citing a social-media policy breach — see [chron:ev-05]. That date is the EDT for limitation purposes; ACAS Day A was filed on 2 May, so the s.207B extended ET1 deadline lands on 3 July 2026.",
    suggested_actions: [
      {
        type: "view_chronology",
        label: "Open the full chronology",
        params: {},
      },
      {
        type: "run_pre_motion",
        label: "Run pre-motion on the dismissal claim",
        params: {},
      },
    ],
    created_at: "2026-04-06T12:02:46Z",
  },
];

export const DEMO_SNAPSHOT = {
  matter: MATTER,
  documents: DOCUMENTS,
  audit: AUDIT,
  chronology: CHRONOLOGY,
  letterCatalogue: LETTER_CATALOGUE,
  letterDraft: LETTER_DRAFT,
  preMotion: PRE_MOTION,
  contractReview: CONTRACT_REVIEW,
  reviews: REVIEWS,
  citations: CITATIONS,
  assistantMessages: ASSISTANT_MESSAGES,
};

export type DemoSnapshot = typeof DEMO_SNAPSHOT;
