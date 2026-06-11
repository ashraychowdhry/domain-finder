// The naming core shared by /api/generate and /api/refine: schemas, the
// house-style prompt system, candidate vetting (phonetics / brand-safety /
// confusables), availability joining, and scoring.

import { z } from "zod";
import { checkDomains, toDomain } from "./availability";
import { phoneticReport } from "./phonetics";
import { brandSafetyFlag } from "./brandsafety";
import { confusableWith } from "./confusables";
import type {
  GenerateInput,
  KeywordGraph,
  NameIdea,
  NamingStyle,
  RankedIdea,
} from "./types";

export const NAMING_STYLES: NamingStyle[] = [
  "real-word",
  "coined",
  "compound",
  "roots",
  "misspelling",
  "metaphor",
];

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const graphSchema = z.object({
  nodes: z
    .array(
      z.object({
        term: z.string().describe("A single word or short phrase."),
        kind: z.enum(["core", "benefit", "vibe", "metaphor", "root"]),
        note: z
          .string()
          .describe(
            "Why this term matters, e.g. 'Latin for light' or 'the feeling after journaling'.",
          ),
        connects: z
          .array(z.string())
          .describe("Other terms in the graph this one relates to."),
      }),
    )
    .min(8)
    .max(16)
    .describe(
      "Keyword graph: core concepts, user benefits, vibe words, metaphors, and Latin/Greek roots to mine for names.",
    ),
});

export function ideaListSchema(min: number, max: number) {
  return z
    .array(
      z.object({
        name: z
          .string()
          .describe("Base brand name, no TLD. Lowercase a-z only, 3-12 chars."),
        preferredTld: z
          .string()
          .describe("Best TLD for this name from the allowed list."),
        backstory: z
          .string()
          .describe(
            "The clever, NON-OBVIOUS meaning connecting the name to the product — an etymology, double meaning, or hidden reference. One sentence.",
          ),
        style: z
          .enum([
            "real-word",
            "coined",
            "compound",
            "roots",
            "misspelling",
            "metaphor",
          ])
          .describe(
            "real-word = existing word repurposed; coined = invented with real-root DNA; compound = two concrete images fused; roots = Latin/Greek construction; misspelling = playful respelling; metaphor = image standing for the product's gesture.",
          ),
        sourceNodes: z
          .array(z.string())
          .min(1)
          .max(3)
          .describe("The keyword-graph terms this name draws from."),
      }),
    )
    .min(min)
    .max(max);
}

// Round 1: graph FIRST (schema order is deliberate — the graph is the
// scaffolding the names must draw from), then names.
export function firstRoundSchema(min: number, max: number) {
  return z.object({ graph: graphSchema, ideas: ideaListSchema(min, max) });
}

export function refillSchema(min: number, max: number) {
  return z.object({ ideas: ideaListSchema(min, max) });
}

// ---------------------------------------------------------------------------
// House style — the quality core
// ---------------------------------------------------------------------------

const HOUSE_STYLE = [
  "HOUSE STYLE — study these SHAPES (the names themselves are taken; learn the technique, never reuse the string):",
  "- Linear — real word repurposed as a value statement (the product makes progress feel linear).",
  "- Granola — warm real word with zero semantic link to the product; pure vibe transfer.",
  "- Arc — one-syllable metaphor for the product's core gesture.",
  "- Raycast — unexpected compound of two CONCRETE IMAGES (never two feature keywords).",
  "- Vercel — coined with Latin DNA, two syllables, ends on a liquid consonant.",
  "- Figma — playful coined diminutive grown from a real root.",
  "- Resend — verb-as-brand: what the product does, said plainly.",
  "",
  "ANTI-PATTERNS — automatic failures, do not emit:",
  "- Two brief keywords smashed together (a journaling app must NOT produce 'journalsync', 'calmnote', 'notesync').",
  "- Suffix crutches: endings in -ly, -ify, -hub, -labs, -app, -cli.",
  "- More than 3 syllables, or anything a listener couldn't spell after hearing it once.",
  "- The category as the name ('notesapp', 'tasktool').",
  "",
  "AVAILABILITY REALITY: famous real words are registered — but the answer is NOT keyword-mashing. It is: real words from UNEXPECTED semantic neighborhoods (Granola-class), coinages with real-root DNA (Vercel/Figma-class), and rare-but-real words. The graph's metaphor and root nodes are your richest ore.",
].join("\n");

