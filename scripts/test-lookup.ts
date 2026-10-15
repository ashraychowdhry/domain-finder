/**
 * Test suite for lib/lookup.ts (cache, failure reporting, throttling).
 * Uses stub fetchers, so it never touches the network.
 *
 * Run: npx tsx scripts/test-lookup.ts
 */

import { lookup, LookupError, resetLookupState } from "../lib/lookup";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, got?: unknown): void {
  if (ok) {
    passed++;
    console.log(`ok   ${label}`);
  } else {
    failed++;
    console.error(`FAIL ${label}  ->  ${JSON.stringify(got)}`);
  }
}

// Keep the expected warnings out of the test output.
console.warn = () => {};

async function main() {
  // 1. Success is cached: the fetcher runs once for repeat keys (any case).
  {
    resetLookupState();
    let calls = 0;
    const f = async () => (calls++, ["Lumen"]);
    const a = await lookup("npm", "lumen", f);
    const b = await lookup("npm", "LUMEN", f);
    check("success is returned and cached", calls === 1 && a?.[0] === "Lumen" && b?.[0] === "Lumen", { calls, a, b });
  }

  // 2. An empty answer is a real answer, distinct from failure.
  {
    resetLookupState();
    const got = await lookup("appstore", "zzqx", async () => []);
    check("empty result is [] not null", Array.isArray(got) && got.length === 0, got);
  }

  // 3. Failure resolves to null and is not cached.
  {
    resetLookupState();
    let calls = 0;
    const bad = async (): Promise<string[]> => {
      calls++;
      throw new Error("timeout");
    };
    const first = await lookup("pypi", "x", bad);
    const second = await lookup("pypi", "x", async () => (calls++, ["ok"]));
    check("failure -> null, then retried", first === null && second?.[0] === "ok" && calls === 2, { first, second, calls });
  }

  // 4. A throttle response puts the source in cooldown: later calls fail fast.
  {
    resetLookupState();
    let calls = 0;
    await lookup("appstore", "a", async () => {
      calls++;
      throw new LookupError(429);
    });
    const got = await lookup("appstore", "b", async () => (calls++, []));
    const other = await lookup("npm", "b", async () => true);
    check("429 -> cooldown on that source only", got === null && calls === 1 && other === true, { got, calls, other });
  }

  // 5. Concurrent lookups for the same key share one request.
  {
    resetLookupState();
    let calls = 0;
    const slow = () => new Promise<number>((r) => setTimeout(() => r(++calls), 20));
    const [x, y] = await Promise.all([lookup("wikipedia", "k", slow), lookup("wikipedia", "k", slow)]);
    check("in-flight requests are shared", calls === 1 && x === 1 && y === 1, { calls, x, y });
  }

  // 6. The per-source budget (App Store: 20/min) fails fast once spent.
  {
    resetLookupState();
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => lookup("appstore", `n${i}`, async () => [])),
    );
    const nulls = results.filter((r) => r === null).length;
    check("App Store budget caps at 20/min", nulls === 5, { nulls });
  }

  const total = passed + failed;
  if (failed > 0) {
    console.error(`FAIL ${passed}/${total}`);
    process.exit(1);
  }
  console.log(`PASS ${passed}/${total}`);
}

main();
