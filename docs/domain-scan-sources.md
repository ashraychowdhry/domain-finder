# Word scan — data sources, vetted

How Vocari finds *real English words that are still unregistered* under a
TLD, filtered by length, rarity, pattern and budget — and why each source was
chosen. Everything below was probed live on 2026-10-26 from one residential
IP; numbers are what we measured, not what docs claim.

The problem decomposes into four questions, each with a different best source:

| Question | Best source | Keyless? | Scale |
|---|---|---|---|
| Which strings are readable English words? | Norvig count_1w × ENABLE | yes (static files) | 38k words |
| Is `word.tld` delegated in DNS? | DNS-over-HTTPS (Cloudflare, Google) | yes | ~2,000/s |
| Is it *registered* at the registry? | Each registry's own RDAP | yes | 0.5–40/s per registry |
| What does it *cost* — and is it premium? | Porkbun list catalog + a registrar availability API | list: yes · premium: **no** | 20–1,000 names/s with a key |

Cheapest signal first: the vocabulary cuts millions of strings to tens of
thousands, DNS cuts those to hundreds, RDAP confirms the hundreds, and only
confirmed names reach a registrar's rate-limited price check.

## 1. Vocabulary — "actual English readable single words"

**Chosen:** [Norvig's `count_1w.txt`](https://norvig.com/ngrams/) (333k
tokens with counts from the Google Web Trillion Word Corpus) intersected with
the public-domain [ENABLE](https://github.com/dolph/dictionary) list (172k
Scrabble-legal words). Norvig gives *frequency*, ENABLE gives *is a word*.
Frequency is stored as a Zipf score (log10 occurrences per billion):

| Zipf | Means | Examples |
|---|---|---|
| ≥ 5 | very common | store, apple, switch |
| ≥ 4 | common | plasma, upgrade, consent |
| ≥ 3.5 | everyday | glitch, bouquet, scarce |
| ≥ 3 | known | solace, morph, nuance |
| ≥ 2.5 | rare but real | virago, chicory |

Counts, measured: ENABLE ∩ Norvig, letters only —

| Filter | Words |
|---|---|
| ≤ 5 letters, Zipf ≥ 4 | 2,419 |
| ≤ 7 letters, Zipf ≥ 3.5 | 8,156 |
| ≤ 8 letters, Zipf ≥ 3 | 16,444 |
| 3–12 letters, Zipf ≥ 2.5 (what we ship) | 36,930 |

Plus 1,270 frequent non-dictionary tokens (miami, intel, davis) flagged
`dict=0`, available via `--dict any`. Built by `scripts/build-words.mjs` into
`lib/data/words.json` (740 KB). Rejected alternatives: dwyl/english-words
(370k, full of junk), wordfreq (Python-only; Norvig covers the same need),
Google-10k (8,109 of its 9,884 entries are already in ENABLE — a subset).

## 2. DNS — is it delegated?

**Chosen:** DNS-over-HTTPS NS lookups, Cloudflare primary, Google fallback.

| Provider | Burst | Result |
|---|---|---|
| cloudflare-dns.com | 2,000 lookups, 100 concurrent | 0.72 s, 0 errors |
| dns.google | 2,000 lookups, 100 concurrent | 1.43 s, 0 errors |

Neither throttled at ~2,800 queries/s. NXDOMAIN at the TLD means "not
delegated", which is *almost* unregistered — but not quite: names registered
without nameservers (openai.ai: RDAP 200, DNS NXDOMAIN) and registry-reserved
names also NXDOMAIN. So DNS is the filter, not the verdict.

Also measured — querying the TLD's authoritative servers directly over UDP:

| TLD servers | 100 concurrent | Result |
|---|---|---|
| a.gtld-servers.net (.com/.net) | 1,000 queries | 180 ms, 0 errors |
| Google Registry (.app/.dev) | 300 queries | 1.4 s, 0 errors |
| v0n0.nic.ai (.ai) | 500 queries | 29 % timeouts (response-rate limiting) |
| a0.nic.io (.io) | 500 queries | 29 % timeouts |

Fast but fragile per TLD; DoH resolvers give the same answer with their own
caching and no RRL, so the scanner uses DoH.

**Zone files (CZDS)** were evaluated and set aside: ICANN's Centralized Zone
Data Service is free and gives the *entire* registered list for most gTLDs
(.com/.net/.org/.app/.dev/.xyz…), the ideal negative filter — but approval is
per registry and takes days to weeks, .com alone is multi-GB daily, and **ccTLDs
(.ai, .io, .co, .me, .so) are not in CZDS at all**. For a dictionary-sized
candidate set, 20k DoH lookups (~10 s) beats downloading gigabytes. Worth
revisiting only for exhaustive scans (every 4-letter string, every CVCV).

## 3. RDAP — is it registered?

