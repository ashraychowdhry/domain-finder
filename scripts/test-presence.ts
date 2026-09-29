/**
 * Test suite for lib/presence.ts — handle/trademark parsing with a fake
 * fetcher (no network).
 *
 * Run: npx tsx scripts/test-presence.ts
 */

import {
  checkHandles,
  checkTrademark,
  normalizeHandle,
  parseMarker,
  type Fetcher,
} from "../lib/presence";

let passed = 0;
let failed = 0;

function check(label: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    passed++;
    console.log(`ok   ${label}  ->  ${g}`);
  } else {
    failed++;
    console.error(`FAIL ${label}  ->  got ${g}, want ${w}`);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Route fake responses by URL substring; anything unmatched throws. */
function fake(routes: [string, () => Response][]): Fetcher {
  return async (url) => {
    for (const [needle, respond] of routes) if (url.includes(needle)) return respond();
    throw new Error(`unrouted ${url}`);
  };
}

async function main() {
  // ---- normalizeHandle ----
  check("normalize 'Lumen.io '", normalizeHandle("Lumen.io "), "lumenio");
  check("normalize '-my-app-'", normalizeHandle("-my-app-"), "my-app");

  // ---- all free ----
  const free = await checkHandles(
    "zqxlumo",
    fake([
      ["api.github.com", () => json({ message: "Not Found" }, 404)],
      ["registry.npmjs.org", () => json({ error: "Not found" }, 404)],
      ["hub.docker.com", () => json({ message: "User not found" }, 404)],
      ["gitlab.com/api/v4/users", () => json([])],
      ["gitlab.com/api/v4/groups", () => json({ message: "404 Group Not Found" }, 404)],
      ["bsky.app", () => json({ error: "InvalidRequest", message: "Unable to resolve handle" }, 400)],
      ["firebaseio.com", () => json(null)],
      ["crates.io", () => json({ errors: [] }, 404)],
    ]),
  );
  check("all free", free.map((h) => `${h.id}:${h.status}`), [
    "github:free",
    "npm:free",
    "docker:free",
    "gitlab:free",
    "bluesky:free",
    "hn:free",
    "crates:free",
  ]);

  // ---- all taken ----
  const taken = await checkHandles(
    "vercel",
    fake([
      ["api.github.com", () => json({ login: "vercel" })],
      ["registry.npmjs.org", () => json({ next: "write" })],
      ["hub.docker.com", () => json({ username: "vercel" })],
      ["gitlab.com/api/v4/users", () => json([{ id: 1 }])],
      ["gitlab.com/api/v4/groups", () => json({ message: "404 Group Not Found" }, 404)],
      ["bsky.app", () => json({ did: "did:plc:abc" })],
      ["firebaseio.com", () => json({ id: "vercel", karma: 10 })],
      ["crates.io", () => json({ crate: {} })],
    ]),
  );
  check("all taken", taken.every((h) => h.status === "taken"), true);

  // ---- rate limits, timeouts and odd answers are unknown, never free ----
  const flaky = await checkHandles(
    "vercel",
    fake([
      ["api.github.com", () => json({ message: "API rate limit exceeded" }, 403)],
      ["registry.npmjs.org", () => json({}, 500)],
      ["hub.docker.com", () => json({}, 429)],
      ["gitlab.com/api/v4/users", () => json({}, 429)],
      ["gitlab.com/api/v4/groups", () => json({}, 429)],
      ["bsky.app", () => json({ message: "Rate limit" }, 400)],
      ["firebaseio.com", () => new Response("<html>", { status: 200 })],
    ]), // crates.io unrouted → throws
  );
  check("flaky → unknown", flaky.map((h) => h.status), Array(7).fill("unknown"));

  // ---- platform rules ----
  const rules = await checkHandles("my-app", fake([["", () => json(null, 404)]]));
  const byId = Object.fromEntries(rules.map((h) => [h.id, h.status]));
  check("docker rejects hyphens", byId.docker, "invalid");
  check("github allows hyphens", byId.github, "free");
  const longName = await checkHandles("averyveryverylongname", fake([["", () => json(null, 404)]]));
  check("hn caps at 15 chars", longName.find((h) => h.id === "hn")?.status, "invalid");

  // ---- Marker API parsing ----
  const hits = parseMarker("lumen", {
    count: 3,
    trademarks: [
      { serialnumber: "111", wordmark: "LUMEN LABS", description: "Software", code: "009" },
      { serialnumber: 222, wordmark: "LUMEN", description: "Lighting fixtures", code: "011" },
      { wordmark: "NO SERIAL" },
    ],
  });
  check("marker: drops incomplete, exact first", hits.map((h) => `${h.mark}:${h.exact}`), [
    "LUMEN:true",
    "LUMEN LABS:false",
  ]);
  check("marker: TSDR link", hits[0].url.includes("caseNumber=222"), true);
  check("marker: junk body", parseMarker("x", { error: "bad" }), []);

  // ---- trademark without a key → links only ----
  delete process.env.MARKER_API_USERNAME;
  const noKey = await checkTrademark("lumen", fake([]));
  check("no key → links", [noKey.source, noKey.ok, noKey.links.length], ["links", true, 3]);

  process.env.MARKER_API_USERNAME = "u";
  process.env.MARKER_API_PASSWORD = "p";
  const down = await checkTrademark("lumen", fake([["markerapi.com", () => json({}, 503)]]));
  check("marker down → not ok", [down.source, down.ok], ["marker", false]);
  const live = await checkTrademark(
    "lumen",
    fake([["markerapi.com", () => json({ count: 0, trademarks: [] })]]),
  );
  check("marker empty → ok, no hits", [live.ok, live.hits.length], [true, 0]);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main();
