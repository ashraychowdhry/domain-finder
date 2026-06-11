# NameForge data strategy — building proprietary value over time

The naming engine is stateless today: every run rediscovers the world from
scratch. The durable moat is the **data exhaust** each run produces — what was
generated, what was actually available, and what users actually wanted. This
document is the plan for capturing it cheaply (free tiers only) and turning
it into compounding product advantages no prompt tweak can replicate.

## What to collect (in priority order)

### 1. Outcome telemetry — which names win with humans *(shipping now)*
Events already emitted by the client to `/api/event` (anonymous browser id,
no PII, no brief text):

| Event | Props | What it teaches |
|---|---|---|
| `generate_submitted` | tld mix, style prefs | demand shape |
| `generate_completed` | idea count | funnel health |
| `idea_registrar_click` | style, rank, domain | **the conversion event** — which styles/lengths users buy |
| `idea_starred` | style | shortlist taste |
| `idea_analyzed` | style | which names create doubt |
| `refine_clicked` | mode (steer/similar) | how users steer |
| `name_checked` | length | check-first user share |
| `zero_results` | — | failure modes |

Today these land in runtime logs (1h retention — enough for live debugging).
**Action: create a free PostHog project (1M events/month) and set
`POSTHOG_KEY` in Vercel env — the forwarding code is already live.** Weekly
review: if `real-word` names get 3× the registrar clicks of `coined`,
reweight the house-style exemplars with evidence instead of taste.

### 2. The taken-name graveyard — availability priors
Every run discovers 10–40 (name, tld, status, parked?) facts. Persisted, this
becomes:
- **Prompt priors**: "names shaped like X are always taken" → fewer wasted
  rounds → lower cost AND better first-round hit rate. Eventually a static
  `likely-taken patterns` block compiled from thousands of real checks.
- **A churn time-series**: the same name re-checked weeks apart reveals
  drops/expiries — the raw material for a future "watch this name" feature
  (the obvious premium tier).

Storage: **Upstash Redis via Vercel Marketplace (free tier: 10K commands/day)**
— one `HSET name:tld → {status, parked, ts}` per check is well within it. At
~50 facts/run, free tier supports ~200 runs/day.

### 3. Collision-signal cache — speed + a proprietary collision index
`screenNames` results (App Store hits, npm/PyPI existence, Wikipedia,
entity meanings) are stable for weeks. Caching them in the same Redis:
- repeat lookups become instant and free,
- over time this becomes a **proprietary name→collision index** that no
  keyless competitor has, queryable before the model ever runs.

### 4. Industry → morpheme maps (the keyword-graph corpus)
Each run produces a keyword graph keyed by product category. Aggregated
(store graphs with an appType/category tag, no user text), these become
per-industry morpheme libraries — "fintech briefs respond to Latin roots of
*trust/ledger*" — that seed STEP 1 with priors instead of a cold start.
This is the dataset a future fine-tune or few-shot library is built from.

## Privacy stance (do not deviate)
- Anonymous random browser id only; never store the description text with
  telemetry. Graphs stored for corpus building must drop the raw brief.
- No accounts, no emails, no IP storage. A one-line privacy note in the
  footer when PostHog is enabled.

## Rollout
1. **Now**: telemetry events live (console + optional PostHog). ✅
2. **Next session** (~1h): provision Upstash Redis through the Vercel
   Marketplace, add a `lib/store.ts` with fire-and-forget `recordAvailability`
   + `cacheSignals`, call from `vetAndCheck`/`screenNames`. Zero latency
   impact (writes after response).
3. **At ~500 runs of data**: compile the first taken-pattern prior block and
   per-category morpheme seeds; A/B via the style-pref prompt line.
4. **At meaningful traffic**: drop-watch alerts (Vercel cron + Redis
   time-series + email via Resend free tier) as the first paid feature.

## Cost ceiling
PostHog free (1M events/mo), Upstash free (10K cmd/day), Vercel cron free
(2 jobs on Hobby). The entire data layer stays $0 until ~200 runs/day —
at which point the product has earned a paid tier.