**Chosen:** each registry's own RDAP endpoint (404 = unregistered, 200 =
registered), from the [IANA bootstrap](https://data.iana.org/rdap/dns.json)
plus hand-verified hosts for TLDs missing there (.io/.me/.so/.co).
The shared `rdap.org` redirector is avoided: it forwards to these same hosts
(same quota) and 404s for TLDs it can't route.

Sustained-rate probes (random names, one IP):

| Registry (TLDs) | Rate tried | Outcome | Scanner policy |
|---|---|---|---|
| Verisign (com, net) | 40 rps × 15 s | 599/600 OK | 25 rps |
| Verisign (cc) | 10 rps × 10 s | OK | 8 rps |
| PIR (org) | 15 rps × 15 s OK; 10 rps sustained | 429 after ~300 | 5 rps |
| CentralNic (xyz, fm, lol…) | 15 rps × 15 s | OK | 10 rps |
| registry.co, nic.tv | 5 rps × 10 s | OK | 4 rps |
| nic.so | 2 rps OK; 20-way burst | 503s on burst | 1.5 rps |
| Google Registry (app, dev, page…) | 1 rps × 20 s OK; 3 rps | 429 after ~15 | **1 rps** |
| Identity Digital (ai, io, me, info…) | ~300 requests in a few minutes | **429, Retry-After 85,572 s (24 h lockout)** | **0.5 rps, 120/run** |

The Identity Digital lockout is the key constraint for .ai/.io: one IP gets
a few hundred confirmations a day. The scanner therefore (a) confirms the most
common words first, (b) stops at the first long Retry-After and leaves the rest
as "likely" (DNS-only), and (c) the web UI re-verifies displayed rows live from
Vercel's IPs. Over a few nightly runs every candidate gets confirmed.

Funnel measured on 3,510 common 3–6-letter words (Zipf ≥ 4):

| TLD | DNS NXDOMAIN | RDAP-confirmed unregistered |
|---|---|---|
| .com | 6 | 0 |
| .ai | 20 | (quota) |
| .io | 80 | (quota) |
| .app | 255 | 183 |
| .xyz | 189 | 160 |

So the funnel is tiny at the expensive end: for .com and .ai essentially every
common word is gone, and the RDAP stage sees only dozens of names.

**WHOIS (port 43)** is the classic fallback but was blocked from this network
and is rate-limited harder than RDAP; not used.

## 4. Price — and the premium problem

**List price, keyless:** Porkbun's public catalog
(`POST api.porkbun.com/api/json/v3/pricing/get`, no auth, 912 TLDs, one ~80 KB
call) — already used by `lib/pricing.ts`. Multiplied by the registry's
**minimum term**: `.ai` is 2 years, so the first checkout is $165.40 at
Porkbun's $82.70/yr (wholesale rose $20 per 2-year term in March 2026). A
".ai under $100" filter is therefore empty by construction, and the UI
budget is defined as *first checkout*, not per year.

**Premium detection — the gap no keyless source fills.** The experiment above
returned home.app, car.xyz, sex.xyz, store.xyz as "unregistered": true at the
registry, but every one is a registry premium priced in the hundreds or
thousands. Legacy gTLDs (com/net/org) have no premium tier; every new gTLD and
most ccTLD registries do, and no registry publishes the list. Only a
registrar's availability API returns the real price. Vetted:

| Registrar API | Per call | Rate | Premium field | Access |
|---|---|---|---|---|
| **Spaceship** `POST /v1/domains/available` | 20 | 30 calls / 30 s | `premiumPricing[]` | free account → API Manager |
| **Name.com** `POST /core/v1/domains:checkAvailability` | 50 | 20 req/s | `premium`, `purchasePrice` | free account → API token |
| **Porkbun** `POST /domain/checkDomain` | 25 | 200 names/min; sustained scanning → 50 names / 5 min for 24 h | `premium`, `price` | free account |
| GoDaddy `/v1/domains/available` | 500 | 60/min | yes | **requires 50+ domains in account (since May 2024)** |
| Dynadot `search` | 1 (regular accounts) | 1/s | in `Price` text | 100/call only on bulk tiers |
| Domainr `/v2/status` | 1 | 10k/month (via Fastly) | `premium` status | deprecated → Fastly |
| Namecheap `domains.check` | 50 | — | `IsPremiumName` | needs $50 balance or 20 domains |

The scanner uses whichever of Spaceship / Name.com / Porkbun keys is set
(`lib/scan/pricing.ts`), on confirmed names only. Without a key the UI shows a
heuristic: ≤ 4 letters or Zipf ≥ 4.5 in a premium-capable TLD ⇒ "premium?",
hidden by default. Spaceship is the natural choice (it is Vocari's checkout
partner); Name.com is the most scalable (1,000 names/s).

## 5. Aftermarket and drops (not in scope, noted)

Expired .ai names are auctioned by the registry's partner (Namecheap, daily
since Feb 2025) after a ~90-day cycle; .io/.sh/.gg drops are caught by
park.io-style backorder services; .com/.net pending-deletes are downloadable
with free accounts at DropCatch/Dynadot. These are *registered-but-dying*
names — a different product (watchlists) that the taken-name graveyard in
`docs/data-strategy.md` already plans for. Parked/for-sale names are detected
today from marketplace nameservers in `lib/availability.ts`.

## How it runs (free)

- `npm run build:words` — rebuild the vocabulary (two static downloads).
- `npm run scan -- --tlds ai,io,app --max-len 8 --min-zipf 3.5` — DNS → RDAP →
  price → `lib/data/scan/index.json` (only survivors are stored: a few hundred
  KB for a dozen TLDs). Prints a table; `--max-cost 100` filters it.
- `.github/workflows/scan.yml` — nightly on GitHub Actions (free minutes),
  commits the index and dispatches the CI/CD deploy. Registrar keys go in repo
  secrets. Different IP from your laptop, so quotas don't collide.
- `/api/browse` filters the index in memory (no network); the Word scan section
  re-verifies visible rows through `/api/check` (DNS + RDAP, keyless).

Cost ceiling: $0. The only paid upgrade worth making is none — a free registrar
account unlocks premium verification.
