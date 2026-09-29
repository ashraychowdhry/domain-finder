// Client-side outcome telemetry — which names users actually click, star,
// and analyze is the data that tunes the naming engine over time.
// Anonymous (random browser id), fire-and-forget, never blocks UI.
//
// Two sinks: (1) Vercel Web Analytics custom events (free, no key — shows the
// funnel in the Vercel dashboard), and (2) a beacon to /api/event (structured
// logs today, PostHog if POSTHOG_KEY is ever set).

import { track } from "@vercel/analytics";

export type CaptureEvent =
  | "generate_submitted"
  | "generate_completed"
  | "refine_clicked"
  | "idea_registrar_click"
  | "idea_starred"
  | "idea_analyzed"
  | "name_checked"
  | "presence_checked"
  | "next_step_click"
  | "email_cta_click"
  | "shortlist_registrar_click"
  | "zero_results";

function sid(): string {
  try {
    let id = localStorage.getItem("nf.sid");
    if (!id) {
      id = Math.random().toString(36).slice(2, 12);
      localStorage.setItem("nf.sid", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export function capture(
  event: CaptureEvent,
  props?: Record<string, string | number | boolean>,
) {
  try {
    // Vercel Web Analytics custom event → visible in the Vercel dashboard.
    track(event, props);
  } catch {
    // analytics must never break the app
  }
  try {
    const body = JSON.stringify({ event, sid: sid(), props });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/event",
        new Blob([body], { type: "application/json" }),
      );
    } else {
      fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // never let telemetry break the app
  }
}
