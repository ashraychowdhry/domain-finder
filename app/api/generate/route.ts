import { generateObject } from "ai";
import { z } from "zod";
import { checkBotId } from "botid/server";
import { logUsage, modelErrorMessage, NAMING_MODEL } from "@/lib/model";
import {
  buildFirstPrompt,
  buildRefillPrompt,
  finalScore,
  firstRoundSchema,
  refillSchema,
  vetAndCheck,
} from "@/lib/naming";
import { judgeIdeas } from "@/lib/judge";
import { screenNames } from "@/lib/screen";
import { getTldPricing } from "@/lib/pricing";
import { DEFAULT_TLDS } from "@/lib/tlds";
import type {
  GenerateEvent,
  GenerateInput,
  GenerateResponse,
  KeywordGraph,
  NameIdea,
  RankedIdea,
} from "@/lib/types";

export const maxDuration = 120;

// The generate flow is a closed loop: propose names -> vet (phonetics,
// brand safety, confusables) -> check availability -> feed taken names back
// -> propose again, until enough available ideas exist. Then one combined
// judge pass (forced ranking + collision verdicts over live signals).
const TARGET_AVAILABLE = 8;
const MAX_ROUNDS = 3;

const inputSchema = z.object({
  description: z.string().max(2000),
  keywords: z.array(z.string().max(40)).max(30).default([]),
  vibes: z.array(z.string().max(40)).max(30).default([]),
  appType: z.enum(["web", "mobile", "both"]).default("web"),
  platforms: z.array(z.enum(["ios", "android", "web"])).default([]),
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
  const input: GenerateInput = parsed.data;
  if (input.description.trim().length < 8) {
    return Response.json(
      { error: "Please describe your product in a bit more detail." },
      { status: 400 },
    );
  }
  if (!input.tlds.length) input.tlds = [...DEFAULT_TLDS];
  input.keywords = input.keywords.filter(Boolean);
  input.vibes = input.vibes.filter(Boolean);

  // NDJSON stream: once it opens, errors travel as in-stream events.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: GenerateEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runPipeline(input, send);
      } catch (err) {
        console.error("generate pipeline failed", err);
        send({
          type: "error",
          error: "Something went wrong mid-run. Please try again.",
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function runPipeline(
  input: GenerateInput,
  send: (e: GenerateEvent) => void,
) {
  // Porkbun's full-catalog call is slow — start it now, await it at the end.
  const pricingPromise = getTldPricing(input.tlds).catch(() => null);

  let graph: KeywordGraph | undefined;
  const seen = new Set<string>();
  const all: RankedIdea[] = [];
  const takenNames: string[] = [];
  let runUsd = 0;

  send({ type: "status", msg: "Mapping the concept space…" });

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const availableCount = all.filter((i) => i.bestAvailable).length;
    if (round > 0 && availableCount >= TARGET_AVAILABLE) break;

    let ideas: NameIdea[];
    try {
      if (round === 0) {
        const result = await generateObject({
          model: NAMING_MODEL,
          schema: firstRoundSchema(12, 16),
          prompt: buildFirstPrompt(input, 14),
          temperature: 0.9,
          maxOutputTokens: 6000,
        });
        runUsd += logUsage("generate:round0", result.usage);
        graph = result.object.graph;
        ideas = result.object.ideas;
        send({ type: "graph", graph });
      } else {
        // Ask only for the deficit (x2 for the expected taken rate).
        const deficit = TARGET_AVAILABLE - availableCount;
        const count = Math.max(6, Math.min(16, deficit * 2));
        send({
          type: "status",
          msg: `Round ${round + 1}: ${takenNames.length} names were taken — forging ${count} fresh ones…`,
        });
        const result = await generateObject({
          model: NAMING_MODEL,
          schema: refillSchema(Math.min(6, count), 16),
          prompt: buildRefillPrompt(
            input,
            {
              graph: graph!,
              excludeNames: [...seen],
              reason: "taken",
            },
            count,
          ),
          temperature: 0.9,
          maxOutputTokens: 5000,
        });
        runUsd += logUsage(`generate:round${round}`, result.usage);
        ideas = result.object.ideas;
      }
    } catch (err) {
      console.error(`generateObject failed (round ${round})`, err);
      if (round === 0) {
        send({ type: "error", error: modelErrorMessage(err, "Couldn't generate names") });
        return;
      }
      break; // later rounds: return what we have
    }

    send({
      type: "status",
      msg: `Vetting ${ideas.length} candidates and checking ${input.tlds.length} registries…`,
    });
    const vetted = await vetAndCheck(ideas, input, seen);
    all.push(...vetted.ranked);
    takenNames.push(...vetted.takenNames);
    if (vetted.dropped.length) {
      console.log(
        JSON.stringify({ t: "dropped", names: vetted.dropped, round }),
      );
    }

    const availableNow = all
      .filter((i) => i.bestAvailable)
      .sort((a, b) => b.score - a.score);
    send({
      type: "round",
      round,
      proposed: ideas.length,
      takenSoFar: takenNames.length,
    });
    send({ type: "ideas", ideas: availableNow });
  }

  // Present only ideas with an available domain; fall back to everything in
  // the unlikely case nothing was available after all rounds.
  const availableIdeas = all.filter((i) => i.bestAvailable);
  const field = (availableIdeas.length ? availableIdeas : all).slice(0, 16);

  if (field.length) {
    send({
      type: "status",
      msg: "Screening against the App Store, npm, PyPI & Wikipedia…",
    });
    const signals = await screenNames(field.map((i) => i.name));

    send({ type: "status", msg: "Judging the field…" });
    const verdicts = await judgeIdeas(input, field, signals);
    if (verdicts) {
      const byName = new Map(verdicts.map((v) => [v.name, v]));
      for (const idea of field) {
        const v = byName.get(idea.name);
        if (!v) continue;
        idea.judgeRank = v.rank;
        idea.critique = v.critique;
        idea.collisionRisk = v.collisionRisk;
        idea.topCollision = v.topCollision;
      }
    }
    for (const idea of field) idea.score = finalScore(idea);
    field.sort((a, b) => b.score - a.score);
  }

  const tldPricing = (await pricingPromise) ?? undefined;
  if (tldPricing && Object.keys(tldPricing).length) {
    send({ type: "pricing", tldPricing });
  }

  const response: GenerateResponse = {
    graph: graph!,
    ideas: field,
    takenNames,
    tldPricing,
  };
  send({ type: "done", response });
  console.log(JSON.stringify({ t: "run", estUsd: Number(runUsd.toFixed(5)) }));
}
