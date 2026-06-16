// Shared types for the domain finder app.

export type AppType = "web" | "mobile" | "both";
export type Platform = "ios" | "android" | "web";

/** Naming techniques — closed enum so UI chips, prompts, and filters agree. */
export type NamingStyle =
  | "real-word"
  | "coined"
  | "compound"
  | "roots"
  | "misspelling"
  | "metaphor";

/** Optional name-length preference — a soft bias, never a hard filter. */
export type NameLength = "short" | "medium" | "any";

export interface GenerateInput {
  /** Free-text description of the product / idea. */
  description: string;
  /** Comma-or-list keywords the name could draw from. */
  keywords: string[];
  /** Vibe / aesthetic words: e.g. "playful", "minimal", "premium". */
  vibes: string[];
  appType: AppType;
  platforms: Platform[];
  /** TLDs to consider, e.g. ["com", "io", "ai"]. */
  tlds: string[];
  /** Optional: avoid these words / styles. */
  avoid?: string;
  /** Preferred naming styles; empty = let the model vary. */
  stylePrefs?: NamingStyle[];
  /** Preferred name length; "any"/undefined = no bias (default). */
  lengthPref?: NameLength;
}

/** Node categories in the extracted keyword graph. */
export type KeywordKind = "core" | "benefit" | "vibe" | "metaphor" | "root";

/** One node in the keyword graph the model extracts before naming. */
export interface KeywordNode {
  term: string;
  kind: KeywordKind;
  /** Why this term is in the graph, e.g. "Latin for light". */
  note: string;
  /** Other terms in the graph this one connects to. */
  connects: string[];
}

export interface KeywordGraph {
  nodes: KeywordNode[];
}

/** A single AI-proposed name (before availability checking). */
export interface NameIdea {
  /** The base name without a TLD, e.g. "lumen". */
  name: string;
  /** Preferred TLD for this idea, e.g. "com". */
  preferredTld: string;
  /** The clever, non-obvious backstory connecting the name to the product. */
  backstory: string;
  /** Naming technique used. */
  style: NamingStyle;
  /** Keyword-graph terms this name draws from (provenance). */
  sourceNodes: string[];
}

export type AvailabilityStatus = "available" | "taken" | "unknown";

export interface DomainResult {
  /** Full domain, e.g. "lumen.io". */
  domain: string;
  tld: string;
  status: AvailabilityStatus;
  /** Where the signal came from, for transparency. */
  source: "rdap" | "dns" | "error";
  /** Taken AND parked on a marketplace/parking nameserver (likely for sale at a premium). */
  parked?: boolean;
}

/** A name idea joined with availability and intelligence signals. */
export interface RankedIdea extends NameIdea {
  /** Availability for this idea across all requested TLDs. */
  domains: DomainResult[];
  /** The best available domain for this idea, if any. */
  bestAvailable?: string;
  /** Composite score used for ranking (higher = better). */
  score: number;
  /** Human-readable warnings: phonetics, brand-confusables, safety. */
  flags: string[];
  /** 0-100 collision risk from the judge (lower = clearer field). */
  collisionRisk?: number;
  /** The single worst collision, e.g. "Granola (AI meeting notes app)". */
  topCollision?: string | null;
  /** Judge's one-line critique — why this name works (or doesn't). */
  critique?: string;
  /** Judge's forced ranking position (1 = best). */
  judgeRank?: number;
}

/** Registration / renewal price for a TLD (USD, registrar list price). */
export interface TldPrice {
  reg: number;
  renew: number;
}

export interface GenerateResponse {
  /** The keyword graph the model extracted and named from. */
  graph: KeywordGraph;
  ideas: RankedIdea[];
  /** Every name proposed but found taken — used to steer refine calls. */
  takenNames: string[];
  /** Porkbun list prices per requested TLD (fail-soft: may be absent). */
  tldPricing?: Record<string, TldPrice>;
}

/** NDJSON events streamed by /api/generate. */
export type GenerateEvent =
  | { type: "status"; msg: string }
  | { type: "graph"; graph: KeywordGraph }
  | { type: "round"; round: number; proposed: number; takenSoFar: number }
  | { type: "ideas"; ideas: RankedIdea[] }
  | { type: "pricing"; tldPricing: Record<string, TldPrice> }
  | { type: "done"; response: GenerateResponse }
  | { type: "error"; error: string };

export interface RefineResponse {
  ideas: RankedIdea[];
  takenNames: string[];
}

export interface CheckResponse {
  results: DomainResult[];
}

/** An App Store hit for collision checking. */
export interface AppHit {
  name: string;
  seller: string;
  url: string;
}

/** Competitor / SEO deep-analysis for a single chosen domain. */
export interface AnalyzeResponse {
  domain: string;
  /** 0-100, higher = clearer field / easier to rank & differentiate. */
  seoScore: number;
  /** One-line verdict. */
  verdict: string;
  /** Notable existing companies/apps/sites with similar names. */
  collisions: {
    name: string;
    kind: "company" | "app" | "website" | "product" | "other";
    note: string;
    severity: "low" | "medium" | "high";
  }[];
  /** Concrete pros for choosing this name. */
  pros: string[];
  /** Concrete risks / cons. */
  cons: string[];
  /** Known-trademark flag from model knowledge (not legal clearance). */
  trademarkNote?: string;
  /** Whether live web search was used (vs. model knowledge only). */
  usedLiveSearch: boolean;
}
