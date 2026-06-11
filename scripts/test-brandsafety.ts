/**
 * Test suite for lib/brandsafety.ts.
 *
 * Run: npx tsx scripts/test-brandsafety.ts
 */

import { brandSafetyFlag } from "../lib/brandsafety";

let passed = 0;
let failed = 0;

function check(label: string, got: string | null, want: string | null): void {
  if (got === want) {
    passed++;
    console.log(`ok   ${label}  ->  ${JSON.stringify(got)}`);
  } else {
    failed++;
    console.error(
      `FAIL ${label}  ->  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );
  }
}

// ---- Scunthorpe false positives: innocent words/coinages must pass clean ----
check("brandSafetyFlag('analyse')", brandSafetyFlag("analyse"), null);
check("brandSafetyFlag('scunthorpe')", brandSafetyFlag("scunthorpe"), null);
check("brandSafetyFlag('classify')", brandSafetyFlag("classify"), null);
check("brandSafetyFlag('mattitude')", brandSafetyFlag("mattitude"), null);
// Curated traps: each of these embeds a word that was on a raw LDNOOBW list
// but was deliberately dropped (see DROP in scripts/build-profanity.mjs).
check("brandSafetyFlag('debuggerly')", brandSafetyFlag("debuggerly"), null); // bugger
check("brandSafetyFlag('specialisto')", brandSafetyFlag("specialisto"), null); // cialis
check("brandSafetyFlag('connectly')", brandSafetyFlag("connectly"), null); // conne (fr)
check("brandSafetyFlag('computeria')", brandSafetyFlag("computeria"), null); // pute(s) (fr)
check("brandSafetyFlag('technique')", brandSafetyFlag("technique"), null); // nique (fr)
check("brandSafetyFlag('accessoria')", brandSafetyFlag("accessoria"), null); // cesso (it)
check("brandSafetyFlag('montanaly')", brandSafetyFlag("montanaly"), null); // monta (es)
check("brandSafetyFlag('therapistio')", brandSafetyFlag("therapistio"), null); // rapist
check("brandSafetyFlag('trafficker')", brandSafetyFlag("trafficker"), null); // ficker (de)

// ---- True positives: coinages embedding kept list words across morpheme
// boundaries must return the embedded word ----
check("brandSafetyFlag('whorelytics')", brandSafetyFlag("whorelytics"), "whore");
check("brandSafetyFlag('bukkakeify')", brandSafetyFlag("bukkakeify"), "bukkake");
check("brandSafetyFlag('putainview')", brandSafetyFlag("putainview"), "putain"); // fr
check("brandSafetyFlag('mierdahub')", brandSafetyFlag("mierdahub"), "mierda"); // es
check("brandSafetyFlag('cazzolino')", brandSafetyFlag("cazzolino"), "cazzo"); // it
check("brandSafetyFlag('fellatiopia')", brandSafetyFlag("fellatiopia"), "fellatio");
// Hand-kept high-severity short word
check("brandSafetyFlag('kkkonsulting')", brandSafetyFlag("kkkonsulting"), "kkk");
// Normalization: case and separators don't hide the embedded word
check("brandSafetyFlag('WhoreLytics')", brandSafetyFlag("WhoreLytics"), "whore");
check("brandSafetyFlag('mierda-hub')", brandSafetyFlag("mierda-hub"), "mierda");

const total = passed + failed;
if (failed > 0) {
  console.error(`FAIL ${passed}/${total}`);
  process.exit(1);
}
console.log(`PASS ${passed}/${total}`);
