// Central place for model selection. Uses Vercel AI Gateway with
// "provider/model" strings (auth via AI_GATEWAY_API_KEY, or OIDC on Vercel).

// Haiku 4.5 ($1/M input, $5/M output) keeps each naming round around half a
// cent and the judge pass under one. A full generate run lands at ~$0.02-0.04.
export const NAMING_MODEL = "anthropic/claude-haiku-4.5";

// Judging and collision verdicts are judgment over pasted evidence — the
// same cheap model is plenty.
export const ANALYSIS_MODEL = "anthropic/claude-haiku-4.5";

const IN_PRICE = 1e-6; // $/token, Haiku 4.5 input
const OUT_PRICE = 5e-6; // $/token, Haiku 4.5 output

/**
 * Log token usage + estimated cost for one model call as structured JSON —
 * visible in `vercel logs`, and the raw material for spend dashboards later.
 */
export function logUsage(
  label: string,
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
): number {
  const input = usage?.inputTokens ?? 0;
  const output = usage?.outputTokens ?? 0;
  const estUsd = input * IN_PRICE + output * OUT_PRICE;
  console.log(
    JSON.stringify({
      t: "usage",
      label,
      inputTokens: input,
      outputTokens: output,
      estUsd: Number(estUsd.toFixed(5)),
    }),
  );
  return estUsd;
}

/**
 * User-facing message for a failed model call. Gateway 401/403 errors carry
 * actionable instructions (missing key, OIDC, or the add-a-credit-card
 * requirement for free credits) — surface those verbatim.
 */
export function modelErrorMessage(err: unknown, prefix: string): string {
  const status = (err as { statusCode?: number } | null)?.statusCode;
  const msg = err instanceof Error ? err.message : "";
  // Exhausted prepaid balance: the gateway fails closed — nothing is ever
  // auto-charged. Tell the operator the next step is a MANUAL top-up.
  if (status === 402 || /insufficient|out of credits|credit balance|balance is too low/i.test(msg)) {
    return "AI Gateway credits are exhausted. Calls stop here — nothing is auto-charged. Top up manually in the Vercel dashboard (AI tab) to resume.";
  }
  if ((status === 401 || status === 403) && msg) {
    return `AI Gateway: ${msg}`;
  }
  if (/rate.?limit|free tier/i.test(msg)) {
    return "The AI Gateway free tier is briefly rate-limited — wait a minute and try again (or add credits for unrestricted access).";
  }
  return `${prefix} — the model call failed. Please try again.`;
}
