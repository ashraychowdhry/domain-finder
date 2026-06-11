// Instant availability check for a name the user already has — and the
// re-check behind the shortlist. Keyless (DoH + registry RDAP), no tokens.

import { z } from "zod";
import { checkBotId } from "botid/server";
import { checkDomains, toDomain } from "@/lib/availability";
import { DEFAULT_TLDS } from "@/lib/tlds";
import type { CheckResponse } from "@/lib/types";

export const maxDuration = 30;

const inputSchema = z.union([
  // Single name across TLDs (the "check a name" box).
  z.object({
    name: z.string().min(2).max(40),
    tlds: z
      .array(z.string().regex(/^[a-z]{2,12}$/i))
      .min(1)
      .max(12)
      .default([...DEFAULT_TLDS]),
  }),
  // Explicit domain list (the shortlist re-check).
  z.object({
    domains: z
      .array(z.string().regex(/^[a-z0-9-]{2,40}\.[a-z]{2,12}$/i))
      .min(1)
      .max(30),
  }),
]);

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

  const data = parsed.data;
  const domains =
    "domains" in data
      ? data.domains.map((d) => d.toLowerCase())
      : data.tlds.map((tld) => toDomain(data.name, tld));

  const results = await checkDomains(domains);
  const body: CheckResponse = { results };
  return Response.json(body);
}
