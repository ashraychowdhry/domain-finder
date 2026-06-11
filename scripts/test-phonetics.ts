// Smoke tests for lib/phonetics.ts — run with: npx tsx scripts/test-phonetics.ts

import { phoneticReport } from "../lib/phonetics";

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown): void {
  console.assert(cond, label);
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
    if (detail !== undefined) console.error("  got:", JSON.stringify(detail));
  }
}

// Keyword mashes get hammered.
const splitsync = phoneticReport("splitsync", ["split", "sync"]);
check("splitsync: two keyword hits => penalty >= 20", splitsync.penalty >= 20, splitsync);
check(
  "splitsync: legal onset \"spl\" is not flagged as a junction",
  !splitsync.flags.some((f) => f.includes("junction")),
  splitsync,
);

const harmvote = phoneticReport("harmvote", ["harmony", "vote"]);
check(
  "harmvote: flags keyword hit for \"vote\"",
  harmvote.flags.some((f) => f.includes("\"vote\"")),
  harmvote,
);
check(
  "harmvote: flags harsh junction \"rmv\"",
  harmvote.flags.some((f) => f.includes("rmv")),
  harmvote,
);

const pathfed = phoneticReport("pathfed", ["path", "federated"]);
check(
  "pathfed: flags keyword \"path\" verbatim",
  pathfed.flags.some((f) => f.includes("\"path\"") && f.includes("verbatim")),
  pathfed,
);
check(
  "pathfed: flags harsh junction \"thf\"",
  pathfed.flags.some((f) => f.includes("thf")),
  pathfed,
);

// Good names sail through.
const vercel = phoneticReport("vercel", []);
check("vercel: penalty === 0", vercel.penalty === 0, vercel);

const granola = phoneticReport("granola", []);
check("granola: penalty === 0", granola.penalty === 0, granola);

const constellar = phoneticReport("constellar", []);
check("constellar: penalty === 0 (nst is legal)", constellar.penalty === 0, constellar);

const lumora = phoneticReport("lumora", ["journal", "calm"]);
check("lumora: penalty === 0 with unrelated keywords", lumora.penalty === 0, lumora);

const raycast = phoneticReport("raycast", []);
check("raycast: penalty === 0 (glide y is consonantal)", raycast.penalty === 0, raycast);

// Syllable bloat.
const aurelionate = phoneticReport("aurelionate", []);
check("aurelionate: syllable penalty => penalty >= 6", aurelionate.penalty >= 6, aurelionate);

// Penalty stays inside the contract bounds.
const worst = phoneticReport("splitsyncqxzkthful", ["split", "sync", "thful"]);
check("penalty never exceeds 30", worst.penalty <= 30, worst);
check("penalty never negative", phoneticReport("la", []).penalty >= 0);

if (failed > 0) {
  console.error(`FAIL ${passed}/${passed + failed}`);
  process.exit(1);
}
console.log(`PASS ${passed}/${passed + failed}`);
