// TLD list prices for the form's extension picker. Served from the daily
// Porkbun cache; a cold instance may take ~20s, so the client treats this
// as async garnish.

import { getTldPricing } from "@/lib/pricing";
import { DEFAULT_TLDS } from "@/lib/tlds";

export const maxDuration = 30;

export async function GET() {
  const tldPricing = (await getTldPricing([...DEFAULT_TLDS])) ?? {};
  return Response.json(
    { tldPricing },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  );
}
