// Steered regeneration: "forge from these graph nodes" and "more like this
// idea" both land here. One cheap model round + the full free vetting and
// availability pipeline. (~1 cent per click.)

import { generateObject } from "ai";
import { z } from "zod";
import { checkBotId } from "botid/server";
import { logUsage, modelErrorMessage, NAMING_MODEL } from "@/lib/model";
import {
  buildRefillPrompt,
  normalizeName,
  refillSchema,
  vetAndCheck,
} from "@/lib/naming";
import { DEFAULT_TLDS } from "@/lib/tlds";
import type { GenerateInput, RefineResponse } from "@/lib/types";

export const maxDuration = 60;

const inputSchema = z.object({
  description: z.string().max(2000),
  keywords: z.array(z.string().max(40)).max(30).default([]),
  vibes: z.array(z.string().max(40)).max(30).default([]),
  appType: z.enum(["web", "mobile", "both"]).default("web"),
  tlds: z
    .array(z.string().regex(/^[a-z]{2,12}$/i))
    .max(12)
    .default([...DEFAULT_TLDS]),
  avoid: z.string().max(500).optional(),
  stylePrefs: z
    .array(
      z.enum(["real-word", "coined", "compound", "roots", "misspelling", "metaphor"]),
    )
    .max(6)
    .optional(),
  graph: z.object({
    nodes: z
      .array(
        z.object({
          term: z.string().max(60),
          kind: z.enum(["core", "benefit", "vibe", "metaphor", "root"]),
          note: z.string().max(200),
          connects: z.array(z.string().max(60)).max(8),
        }),
      )
      .max(24),
  }),
  excludeNames: z.array(z.string().max(40)).max(300).default([]),
  focusTerms: z.array(z.string().max(60)).max(16).optional(),
  seedIdea: z
    .object({
      name: z.string().max(40),
      style: z.string().max(20),
      backstory: z.string().max(400),
    })
    .optional(),
});

export async function POST(req: Request) {
  const verification = await checkBotId();
  if (verification.isBot) {
    return Response.json({ error: "Automated traffic blocked." }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const body = parsed.data;
  if (body.description.trim().length < 8) {
    return Response.json({ error: "Missing product description." }, { status: 400 });
  }

  const input: GenerateInput = {
    description: body.description,
    keywords: body.keywords,
    vibes: body.vibes,
    appType: body.appType,
    platforms: [],
    tlds: body.tlds.length ? body.tlds : [...DEFAULT_TLDS],
    avoid: body.avoid,
    stylePrefs: body.stylePrefs,
  };

  try {
    // Seed the dedupe set with everything the client has already seen.
    const seen = new Set(body.excludeNames.map(normalizeName));
    const allRanked: Awaited<ReturnType<typeof vetAndCheck>>["ranked"] = [];
    const takenNames: string[] = [];
    const exclude = [...body.excludeNames];

    // Tight TLD picks chew through candidates — allow a second round when
    // the first yields fewer than 4 available ideas (~2 cents worst case).
    for (let round = 0; round < 2; round++) {
      const result = await generateObject({
        model: NAMING_MODEL,
        schema: refillSchema(6, 14),
        prompt: buildRefillPrompt(
          input,
          {
            graph: body.graph,
            excludeNames: exclude,
            focusTerms: body.focusTerms,
            seedIdea: body.seedIdea,
            reason: "steer",
          },
          10,
        ),
        temperature: 0.9,
        maxOutputTokens: 4500,
      });
      logUsage(`refine:round${round}`, result.usage);

      const vetted = await vetAndCheck(result.object.ideas, input, seen);
      allRanked.push(...vetted.ranked);
      takenNames.push(...vetted.takenNames);
      exclude.push(...vetted.ranked.map((i) => i.name), ...vetted.takenNames);

      if (allRanked.filter((i) => i.bestAvailable).length >= 4) break;
    }

    const available = allRanked.filter((i) => i.bestAvailable);
    const ideas = (available.length ? available : allRanked).sort(
      (a, b) => b.score - a.score,
    );

    const response: RefineResponse = { ideas, takenNames };
    return Response.json(response);
  } catch (err) {
    console.error("refine failed", err);
    return Response.json(
      { error: modelErrorMessage(err, "Couldn't refine names") },
      { status: 502 },
    );
  }
}
