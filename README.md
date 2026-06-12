# Vocari

Describe your app idea → get clean, **available** domain names with clever
non-obvious backstories — vetted live against registries, the App Store, npm,
PyPI, Wikipedia and the open web, then force-ranked by a judge model.

Built for indie developers: every trendy single-word domain feels taken,
clean names are expensive, and a name a bigger company owns buries you in
search.

## The intelligence pipeline

1. **Brief** — free text + keywords, vibes, app type, platforms, TLD picks,
   and naming-style preferences (real word / coined / roots / …).
2. **Keyword graph** (Claude Haiku 4.5 via Vercel AI Gateway) — core
   concepts, benefits, vibes, metaphors, Latin/Greek roots, with connections.
   Shown in the UI as the product's **control surface**: tap nodes, add your
   own, and forge fresh batches from exactly those terms.
3. **House-style generation** — prompts teach naming *shapes* (Linear-class
   real-word repurposing, Vercel-class coinage) and ban the keyword-mash
   anti-patterns, with vibe→phonetics direction (warm → soft consonants…).
4. **Free vetting before any availability spend** — pure-TS screens drop or
   flag candidates: pronounceability + keyword-mash heuristics
   (`lib/phonetics.ts`), brand-confusable edit-distance vs the Tranco top-10k
   (`lib/confusables.ts` — catches "stryp" vs Stripe), multilingual embedded
   profanity (`lib/brandsafety.ts`).
5. **Closed availability loop** — DNS-over-HTTPS first, then the registry's
   own RDAP endpoint per TLD (keyless, authoritative; covers
   com/net/io/ai/me/app/dev/xyz/so/co). Parked/for-sale domains are detected
   from marketplace nameservers. Taken names feed back into refill rounds
   sized to the deficit. **Only ideas with an available domain are shown.**
6. **Collision screen + judge** — every surviving idea is screened against
   the iTunes App Store, npm, PyPI, Wikipedia (one batched call) and DDG
   entity lookups; ONE Haiku judge call then force-ranks the field (absolute
   LLM scores cluster — comparative ranking doesn't), writes a one-line
   critique per name, and scores collision risk weighted by category overlap.
7. **Streaming UX** — the whole loop narrates itself over NDJSON: graph in
   seconds, ideas appearing per round, "9 names taken — forging fresh ones…".
8. **Steering** — interactive graph + "More like this" per idea
   (`/api/refine`), instant "check a name I already have" (`/api/check`),
   localStorage shortlist with one-click re-check, shareable brief URLs,
   wordmark previews in three typefaces, registrar price compare (Porkbun
   pricing API, renewal-trap warnings).

## Cost (designed to stay near-zero)

| Action | Model calls | Typical cost |
|---|---|---|
| Generate run | 1-3 naming rounds + 1 judge | $0.015–0.03 |
| Refine click | 1-2 rounds | $0.007–0.02 |
| Deep-dive analyze | 1 | ~$0.004 |
| Check a name / re-check shortlist | 0 | $0 |

Availability, collision signals, pricing: all keyless and free. Every model
call logs `{t:"usage", label, tokens, estUsd}` — grep `vercel logs` for
real spend. Hosting: $0 on Vercel Hobby at indie traffic.

### Spend protection
- **BotID** (free) guards every paid route — scripted curl/fetch abuse fails
  the invisible challenge.
- **AI Gateway is prepaid**: with auto top-up off, the balance is a hard cap.
- Recommended (dashboard, 2 min): one free **WAF rate-limit rule** on
  `/api/*` (~15 req/min per IP, persistent block).

## Setup

```bash
npm install
vercel env pull .env.local   # gateway OIDC token for local dev
npm run dev                  # http://localhost:3000
```

| Env var | Required | Purpose |
|---|---|---|
| — (OIDC) | auto | AI Gateway auth on Vercel; locally via `vercel env pull` |
| `SERPER_API_KEY` | no | Upgrades the analyze web SERP to Google (serper.dev free tier) |
| `POSTHOG_KEY` | no | Forwards outcome telemetry to PostHog (free tier) — see `docs/data-strategy.md` |
| `NEXT_PUBLIC_AFF_SPACESHIP` | no | Impact tracking-link template with `{url}` — wraps the primary checkout link |
| `NEXT_PUBLIC_AFF_NAMECHEAP` | no | Same, for the Namecheap compare link |
| `NEXT_PUBLIC_AFF_DYNADOT` | no | Same, for the Dynadot compare link |
| `NEXT_PUBLIC_DEPLOY_AFF_URL` (+`_LABEL`) | no | Shows a "deploy it" partner link under results (e.g. Railway referral) |

Affiliate templates must be the network's wrapped tracking links (raw query
params violate program terms). Links work direct until templates are set;
commissions never change the user's price.

## Architecture

```
app/
  finder.tsx                # streaming client: timeline, graph steering, filters
  components/               # idea cards (wordmarks, risk chips), graph, shortlist, check box
  api/generate/route.ts     # NDJSON-streamed pipeline orchestrator
  api/refine/route.ts       # graph-steered / more-like-this rounds
  api/check/route.ts        # instant name×TLD check + shortlist re-check
  api/analyze/route.ts      # category-aware SEO/collision deep-dive (+ USPTO link)
  api/pricing/route.ts      # cached Porkbun TLD prices
  api/event/route.ts        # anonymous outcome telemetry (PostHog-ready)
lib/
  naming.ts                 # schemas, house-style prompts, vetting, scoring
  judge.ts                  # forced-ranking judge + collision verdicts (1 call)
  screen.ts                 # keyless batch signals: App Store, npm, PyPI, Wikipedia, DDG
  availability.ts           # DoH + per-registry RDAP + parked-NS detection + cache
  phonetics.ts              # pronounceability & keyword-mash heuristics (pure TS)
  confusables.ts            # Tranco top-10k edit-distance brand screen (pure TS)
  brandsafety.ts            # multilingual embedded-profanity flag (pure TS)
  collisions.ts / search.ts # per-name analyze signals (+ optional serper)
  pricing.ts                # Porkbun catalog, daily module cache
docs/data-strategy.md       # the proprietary-data accumulation plan
scripts/                    # data builders + unit tests (npx tsx scripts/test-*.ts)
```

## Notes

- "Available" = registerable at standard price. "Taken" domains on
  marketplace nameservers are labeled **for sale** (aftermarket premium).
- Trademark notes are model knowledge, not clearance — every analyze links
  to a prefilled USPTO search.
- The AI Gateway free tier rate-limits bursts; the UI surfaces a friendly
  retry message. Paid credits remove the limit (still ~3¢/run).
