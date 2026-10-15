// Handles + trademark screen for one name — keyless public lookups, no model
// tokens. Loaded on demand from an idea card or the "check a name" box.

import { z } from "zod";
import { checkBotId } from "botid/server";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { checkPresence, normalizeHandle } from "@/lib/presence";

export const maxDuration = 20;

const inputSchema = z.object({ name: z.string().min(2).max(40) });

export async function POST(req: Request) {
  const verification = await checkBotId();
  if (verification.isBot) {
    return Response.json({ error: "Automated traffic blocked." }, { status: 403 });
  }
  // Free to us, but each call fans out to ~8 third-party APIs with their own
  // per-IP quotas (GitHub keyless is 60/hour), so keep one visitor polite.
  if (!rateLimit(`pres:${clientIp(req)}`, 40, 10 * 60 * 1000)) {
    return Response.json(
      { error: "Too many checks. Please wait a couple of minutes." },
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(raw);
  const name = parsed.success ? normalizeHandle(parsed.data.name) : "";
  if (name.length < 2) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  return Response.json(await checkPresence(name));
}
