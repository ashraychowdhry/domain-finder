// Lightweight outcome telemetry: which names get clicked, starred, analyzed.
// Today it logs structured JSON (visible in `vercel logs`, free); set
// POSTHOG_KEY (+ optional POSTHOG_HOST) to forward to PostHog's free tier.
// No PII: events carry a random per-browser id, never the brief text.

import { z } from "zod";

export const maxDuration = 10;

const eventSchema = z.object({
  event: z.enum([
    "generate_submitted",
    "generate_completed",
    "refine_clicked",
    "idea_registrar_click",
    "idea_starred",
    "idea_analyzed",
    "name_checked",
    "zero_results",
  ]),
  /** Random anonymous browser id (localStorage), for session stitching. */
  sid: z.string().max(40).optional(),
  props: z
    .record(
      z.string(),
      z.union([z.string().max(120), z.number(), z.boolean()]),
    )
    .optional(),
});

export async function POST(req: Request) {
  try {
    const body = eventSchema.parse(await req.json());
    console.log(
      JSON.stringify({ t: "event", ...body, ts: new Date().toISOString() }),
    );

    const key = process.env.POSTHOG_KEY;
    if (key) {
      const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
      // Fire-and-forget; never block or fail the response on telemetry.
      fetch(`${host}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: key,
          event: body.event,
          distinct_id: body.sid ?? "anon",
          properties: body.props ?? {},
        }),
      }).catch(() => {});
    }
  } catch {
    // Telemetry must never error loudly.
  }
  return new Response(null, { status: 204 });
}
