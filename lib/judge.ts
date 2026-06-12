// One combined judge pass over the available ideas: forced ranking (absolute
// LLM scores cluster into noise — comparative ranking doesn't), a one-line
// critique per name, and a collision-risk verdict informed by the screening
// signals. Single Haiku call for the whole field (~0.7 cents).

import { generateObject } from "ai";
import { z } from "zod";
import { ANALYSIS_MODEL, logUsage } from "./model";
import { signalSummary, type NameSignals } from "./screen";
import type { GenerateInput, RankedIdea } from "./types";

export interface JudgeVerdict {
  name: string;
  rank: number;
  critique: string;
  collisionRisk: number;
  topCollision: string | null;
}

const judgeSchema = z.object({
  verdicts: z.array(
    z.object({
      name: z.string(),
      rank: z
        .number()
        .int()
        .min(1)
        .describe("Unique forced rank, 1 = strongest name. No ties."),
      critique: z
        .string()
        .describe(
          "One blunt line: why this name works or doesn't, for the user.",
        ),
      collisionRisk: z
        .number()
        .min(0)
        .max(100)
        .describe(
          "0 = clean ownable field, 100 = a major product owns this name.",
        ),
      topCollision: z
        .string()
        .nullable()
        .describe(
          'The single worst collision, e.g. "Granola (AI meeting notes app)", or null.',
        ),
    }),
  ),
});

function buildJudgePrompt(
  input: Pick<GenerateInput, "description" | "vibes" | "appType">,
  ideas: RankedIdea[],
  signals: Map<string, NameSignals>,
): string {
  return [
    "You are a ruthless brand-name judge. Rank ALL of these available-domain candidates for the product below — forced ranking, every name gets a unique rank, no ties, 1 = the name you would actually pick.",
    "",
    "PRODUCT:",
    input.description,
    `TYPE: ${input.appType} · VIBES: ${input.vibes.join(", ") || "(none)"}`,
    "",
    "RUBRIC (weigh in this order):",
    "1. Say-it-once test: heard aloud once, can you spell it and remember it tomorrow?",
    "2. Fit: does it carry the product's feeling (vibes) without describing the category literally?",
    "3. 2026-feel: would this sit comfortably next to Linear, Vercel, Granola, Raycast — or does it smell like a 2015 name generator?",
    "4. Collision evidence below: weight collisions by CATEGORY OVERLAP with this product — a same-category app is fatal, a distant-category dictionary meaning is harmless.",
    "",
    "CANDIDATES (name — backstory — warnings — live collision evidence):",
    ...ideas.map((idea, i) => {
      const sig = signalSummary(signals.get(idea.name));
      const flags = idea.flags.length ? ` — warnings: ${idea.flags.join("; ")}` : "";
      return `${i + 1}. ${idea.name} (${idea.style}) — ${idea.backstory}${flags} — evidence: ${sig}`;
    }),
    "",
    "Be honest in critiques — users trust blunt. collisionRisk must reflect the evidence, not vibes: exact same-category App Store hit => 70+; npm/PyPI package only matters for developer tools; a Wikipedia dictionary word alone => low.",
  ].join("\n");
}

/**
 * Judge the field. Fails soft (null) — callers keep deterministic ranking.
 * `onRateLimitWait` lets the caller pause out a free-tier throttle window
 * (and narrate it) instead of silently losing critiques.
 */
export async function judgeIdeas(
  input: Pick<GenerateInput, "description" | "vibes" | "appType">,
  ideas: RankedIdea[],
  signals: Map<string, NameSignals>,
  onRateLimitWait?: () => Promise<boolean>,
): Promise<JudgeVerdict[] | null> {
  if (ideas.length < 2) return null;
  const call = () =>
    generateObject({
      model: ANALYSIS_MODEL,
      schema: judgeSchema,
      prompt: buildJudgePrompt(input, ideas, signals),
      temperature: 0.2,
      maxOutputTokens: 4000,
    });
  try {
    let result;
    try {
      result = await call();
    } catch (err) {
      const rateLimited =
        err instanceof Error && /rate.?limit|free tier/i.test(err.message);
      if (rateLimited && onRateLimitWait && (await onRateLimitWait())) {
        result = await call();
      } else {
        throw err;
      }
    }
    logUsage("judge", result.usage);
    return result.object.verdicts;
  } catch (err) {
    console.error("judge pass failed (falling back to deterministic rank)", err);
    return null;
  }
}
