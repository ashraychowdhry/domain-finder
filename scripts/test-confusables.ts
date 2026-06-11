/**
 * Test suite for lib/confusables.ts.
 *
 * Run: npx tsx scripts/test-confusables.ts
 */

import { confusableWith, type ConfusableHit } from "../lib/confusables";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, got: ConfusableHit | null): void {
  if (ok) {
    passed++;
    console.log(`ok   ${label}  ->  ${JSON.stringify(got)}`);
  } else {
    failed++;
    console.error(`FAIL ${label}  ->  ${JSON.stringify(got)}`);
  }
}

// 1. "stryp" collides with stripe via edit distance
{
  const hit = confusableWith("stryp");
  check(
    "confusableWith('stryp') -> stripe (edit1|edit2)",
    hit !== null &&
      hit.brand === "stripe" &&
      (hit.kind === "edit1" || hit.kind === "edit2"),
    hit,
  );
}

// 2. "notiom" collides with notion
{
  const hit = confusableWith("notiom");
  check(
    "confusableWith('notiom') -> notion",
    hit !== null && hit.brand === "notion",
    hit,
  );
}

// 3. "google" is an exact match
{
  const hit = confusableWith("google");
  check(
    "confusableWith('google') -> kind 'exact'",
    hit !== null && hit.kind === "exact" && hit.brand === "google",
    hit,
  );
}

// 4. gibberish collides with nothing
{
  const hit = confusableWith("zxqvbn");
  check("confusableWith('zxqvbn') -> null", hit === null, hit);
}

// 5. "figmaplus" contains figma (figma is in the top-10k list; verified at build time)
{
  const hit = confusableWith("figmaplus");
  check(
    "confusableWith('figmaplus') -> figma (contains)",
    hit !== null && hit.brand === "figma" && hit.kind === "contains",
    hit,
  );
}

const total = passed + failed;
if (failed > 0) {
  console.error(`FAIL ${passed}/${total}`);
  process.exit(1);
}
console.log(`PASS ${passed}/${total}`);
