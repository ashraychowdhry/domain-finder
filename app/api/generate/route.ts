import { generateObject } from "ai";
import { z } from "zod";
import { checkBotId } from "botid/server";
import { spendGuard } from "@/lib/ratelimit";
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

export const maxDuration = 300;

const isRateLimit = (e: unknown) =>
  e instanceof Error && /rate.?limit|free tier/i.test(e.message);

/**
 * The gateway FREE TIER throttles sequential calls within one run. Quality
 * beats latency here: announce the pause, wait out the window, retry —
 * a slow complete run over a fast degraded one. (Paid credits remove the
 * limit entirely and these waits never trigger.)
 */
async function withRateLimitBackoff<T>(
  fn: () => Promise<T>,
  send: (e: GenerateEvent) => void,
  waits: { used: number },
): Promise<T> {
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      if (!isRateLimit(e) || waits.used >= 3) throw e;
      waits.used++;
      send({
        type: "status",
        msg: "Free-tier rate limit — pausing ~1 min so quality doesn't suffer…",
      });
      await new Promise((r) => setTimeout(r, 65_000));
    }
  }
}

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

// Identical briefs (double-submits, shared-URL re-runs) replay the finished
// run instead of paying for new model calls. Availability ages with the
// cache, so the TTL stays short and the replay says so.
const runCache = new Map<string, { at: number; response: GenerateResponse }>();
const RUN_CACHE_TTL = 60 * 60 * 1000;
const RUN_CACHE_MAX = 200;

export async function POST(req: Request) {
  const verification = await checkBotId();
  if (verification.isBot) {
    return Response.json({ error: "Automated traffic blocked." }, { status: 403 });
  }
  // ~20 generate runs / 10 min / IP: way above any real session, blocks spam.
  const limited = spendGuard(req, "gen", 20);
  if (limited) return limited;

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

  const cacheKey = JSON.stringify(input);
  const cached = runCache.get(cacheKey);

  // NDJSON stream: once it opens, errors travel as in-stream events.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: GenerateEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        if (cached && Date.now() - cached.at < RUN_CACHE_TTL) {
          const mins = Math.max(1, Math.round((Date.now() - cached.at) / 60000));
          send({
            type: "status",
            msg: `Same brief ran ${mins}m ago — replaying that run (availability as of then).`,
          });
          send({ type: "graph", graph: cached.response.graph });
          if (cached.response.tldPricing) {
            send({ type: "pricing", tldPricing: cached.response.tldPricing });
          }
          send({ type: "ideas", ideas: cached.response.ideas });
          send({ type: "done", response: cached.response });
          return;
        }
        const response = await runPipeline(input, send);
        if (response) {
          if (runCache.size >= RUN_CACHE_MAX) runCache.clear();
          runCache.set(cacheKey, { at: Date.now(), response });
        }
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
): Promise<GenerateResponse | null> {
  // Porkbun's full-catalog call is slow — start it now, await it at the end.
  const pricingPromise = getTldPricing(input.tlds).catch(() => null);

  let graph: KeywordGraph | undefined;
  const seen = new Set<string>();
  const all: RankedIdea[] = [];
  const takenNames: string[] = [];
  let runUsd = 0;
  const waits = { used: 0 };

  send({ type: "status", msg: "Mapping the concept space…" });

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const availableCount = all.filter((i) => i.bestAvailable).length;
    if (round > 0 && availableCount >= TARGET_AVAILABLE) break;

    let ideas: NameIdea[];
    try {
      if (round === 0) {
        const result = await withRateLimitBackoff(
          () =>
            generateObject({
              model: NAMING_MODEL,
              schema: firstRoundSchema(12, 16),
              prompt: buildFirstPrompt(input, 14),
              temperature: 0.9,
              maxOutputTokens: 6000,
              maxRetries: 1, // our backoff outlasts the throttle window
            }),
          send,
          waits,
        );
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
        const result = await withRateLimitBackoff(
          () =>
            generateObject({
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
              maxRetries: 1,
            }),
          send,
          waits,
        );
        runUsd += logUsage(`generate:round${round}`, result.usage);
        ideas = result.object.ideas;
      }
    } catch (err) {
      console.error(`generateObject failed (round ${round})`, err);
      if (round === 0) {
        send({ type: "error", error: modelErrorMessage(err, "Couldn't generate names") });
        return null;
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
    const verdicts = await judgeIdeas(input, field, signals, async () => {
      if (waits.used >= 2) return false;
      waits.used++;
      send({
        type: "status",
        msg: "Free-tier rate limit — pausing ~35s so quality doesn't suffer…",
      });
      await new Promise((r) => setTimeout(r, 35_000));
      return true;
    });
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
  return response;
}
