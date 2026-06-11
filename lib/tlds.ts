// The set of TLDs the tool checks and suggests by default.
// "Broad modern set" — gives more chances to find something available.

export const DEFAULT_TLDS = [
  "com",
  "io",
  "ai",
  "app",
  "co",
  "dev",
  "xyz",
  "so",
  "me",
] as const;

export type Tld = string;

/** Human note on each TLD's vibe, surfaced as hints in the UI. */
export const TLD_NOTES: Record<string, string> = {
  com: "The default. Most trusted, best for broad consumer apps.",
  io: "Developer / tech startup flavor.",
  ai: "Signals an AI product. Premium feel.",
  app: "Clearly an app. HTTPS-only (secure).",
  co: "Clean .com alternative.",
  dev: "Developer tools. HTTPS-only.",
  xyz: "Modern, web3 / indie energy.",
  so: "Short and punchy ('we make X, so...').",
  me: "Personal / consumer products.",
};