/** Map vibe words to concrete phonetic guidance the model can act on. */
function vibePhonetics(vibes: string[]): string | null {
  const v = vibes.join(" ").toLowerCase();
  const lines: string[] = [];
  if (/playful|fun|quirky|whimsi|joy/.test(v))
    lines.push(
      "playful → open vowels, bouncy rhythm, -o/-a endings (duolingo, miro).",
    );
  if (/minimal|clean|technical|sharp|modern|developer/.test(v))
    lines.push(
      "minimal/technical → 1-2 syllables, crisp consonants, hard-stop or liquid endings (stripe, arc, linear).",
    );
  if (/warm|cozy|calm|gentle|soft|comfort/.test(v))
    lines.push(
      "warm/calm → soft consonants m/n/l and long vowels (lumen, haven, granola).",
    );
  if (/premium|luxur|elegant|refined|sophistic/.test(v))
    lines.push(
      "premium → Latin/French roots, elegant open endings (vercel-class).",
    );
  if (/bold|energetic|fast|punchy|power/.test(v))
    lines.push("bold/fast → plosives k/t/b, short punchy forms (kick, bolt).");
  return lines.length
    ? "PHONETIC DIRECTION (from the requested vibes):\n" +
        lines.map((l) => `- ${l}`).join("\n")
    : null;
}

function stylePrefLine(stylePrefs?: NamingStyle[]): string | null {
  if (!stylePrefs || !stylePrefs.length) return null;
  return `PREFERRED STYLES: ${stylePrefs.join(", ")} — focus most candidates on these techniques (still vary within them).`;
}

export function buildFirstPrompt(input: GenerateInput, count: number): string {
  const platforms = input.platforms.length
    ? input.platforms.join(", ")
    : "unspecified";
  return [
    "You are an elite startup naming strategist. First extract a keyword graph from the brief, then mine that graph for brandable domain names.",
    "",
    "PRODUCT DESCRIPTION:",
    input.description,
    "",
    `KEYWORDS: ${input.keywords.join(", ") || "(none)"}`,
    `VIBES / AESTHETIC: ${input.vibes.join(", ") || "(none)"}`,
    `APP TYPE: ${input.appType}`,
    `PLATFORMS: ${platforms}`,
    `ALLOWED TLDs: ${input.tlds.join(", ")}`,
    input.avoid ? `AVOID: ${input.avoid}` : "",
    "",
    "STEP 1 — KEYWORD GRAPH: extract 8-16 nodes — core concepts, concrete user benefits, vibe/aesthetic words, evocative metaphors, and Latin/Greek roots. Connect related nodes. Keep notes to a few words. Range far: adjacent imagery and etymology beat literal feature words.",
    "",
    "STEP 2 — NAMES (each must cite the graph nodes it draws from):",
    HOUSE_STYLE,
    "",
    vibePhonetics(input.vibes) ?? "",
    stylePrefLine(input.stylePrefs) ?? "",
    "- Prefer names unlikely to collide with large existing companies/apps — a name owned by a big startup buries a newcomer in search.",
    "- Vary styles across the set. Pick preferredTld from the allowed list per name.",
    "",
    `Return the graph and ${count} diverse candidates. Keep backstories to one sentence.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface RefillContext {
  graph: KeywordGraph;
  excludeNames: string[];
  /** Mine only these graph terms (interactive graph steering). */
  focusTerms?: string[];
  /** Match this idea's style and feel ("more like this"). */
  seedIdea?: { name: string; style: string; backstory: string };
  /** Why we're refilling — shapes the opening framing. */
  reason: "taken" | "steer";
}

export function buildRefillPrompt(
  input: GenerateInput,
  ctx: RefillContext,
  count: number,
): string {
  const graphLine = ctx.graph.nodes
    .map((n) => `${n.term} (${n.kind}: ${n.note})`)
    .join("; ");
  const opening =
    ctx.reason === "taken"
      ? "You are an elite startup naming strategist. Earlier candidates were taken as domains — generate NEW names more likely to be unregistered, without lowering the quality bar."
      : "You are an elite startup naming strategist generating a fresh batch of names in a specific direction the user chose.";
  return [
    opening,
    "",
    "PRODUCT DESCRIPTION:",
    input.description,
    "",
    `KEYWORD GRAPH (mine these): ${graphLine}`,
    ctx.focusTerms && ctx.focusTerms.length
      ? `MINE ONLY THESE GRAPH TERMS: ${ctx.focusTerms.join(", ")} — every name must draw from them.`
      : "",
    ctx.seedIdea
      ? `MATCH THE STYLE AND FEEL of "${ctx.seedIdea.name}" (${ctx.seedIdea.style}) — its backstory: ${ctx.seedIdea.backstory} Generate names a fan of that one would also love, without copying it.`
      : "",
    `ALLOWED TLDs: ${input.tlds.join(", ")}`,
    input.avoid ? `AVOID (user): ${input.avoid}` : "",
    ctx.excludeNames.length
      ? `ALREADY PROPOSED OR TAKEN — do NOT repeat these or near-variants: ${ctx.excludeNames.join(", ")}`
      : "",
    "",
    HOUSE_STYLE,
    "",
    vibePhonetics(input.vibes) ?? "",
    stylePrefLine(input.stylePrefs) ?? "",
    "",
    `Return ${count} new candidates. One-sentence backstories. Honest sourceNodes per name.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Vetting + availability + scoring
// ---------------------------------------------------------------------------

export const normalizeName = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9-]/g, "");

