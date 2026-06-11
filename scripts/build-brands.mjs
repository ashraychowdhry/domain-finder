#!/usr/bin/env node
/**
 * build-brands.mjs
 *
 * Downloads the Tranco top-1M list, takes the top 10,000 domains, extracts
 * their second-level labels, and writes a compact JSON array of
 * [label, rank] tuples to lib/data/top-brands.json.
 *
 * Usage: node scripts/build-brands.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const LIST_URL = "https://tranco-list.eu/top-1m.csv.zip";
const TOP_N = 10_000;
const MIN_LEN = 4;
const MAX_LEN = 12;

const OUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "data",
  "top-brands.json",
);

/** Known two-part public suffixes (naive list — enough for the top 10k). */
const TWO_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "net.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.jp", "ne.jp", "or.jp", "ac.jp", "go.jp",
  "com.br", "net.br", "org.br", "gov.br",
  "co.in", "net.in", "org.in", "gov.in", "ac.in",
  "co.nz", "net.nz", "org.nz",
  "co.za", "org.za", "gov.za",
  "co.kr", "or.kr", "go.kr", "ac.kr",
  "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn", "ac.cn",
  "com.tw", "org.tw", "edu.tw", "gov.tw",
  "com.hk", "org.hk", "edu.hk", "gov.hk",
  "com.mx", "org.mx", "gob.mx", "edu.mx",
  "com.ar", "com.co", "com.pe", "com.ve", "com.uy", "com.ec",
  "com.tr", "org.tr", "gov.tr", "edu.tr", "net.tr",
  "com.sg", "edu.sg", "gov.sg",
  "com.my", "gov.my", "edu.my",
  "com.ph", "gov.ph", "edu.ph",
  "co.th", "or.th", "go.th", "ac.th", "in.th",
  "com.vn", "edu.vn", "gov.vn",
  "co.id", "or.id", "go.id", "ac.id", "web.id",
  "com.pk", "edu.pk", "gov.pk",
  "com.bd", "gov.bd", "edu.bd",
  "com.ng", "gov.ng", "edu.ng",
  "com.eg", "gov.eg", "edu.eg",
  "com.sa", "gov.sa", "edu.sa",
  "co.il", "org.il", "gov.il", "ac.il",
  "com.ua", "gov.ua", "edu.ua",
  "com.pl", "net.pl", "org.pl", "edu.pl", "gov.pl",
  "com.ru", "org.ru", "net.ru",
  "co.ke", "or.ke", "go.ke", "ac.ke",
  "com.gh", "gov.gh",
  "co.zw", "co.tz", "co.ug",
  "gov.it", "edu.it",
  "com.es", "org.es", "gob.es",
  "com.pt", "gov.pt", "edu.pt",
  "com.gr", "gov.gr", "edu.gr",
  "co.at", "or.at", "gv.at", "ac.at",
  "com.de",
]);

/**
 * Extract the second-level label of a domain, naively stripping the public
 * suffix: if the last two labels form a known two-part suffix take the
 * third-from-last label, otherwise take the second-from-last.
 */
function secondLevelLabel(domain) {
  const parts = domain.toLowerCase().split(".");
  if (parts.length < 2) return null;
  const lastTwo = parts.slice(-2).join(".");
  if (TWO_PART_SUFFIXES.has(lastTwo)) {
    return parts.length >= 3 ? parts[parts.length - 3] : null;
  }
  return parts[parts.length - 2];
}

async function main() {
  console.log(`Downloading ${LIST_URL} ...`);
  const res = await fetch(LIST_URL, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
  }
  const zipBytes = Buffer.from(await res.arrayBuffer());
  console.log(`Downloaded ${(zipBytes.length / 1024 / 1024).toFixed(1)} MB`);

  const tmp = mkdtempSync(join(tmpdir(), "tranco-"));
  let csv;
  try {
    const zipPath = join(tmp, "top-1m.csv.zip");
    writeFileSync(zipPath, zipBytes);
    // -p: extract to stdout. macOS ships `unzip` out of the box.
    csv = execFileSync("unzip", ["-p", zipPath], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // CSV rows look like: "1,google.com"
  const best = new Map(); // label -> lowest rank
  let rows = 0;
  for (const line of csv.split("\n")) {
    if (rows >= TOP_N) break;
    const trimmed = line.trim();
    if (!trimmed) continue;
    const comma = trimmed.indexOf(",");
    if (comma === -1) continue;
    const rank = Number(trimmed.slice(0, comma));
    const domain = trimmed.slice(comma + 1);
    if (!Number.isInteger(rank) || !domain) continue;
    rows++;

    const label = secondLevelLabel(domain);
    if (!label) continue;
    if (label.length < MIN_LEN || label.length > MAX_LEN) continue;
    if (!/^[a-z]+$/.test(label)) continue;

    const prev = best.get(label);
    if (prev === undefined || rank < prev) best.set(label, rank);
  }

  const entries = [...best.entries()].sort(
    (a, b) => a[0].length - b[0].length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  );

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(entries) + "\n");

  const bytes = statSync(OUT_PATH).size;
  console.log(`Processed ${rows} rows, kept ${entries.length} unique labels.`);
  console.log(`Wrote ${OUT_PATH} (${(bytes / 1024).toFixed(1)} KB)`);
  if (bytes > 200 * 1024) {
    console.warn("WARNING: output exceeds 200KB target.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
