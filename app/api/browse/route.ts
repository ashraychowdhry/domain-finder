// Word scan: query the committed scan index (lib/data/scan/index.json) —
// real English words the scanner found unregistered, with first-checkout
// cost. Pure in-memory filtering, keyless, no model call; the client
// re-verifies displayed rows live through /api/check.

import { z } from "zod";
import index from "@/lib/data/scan/index.json";
import { queryIndex } from "@/lib/scan/index";
import type { BrowseResponse, ScanIndex } from "@/lib/scan/types";
import { spendGuard } from "@/lib/ratelimit";

const querySchema = z.object({
  tlds: z
    .string()
    .transform((s) => s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^[a-z]{2,12}$/)).min(1).max(12)),
  minLen: z.coerce.number().int().min(1).max(63).optional(),
  maxLen: z.coerce.number().int().min(1).max(63).optional(),
  minZipf: z.coerce.number().min(0).max(8).optional(),
  maxZipf: z.coerce.number().min(0).max(8).optional(),
  maxCost: z.coerce.number().min(0).max(1_000_000).optional(),
  pattern: z.string().max(80).optional(),
  startsWith: z.string().regex(/^[a-z]{0,20}$/).optional(),
  endsWith: z.string().regex(/^[a-z]{0,20}$/).optional(),
  dict: z.enum(["english", "any"]).optional(),
  includeLikely: z.enum(["0", "1"]).transform((v) => v === "1").optional(),
  premiumOk: z.enum(["0", "1"]).transform((v) => v === "1").optional(),
  sort: z.enum(["common", "rare", "short", "alpha", "price"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
});

export async function GET(req: Request) {
  // Cheap route, but the regex filter runs over the whole index per call.
  const limited = spendGuard(req, "browse", 600);
  if (limited) return limited;

  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: "Invalid query." }, { status: 400 });
  }
  const body: BrowseResponse = queryIndex(index as unknown as ScanIndex, parsed.data);
  return Response.json(body, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