/** Penalty above which a candidate isn't worth an availability check. */
const DROP_THRESHOLD = 22;

export interface VetResult {
  ranked: RankedIdea[];
  takenNames: string[];
  dropped: string[];
}

/**
 * Vet candidates with the free screens (phonetics, brand safety, brand
 * confusables), drop hopeless ones BEFORE spending availability requests,
 * check the rest across the requested TLDs, and score deterministically.
 */
export async function vetAndCheck(
  ideas: NameIdea[],
  input: Pick<GenerateInput, "keywords" | "tlds">,
  seen: Set<string>,
): Promise<VetResult> {
  const dropped: string[] = [];
  const candidates: { idea: NameIdea; flags: string[]; penalty: number }[] =
    [];

  for (const raw of ideas) {
    const name = normalizeName(raw.name);
    if (!name || name.length < 3 || seen.has(name)) continue;
    seen.add(name);
    const idea = { ...raw, name };

    const flags: string[] = [];
    let penalty = 0;

    const phon = phoneticReport(name, input.keywords);
    flags.push(...phon.flags);
    penalty += phon.penalty;

    const unsafe = brandSafetyFlag(name);
    if (unsafe) {
      flags.push(`contains "${unsafe}" — double-check before branding`);
      penalty += 8;
    }

    const confusable = confusableWith(name);
    if (confusable && confusable.kind !== "exact") {
      flags.push(
        `1-2 edits from ${confusable.brand} (top-${confusable.rank < 1000 ? "1k" : "10k"} site)`,
      );
      penalty += confusable.rank < 1000 ? 25 : 15;
    } else if (confusable) {
      flags.push(`identical to ${confusable.brand} (major site)`);
      penalty += 40;
    }

    if (penalty >= DROP_THRESHOLD) {
      dropped.push(name);
      continue;
    }
    candidates.push({ idea, flags, penalty });
  }

  const allDomains = candidates.flatMap((c) =>
    input.tlds.map((tld) => toDomain(c.idea.name, tld)),
  );
  const results = await checkDomains(allDomains);
  const byDomain = new Map(results.map((r) => [r.domain, r]));

  const ranked: RankedIdea[] = [];
  const takenNames: string[] = [];

  for (const c of candidates) {
    const domains = input.tlds.map(
      (tld) =>
        byDomain.get(toDomain(c.idea.name, tld)) ?? {
          domain: toDomain(c.idea.name, tld),
          tld,
          status: "unknown" as const,
          source: "error" as const,
        },
    );
    const available = domains.filter((d) => d.status === "available");
    const bestAvailable =
      available.find((d) => d.tld === c.idea.preferredTld)?.domain ??
      available.find((d) => d.tld === "com")?.domain ??
      available[0]?.domain;

    const idea: RankedIdea = {
      ...c.idea,
      domains,
      bestAvailable,
      flags: c.flags,
      score: 0,
    };
    idea.score = preScore(idea, c.penalty);
    ranked.push(idea);
    if (!bestAvailable) takenNames.push(c.idea.name);
  }

  return { ranked, takenNames, dropped };
}

/** Deterministic pre-judge score: availability + brevity - warnings. */
function preScore(idea: RankedIdea, penalty: number): number {
  const hasCom = idea.domains.some(
    (d) => d.tld === "com" && d.status === "available",
  );
  const anyAvailable = idea.domains.some((d) => d.status === "available");
  const lenPenalty = Math.max(0, idea.name.length - 10) * 1.5;
  return (
    (hasCom ? 30 : 0) + (anyAvailable ? 15 : 0) + 40 - lenPenalty - penalty
  );
}

/**
 * Final score once the judge has ranked the field: the judge's forced
 * ranking dominates; availability is a tiebreaker bonus, collision risk a
 * graded penalty.
 */
export function finalScore(idea: RankedIdea): number {
  const hasCom = idea.domains.some(
    (d) => d.tld === "com" && d.status === "available",
  );
  const anyAvailable = idea.domains.some((d) => d.status === "available");
  const judge =
    idea.judgeRank !== undefined ? 100 - idea.judgeRank * 6 : idea.score;
  return (
    judge +
    (hasCom ? 8 : 0) +
    (anyAvailable ? 4 : 0) -
    (idea.collisionRisk ?? 30) * 0.2
  );
}
