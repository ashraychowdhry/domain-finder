#!/usr/bin/env node
/**
 * build-profanity.mjs
 *
 * Downloads the LDNOOBW ("List of Dirty, Naughty, Obscene, and Otherwise
 * Bad Words") lists for en/es/fr/de/it, aggressively curates them to avoid
 * Scunthorpe-style false positives in coined brand names, and writes a
 * sorted, deduped JSON string array to lib/data/profanity.json.
 *
 * The consumer (lib/brandsafety.ts) does a plain substring scan, so every
 * entry kept here must be safe as a SUBSTRING of an arbitrary coinage.
 * That drives the curation rules:
 *
 *   1. Single words only — no phrases/spaces/hyphens/digits.
 *   2. Lowercase, ASCII letters only (accented entries are dropped; the
 *      runtime folds diacritics before scanning, so ASCII coverage works).
 *   3. Words shorter than 5 chars are dropped wholesale EXCEPT a tiny
 *      hand-kept high-severity list (see HAND_KEPT). This single rule
 *      kills most classic traps: anal->ANALyse, cunt->sCUNThorpe,
 *      ass->clASSify, tit->matTITude, homo->HOMOgeneous, puta->comPUTAtion,
 *      bite(fr)->websITE-ish roots, culo(es)->curriCULO, fica(it)->magniFICA.
 *   4. An explicit DROP set removes >=5-char entries that are common words
 *      or frequent substrings of innocent roots (documented inline below).
 *   5. Minimization: any entry that contains another kept entry as a
 *      substring is redundant for substring scanning and is removed
 *      (e.g. "motherfucker" is covered by "fuck").
 *
 * Usage: node scripts/build-profanity.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const LANGS = ["en", "es", "fr", "de", "it"];
const BASE_URL =
  "https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master";

const OUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "data",
  "profanity.json",
);

const MIN_LEN = 5;

/**
 * Hand-kept high-severity short words (<5 chars). Deliberately tiny: each
 * one is severe enough that a human should always eyeball a name containing
 * it, and none has the saturation-level false-positive profile of
 * ass/tit/hell/damn/crap/sex (all intentionally NOT here).
 *
 * Known accepted tradeoff: "cum" matches doCUMent/cirCUMlocution-style
 * Latin roots — judged worth it for severity; the feature flags, never
 * blocks. "cunt" is intentionally absent (sCUNThorpe — the namesake trap).
 */
const HAND_KEPT = ["cum", "fag", "fuck", "jizz", "kike", "kkk", "nazi", "shit"];

/**
 * Curated removals: >=5-char list entries that are common words in their
 * language or frequent substrings of innocent roots used in brand coinages.
 * Each entry documents the collision that motivated it. Entries listed here
 * that a list doesn't actually contain are harmless no-ops.
 */
