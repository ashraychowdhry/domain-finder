// Client-side outcome telemetry — which names users actually click, star,
// and analyze is the data that tunes the naming engine over time.
// Anonymous (random browser id), fire-and-forget, never blocks UI.

export type CaptureEvent =
  | "generate_submitted"
  | "generate_completed"
  | "refine_clicked"
  | "idea_registrar_click"
  | "idea_starred"
  | "idea_analyzed"
  | "name_checked"
  | "next_step_click"
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
