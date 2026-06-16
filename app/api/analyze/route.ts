import { generateObject } from "ai";
import { z } from "zod";
import { checkBotId } from "botid/server";
import { spendGuard } from "@/lib/ratelimit";
import { ANALYSIS_MODEL, logUsage, modelErrorMessage } from "@/lib/model";
import { gatherCollisionSignals, type CollisionSignals } from "@/lib/collisions";
import type { AnalyzeResponse } from "@/lib/types";

export const maxDuration = 60;

const schema = z.object({
  seoScore: z
    .number()
    .min(0)
    .max(100)
    .describe("0-100. Higher = clearer field, easier to rank & differentiate."),
  verdict: z.string().describe("One punchy sentence summarizing the call."),
  collisions: z
    .array(
      z.object({
        name: z.string(),
        kind: z.enum(["company", "app", "website", "product", "other"]),
        note: z.string(),
        severity: z.enum(["low", "medium", "high"]),
      }),
    )
    .describe("Existing companies/apps/sites with the same or very similar name."),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  trademarkNote: z
    .string()
    .describe(
      "If you KNOW of a registered trademark conflict from training knowledge, name it with a confidence caveat; otherwise an empty string. This is not legal clearance.",
    ),
});

const inputSchema = z.object({
  domain: z.string().min(3).max(60),
  name: z.string().max(40).optional(),
  description: z.string().max(2000).optional(),
  appType: z.enum(["web", "mobile", "both"]).optional(),
  platforms: z.array(z.enum(["ios", "android", "web"])).optional(),
});

function buildPrompt(
  domain: string,
  name: string,
  signals: CollisionSignals,
  product?: { description?: string; appType?: string; platforms?: string[] },
) {
  const base = [
    `Assess "${name}" (domain: ${domain}) as a startup / app name from an SEO and brand-collision standpoint.`,
  ];

  if (product?.description) {
    base.push(
      "",
      `THE USER'S PRODUCT: ${product.description} (type: ${product.appType ?? "unknown"}, platforms: ${product.platforms?.join(", ") || "unspecified"})`,
      "Weight every collision by CATEGORY OVERLAP with THIS product: same-category = high severity; distant-category = low severity even for a big brand.",
    );
  }

  base.push(
    "",
    "Evaluate:",
    "- Would a search for this name surface a LARGER, established company/app/website BEFORE this new product? (bad for discoverability)",
    "- Are there big competitors or trademarks with confusingly similar names?",
    "- App-store discoverability: is the name crowded on iOS/Android?",
    "- Is the term generic (hard to rank, e.g. 'cloud') or distinctive (easy to own)?",
    "",
    "Score seoScore 0-100 where 100 = a clean, ownable field with no notable collisions.",
    "List concrete collisions with severity. Be specific and honest; do not invent companies. Only treat search results below as collisions when they are actual products/companies with this or a confusingly similar name — ignore dictionary/recipe/unrelated results.",
  );

  if (product?.platforms?.includes("android")) {
    base.push(
      "Note: app results below are iOS App Store only — flag that Google Play was not checked.",
    );
  }

  if (signals.web.length) {
    base.push(
      "",
      "LIVE WEB SEARCH RESULTS for this name (what a user googling it would see — if a big product dominates, that's a real collision):",
      ...signals.web.map(
        (h, i) => `${i + 1}. ${h.title} — ${h.link}\n   ${h.snippet}`,
      ),
    );
  } else {
    base.push(
      "",
      "(No live web SERP available — assess from your training knowledge, and flag uncertainty where relevant.)",
    );
  }

  if (signals.apps.length) {
    base.push(
      "",
      "LIVE iOS APP STORE RESULTS for this name:",
      ...signals.apps.map((a, i) => `${i + 1}. ${a.name} — by ${a.seller}`),
    );
  }

  if (signals.wiki.length) {
    base.push(
      "",
      `WIKIPEDIA ARTICLES matching the name (notability signal): ${signals.wiki.join("; ")}`,
    );
  }

  if (signals.meanings.length) {
    base.push(
      "",
      "KNOWN MEANINGS / ENTITIES for the term (DuckDuckGo Instant Answers):",
      ...signals.meanings.map((m) => `- ${m}`),
    );
  }

  const dev: string[] = [];
  if (signals.npm) dev.push("an npm package with this exact name exists");
  if (signals.pypi) dev.push("a PyPI package with this exact name exists");
  if (dev.length) {
    base.push(
      "",
      `DEVELOPER ECOSYSTEM: ${dev.join("; ")} (matters mainly for developer tools).`,
    );
  }

  return base.join("\n");
}

export async function POST(req: Request) {
  const verification = await checkBotId();
  if (verification.isBot) {
    return Response.json({ error: "Automated traffic blocked." }, { status: 403 });
  }
  const limited = spendGuard(req, "anl", 30);
  if (limited) return limited;

  let parsedBody: z.infer<typeof inputSchema>;
  try {
    parsedBody = inputSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const domain = parsedBody.domain.trim().toLowerCase();
  const name = (parsedBody.name ?? domain.split(".")[0] ?? "").trim();
  if (!domain || !name) {
    return Response.json({ error: "Missing domain." }, { status: 400 });
  }

  const signals = await gatherCollisionSignals(name);

  try {
    const result = await generateObject({
      model: ANALYSIS_MODEL,
      schema,
      prompt: buildPrompt(domain, name, signals, {
        description: parsedBody.description,
        appType: parsedBody.appType,
        platforms: parsedBody.platforms,
      }),
      temperature: 0.3,
      maxOutputTokens: 2500,
    });
    logUsage("analyze", result.usage);

    const body: AnalyzeResponse = {
      domain,
      ...result.object,
      trademarkNote: result.object.trademarkNote || undefined,
      usedLiveSearch: signals.usedLiveWeb || signals.apps.length > 0,
    };
    return Response.json(body);
  } catch (err) {
    console.error("analyze failed", err);
    return Response.json(
      { error: modelErrorMessage(err, "Analysis failed") },
      { status: 502 },
    );
  }
}