const DROP = new Set([
  // ---- English: common words / mild terms ----
  "balls", // eyeBALLS, BALLSy — common word
  "bareback", // horse-riding term; common word
  "barenaked", // nude-class mild; Barenaked Ladies
  "bastard", // mild, common English word
  "bloody", // mild British intensifier; common word
  "bondage", // vagaBONDAGE; ordinary English word
  "breast", // chicken breast, breaststroke — common word
  "breasts", // plural of the above
  "busty", // roBUSTY-style coinages from "robust"
  "cornhole", // the (now mainstream) lawn game
  "domination", // common English word (chess, board games)
  "erotic", // common English word; flags "eroticism"-adjacent coinages
  "erotism", // same family
  "escort", // Ford Escort; common service word
  "eunuch", // historical/clinical term
  "fecal", // common medical term
  "fingering", // knitting yarn weight, guitar technique — common word
  "genitals", // plain medical term
  "grope", // common verb
  "hardcore", // common gaming/music term
  "hooker", // rugby position, common surname (Hooker Furniture)
  "horny", // tHORNY, hawTHORN-adjacent coinages; mild
  "humping", // mild; camel-adjacent coinages
  "incest", // common clinical word; appears in legal/health coinages
  "intercourse", // formal common word
  "kinky", // common playful word
  "lolita", // proper name / novel title
  "lusting", // mild; LUST roots ("luster", "illustrious"-style coinages)
  "nipple", // common hardware/childcare term
  "nipples", // plural of the above
  "nudity", // common word
  "panties", // common clothing word
  "panty", // common clothing word
  "pegging", // PEGGING a currency, clothes pegs — common word
  "playboy", // existing brand / common compound
  "pubes", // PUBEScent; "pub" roots in British-style coinages
  "queer", // reclaimed identity term; common word
  "rape", // would be hand-kept-severe, but gRAPE/dRAPE/scRAPEd/tRAPEze saturate coinages
  "raping", // gRAPING, scRAPING
  "rapist", // theRAPIST — the classic "therapist" trap
  "rectum", // corRECTUM-style coinages from "correct"; clinical anyway
  "rimming", // RIMMING a glass (cocktails), basketball — common word
  "sadism", // common literary/clinical word
  "scissoring", // common engineering/dance term
  "screwing", // mild; common word
  "semen", // baSEMENt, horSEMEN — severe trap
  "sexually", // sex-family excluded per spec (Essex/Sussex problem)
  "sexy", // sex-family
  "sexual", // sex-family
  "sexuality", // sex-family
  "shota", // common Georgian/Japanese given name (Shota Rustaveli)
  "shrimping", // literal shrimp fishing — seafood brands
  "skeet", // skeet shooting — common sport
  "snatch", // common verb/noun
  "snowballing", // common word (snowball effect)
  "spastic", // common (if dated) medical word
  "spunk", // means courage; common positive word ("spunky")
  "sucks", // common mild word
  "swinger", // common word (golf, dance)
  "threesome", // standard golf term; common word
  "throating", // THROAT root is innocent/medical
  "topless", // common word
  "tosser", // mild British; TOSS roots in coinages
  "tushy", // mild
  "twink", // TWINKle/TWINKie — twinkle roots are everywhere in branding
  "twinkie", // Hostess Twinkie snack brand
  "undressing", // common word
  "vibrator", // ordinary product category
  "voyeur", // common loanword
  "voyuer", // typo'd duplicate of the above in the source list
  // English: innocent-root substring traps & names
  "beaner", // BEANERy — coffee/food brands built on "bean" roots
  "beaners", // plural of the above
  "birdlock", // bird + lock — both innocent, high-frequency brand morphemes
  "boner", // carBONER-style coinages from "carbon"
  "bugger", // deBUGGER — fatal trap for developer-tool names
  "cialis", // speCIALISt, soCIALISt, speCIALISe — severe trap
  "cocks", // peaCOCKS, hanCOCKS
  "coons", // racCOONS, tyCOONS
  "dykes", // levee dykes, common surname
  "pikey", // sPIKEY — "spikey" is a stock brand-name pattern (slur loses to saturation)
  "retard", // fire-RETARDant — real product-category coinages
  "santorum", // surname (the list entry is a political neologism)
  "viagra", // VIAGRAm/VIAGRAnt — "via" + "gram/grant" coinages; trademark, not profanity
  // ---- French ----
  "baise", // "baiser" = kiss; common French word
  "baiser", // same
  "balle", // BALLEt, BALLErina — and it just means "ball/bullet"
  "bander", // "band" roots in music brands (BANDERole); also "to band"
  "bitte", // BITTEr roots (beverage brands); German for "please"
  "bonze", // means "bigwig" (de) / "Buddhist monk" (fr); common word
  "bordel", // BORDELais — Bordeaux wine-region coinages
  "chatte", // CHATTEr/CHATTErbox — "chat" roots saturate tech brands
  "chier", // fiCHIER (French for "file") — tech trap; mild
  "conne", // CONNEct/CONNEctor — the single worst tech-brand trap in the lists
  "folle", // means "crazy"; FOLLEtto (Italian "elf", vacuum brand)
  "foutre", // common French verb in casual speech
  "gerbe", // means "sheaf/spray of flowers"; common word
  "gland", // ordinary English word (and FR list entry)
  "gueule", // common French word ("mouth/face")
  "jouir", // ordinary French verb ("to enjoy")
  "malpt", // junk/fragment entry in the source list
  "mufti", // religious title; also British "civilian clothes"
  "nique", // cliNIQUE, techNIQUE — severe trap
  "niquer", // techNIQUER-style coinages
  "putes", // comPUTES — severe tech trap
  "queue", // ordinary English/French word
  "ramoner", // primary meaning "to sweep chimneys"
  "rosette", // award ribbons, pasta, architecture — common word
  "sucer", // common French verb root; "suce" coinage collisions
  "tanche", // a fish (tench)
  "tapette", // also means fly-swatter; mild
  "travesti", // neutral term in Romance languages; descriptor
  "trique", // meTRIQUE/elecTRIQUE — French-flavored coinages are common in branding
  // ---- Spanish ----
  "asesinato", // "murder" — violence vocab, not embedded profanity
  "brinca", // from "brincar", to jump — innocent verb
  "coger", // ordinary verb "to take" in European Spanish
  "concha", // sea shell; common given name (La Concha)
  "culos", // curriCULOS
  "drogas", // "drugs" — descriptive vocab
  "idiota", // idiot-class mild insult
  "infierno", // hell-class, excluded per spec
  "maciza", // means "solid" (madera maciza); common word
  "maldito", // damn-class, excluded per spec
  "martillo", // "hammer" — innocent noun
  "monta", // MONTAna, MONTAge, MONTAuk — severe trap
  "negra", // means "black"; common word
  "negro", // means "black"; MonteNEGRO, NEGROni
  "orina", // "urine" (clinical); fiORINA/-ORINA diminutive coinages
  "pinche", // means kitchen-hand in European Spanish; mild
  "polla", // POLLO/poultry roots in food brands
  "pollas", // plural of the above
  "putas", // comPUTAS — tech trap
  "putos", // comPUTOS — tech trap
  "racista", // descriptor; veRACISTA-style coinages from "veracity"
  "tetas", // tit-class, excluded per spec
  "verga", // conVERGA-style coinages from "converge"
  // ---- German ----
  "arsch", // mARSCH (German "march"), MARSCHall; ass-class anyway
  "bratze", // mild slang; Bratz-adjacent
  "ficken", // trafFICKEN — "traffic" roots in ad-tech brands
  "ficker", // trafFICKER — same trap
  "fratze", // common German word ("grimace")
  "ische", // fragment entry; matches technISCHE/logISCHE — catastrophic substring
  "kacke", // mild ("poop")
  "kimme", // rear gunsight; KIMMEl (common surname)
  "nackt", // common German word ("naked")
  "nippel", // nipple-class (see English)
  "nutte", // NUTTEr/nUTTEry — "nut" roots in food brands
  "nutten", // plural of the above
  "pimpern", // PIMPERNel (the flower / Scarlet Pimpernel)
  "pinkeln", // mild ("to pee"); PINK roots in branding
  "popel", // mild ("booger")
  "poppen", // POP roots saturate branding ("pop" + -en coinages)
  "reudig", // mild ("mangy")
  "schiesser", // Schiesser AG — major German apparel brand
  "schwanz", // ordinary German word ("tail")
  "titten", // tit-class, excluded per spec
  "verdammt", // damn-class, excluded per spec
  "vollpfosten", // idiot-class mild insult
  "zinne", // ordinary German word ("pinnacle/merlon")
  // ---- Italian ----
  "anale", // cANALE (Italian "channel"), ANALEmma — anal-class trap
  "bagnarsi", // ordinary verb ("to get wet")
  "battere", // ordinary verb ("to beat")
  "bimbo", // Italian for "little boy"; Grupo Bimbo bakery brand
  "bocchino", // also "mouthpiece" (music); common word
  "boiata", // mild ("rubbish")
  "cadavere", // "corpse" — not profanity
  "casci", // fragment; CASCIna (farmhouse — agriturismo brands)
  "cesso", // acCESSOry, acCESSO (Italian "access") — severe tech trap
  "chiappa", // Chiappa Firearms; common surname
  "cornuto", // "horned"/cuckold; CORNUTOpia-style corn-root coinages
  "cozza", // "mussel" — seafood word
  "ditalino", // DITALINI pasta; "little thimble" diminutive
  "ecchi", // vECCHIo, orECCHIette, spECCHIo — severe trap in Italian-flavored names
  "figging", // FIG roots in food brands; obscure term
  "figone", // fig + -one coinage; Italian surname
  "finocchio", // primary meaning "fennel" — Italian food brands
  "goldone", // GOLD + -ONE — "Goldone" is a textbook coined brand name
  "guardone", // GUARD + -ONE — security-brand coinages
  "imbecille", // idiot-class mild insult
  "mannaggia", // damn-class mild exclamation
  "palle", // PALLEt, PALLEtte — logistics/design roots; means "balls"
  "palloso", // mild ("boring")
  "patacca", // mild ("worthless trinket")
  "pesce", // "fish" — common word/surname
  "picio", // troPICIO-style coinages from "tropic"; mild regional slang
  "pippa", // common given name (Pippa)
  "pippone", // mild; PIPPO is a common Italian nickname
  "pisello", // primary meaning "pea" — food brands
  "pistolotto", // mild ("rant/lecture")
  "pomiciare", // mild teen slang; POMICe (pumice) roots
  "pompa", // "pump" (innocent); POMPAdour
  "porca", // "pig"; mild common word
  "porco", // "pig"; mild common word
  "potta", // POTTAge; "pot" roots in kitchenware brands
  "quaglia", // "quail" — bird/surname
  "regina", // "queen" — extremely common name, city (Regina, SK)
  "rizzarsi", // ordinary reflexive verb ("to stand up")
  "ruffiano", // mild ("flatterer"); common word
  "sbattersi", // "sbattere" = to slam; common verb root
  "scopare", // also "to sweep" — ordinary verb
  "scopata", // same root
  "spagnola", // "Spanish woman" — innocent word
  "terrone", // regional slur, but TERRA + -ONE coinages (terroir/earth roots) saturate branding
  "tette", // tit-class; -ETTE diminutive coinages (charT + ETTE etc.)
  "tirare", // ordinary verb ("to pull")
  "troia", // Troy; place-name roots
  "vacca", // "cow" — mild common word
  "vangare", // ordinary verb ("to dig")
]);

async function fetchList(lang) {
  const url = `${BASE_URL}/${lang}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return text.split("\n").map((line) => line.trim().toLowerCase());
}

function curate(rawWords) {
  const kept = new Set(HAND_KEPT);
  let phrases = 0;
  let nonAscii = 0;
  let tooShort = 0;
  let dropped = 0;

  for (const word of rawWords) {
    if (word.length === 0) continue;
    if (!/^[a-z]+$/.test(word)) {
      // Phrases, hyphenated forms, digits (l33t), and accented entries.
      if (/[^a-z]/.test(word) && /[a-z]/.test(word) && word.includes(" ")) {
        phrases++;
      } else {
        nonAscii++;
      }
      continue;
    }
    if (word.length < MIN_LEN) {
      tooShort++;
      continue;
    }
    if (DROP.has(word)) {
      dropped++;
      continue;
    }
    kept.add(word);
  }

  // Minimization: for substring scanning, an entry containing another kept
  // entry is redundant ("fucking" can never match without "fuck" matching).
  const sorted = [...kept].sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
  const minimal = [];
  for (const word of sorted) {
    if (!minimal.some((m) => word.includes(m))) minimal.push(word);
  }

  console.log(
    `curation: ${rawWords.length} raw lines -> skipped ${phrases} phrases, ` +
      `${nonAscii} non-ascii/other, ${tooShort} short (<${MIN_LEN}), ` +
      `${dropped} curated drops; ${kept.size} kept, ${minimal.length} after minimization`,
  );

  return minimal.sort();
}

async function main() {
  const all = [];
  for (const lang of LANGS) {
    const words = await fetchList(lang);
    console.log(`fetched ${lang}: ${words.length} lines`);
    all.push(...words);
  }

  const finalList = curate(all);

  // Sanity guards: the spec's target band, and the trap words that must
  // never appear (they break the Scunthorpe acceptance tests).
  const forbidden = ["anal", "ass", "cunt", "tit", "sex", "hell", "damn", "crap"];
  for (const f of forbidden) {
    if (finalList.includes(f)) {
      throw new Error(`forbidden trap word "${f}" survived curation`);
    }
  }
  if (finalList.length < 300 || finalList.length > 800) {
    console.warn(
      `WARNING: list size ${finalList.length} outside expected 300-800 band`,
    );
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(finalList, null, 2) + "\n");
  console.log(`wrote ${finalList.length} words to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
