// Content for the developer long-tail landing pages (/names/[slug]) and the
// comparison pages (/compare/[slug]). Static data so every page prerenders at
// build time. Rival facts were reviewed in Sept 2026; keep claims hedged and
// update REVIEWED when you re-check them.

import { DEFAULT_TLDS } from "./tlds";

export const REVIEWED = "September 2026";

/** Prefill the live tool with a brief (same ?b= format finder.tsx decodes). */
export function briefLink(description: string, keywords: string[] = [], appType = "web"): string {
  const b = {
    d: description,
    k: keywords,
    v: [],
    a: appType,
    p: appType === "mobile" ? ["ios", "android"] : ["web"],
    t: [...DEFAULT_TLDS],
    av: "",
    s: [],
  };
  const b64 = Buffer.from(JSON.stringify(b), "utf8").toString("base64");
  return `/?b=${encodeURIComponent(b64)}`;
}

export interface NamePage {
  slug: string;
  /** The search phrase the page targets, e.g. "CLI tool name generator". */
  keyword: string;
  h1: string;
  description: string;
  intro: string;
  /** Example brief that prefills the tool. */
  brief: string;
  keywords: string[];
  appType?: "web" | "mobile" | "both";
  tips: { title: string; body: string }[];
  /** Real, well-known names and why they work. */
  examples: { name: string; why: string }[];
  /** Which of Vocari's checks matter most for this category. */
  checks: string[];
  faq: { q: string; a: string }[];
}

export const NAME_PAGES: NamePage[] = [
  {
    slug: "cli-tool",
    keyword: "CLI tool name generator",
    h1: "Name your CLI tool",
    description:
      "Find a short, typeable name for your command-line tool, with the domain, GitHub handle and package names checked live. Free, no signup.",
    intro:
      "A CLI name gets typed hundreds of times a day, so it has to be short, easy on the fingers and not already a command on someone's PATH. Vocari generates candidates, then checks the domain, npm, PyPI, crates.io and GitHub so you don't ship a name you can't publish.",
    brief: "A fast command-line tool for developers that",
    keywords: ["terminal", "fast"],
    tips: [
      {
        title: "Two to five letters for the binary",
        body: "The brand can be longer than the command. ripgrep ships as rg, and people still say ripgrep. Pick a name that shortens cleanly.",
      },
      {
        title: "Check your PATH before you fall in love",
        body: "Run `command -v <name>` on macOS and a Linux box. Colliding with a coreutils or Homebrew binary means users alias around you forever.",
      },
      {
        title: "Type it on a keyboard, not a whiteboard",
        body: "Alternating hands and home-row letters beat clever spellings. If you mistype it twice while testing, users will too.",
      },
      {
        title: "Grab the package names together",
        body: "Most CLIs ship on Homebrew plus one of npm, PyPI or crates.io. Get the same name on all of them the day you pick it.",
      },
    ],
    examples: [
      { name: "git", why: "Three letters, one syllable, and a memorable backstory: Linus Torvalds named it after British slang for an unpleasant person." },
      { name: "fzf", why: "Reads as \"fuzzy finder\" once you know it, and the letters sit under one hand." },
      { name: "bat", why: "A one-letter change from cat, which tells you exactly what it replaces." },
      { name: "jq", why: "Two letters, zero collisions, and it became the verb for querying JSON." },
    ],
    checks: ["GitHub handle", "npm, PyPI and crates.io names", "Domain (.dev and other short TLDs)", "Hacker News handle for the Show HN"],
    faq: [
      {
        q: "How long should a CLI tool name be?",
        a: "The command itself should be two to five characters if possible. The project can have a longer brand name, as long as it shortens naturally to the binary name.",
      },
      {
        q: "How do I check if a CLI name is already taken?",
        a: "Check your PATH (`command -v name`), Homebrew, and the package registry you'll ship on. Vocari checks npm, PyPI, crates.io, GitHub and the domain for any name in one click.",
      },
    ],
  },
  {
    slug: "developer-tool",
    keyword: "developer tool name generator",
    h1: "Name your developer tool",
    description:
      "Brandable names for devtools startups, with the domain, GitHub org, npm scope and Docker Hub namespace checked live. Free, no signup.",
    intro:
      "Developers find tools through GitHub, package registries and Hacker News, so a devtool name has to be free in all of those places, not just as a domain. Vocari checks every candidate against the domain registries, npm, PyPI, the App Store and the developer handles that matter.",
    brief: "A developer tool that helps engineering teams",
    keywords: ["developers", "workflow"],
    tips: [
      {
        title: "A real word used as a metaphor ages well",
        body: "Sentry, Postman and Docker each borrow an everyday word whose meaning maps onto what the product does. They are easy to say in a standup and easy to search once you're known.",
      },
      {
        title: "Own the GitHub org and npm scope",
        body: "Your SDKs will live at github.com/<name> and @<name>/sdk. Losing either to a squatter makes your install instructions look fake.",
      },
      {
        title: "Avoid generic dev words",
        body: "Names like \"CodeFlow\" or \"DevHub\" collide with dozens of repos and are impossible to rank for.",
      },
      {
        title: "Say it out loud in a sentence",
        body: "\"Just pipe it through ___\" or \"we use ___ for that\". If it sounds odd as a noun or verb, keep looking.",
      },
    ],
    examples: [
      { name: "Sentry", why: "A guard who keeps watch, which is what error monitoring does." },
      { name: "Postman", why: "It delivers your requests. A friendly, familiar word for an API client." },
      { name: "Docker", why: "Dock workers load shipping containers, the exact metaphor for software containers." },
      { name: "Linear", why: "One real word that promises straightforward progress, for an issue tracker." },
    ],
    checks: ["GitHub org", "npm scope", "Docker Hub namespace", "App Store and web collisions"],
    faq: [
      {
        q: "Should a devtools startup get the .com or a .dev?",
        a: "A .com is still the default people type, but .dev is widely trusted by developers and is HTTPS-only. Vocari checks both, plus .io, .ai and .app, and shows renewal prices so you don't get surprised in year two.",
      },
    ],
  },
  {
    slug: "open-source-project",
    keyword: "open source project name generator",
    h1: "Name your open source project",
    description:
      "Names for open source projects that are free on GitHub, npm, PyPI and crates.io, with a domain to match. Free, no signup.",
    intro:
      "An open source name is the import statement, the repo, the docs domain and the thing people shout on social media. Vocari finds names whose domain is available, then lets you check the GitHub, package registry and social handles in one click.",
    brief: "An open source library that",
    keywords: ["open source", "library"],
    tips: [
      {
        title: "Short enough to import",
        body: "You'll type it in every file. Vite, Deno and Babel are all four or five letters.",
      },
      {
        title: "A story helps adoption",
        body: "Kubernetes is Greek for helmsman, Deno is an anagram of Node. A backstory gives the README an opening line and gives people something to repeat.",
      },
      {
        title: "Match the repo, package and domain",
        body: "If the npm package is taken, people install the wrong one. Check every registry before the first commit.",
      },
      {
        title: "Plan for a foundation or a company",
        body: "If the project could become a company, check trademarks early. Renaming a popular project later is painful.",
      },
    ],
    examples: [
      { name: "Kubernetes", why: "Greek for helmsman, a good fit for something that steers containers, and it shortens to k8s." },
      { name: "Vite", why: "French for \"quick\", four letters, and exactly the promise of the tool." },
      { name: "Redis", why: "Short for REmote DIctionary Server, which turned an acronym into a pronounceable word." },
      { name: "Deno", why: "An anagram of Node, from the same creator, so the story tells itself." },
    ],
    checks: ["GitHub", "npm, PyPI and crates.io", "Domain for the docs site", "Trademark screen if a company may follow"],
    faq: [
      {
        q: "Do open source projects need a trademark?",
        a: "Not to start, but it's worth checking you aren't using someone else's. Many large projects register their name through a foundation later. Vocari's handles and trademark panel lists live US marks when configured and links to the official registers.",
      },
    ],
  },
  {
    slug: "saas",
    keyword: "SaaS name generator",
    h1: "Name your SaaS",
    description:
      "Brandable SaaS names with an available domain, screened for App Store and web collisions and checked for social handles. Free, no signup.",
    intro:
      "Most SaaS names die in the gap between \"that's great\" and \"the .com is taken\". Vocari only shows names with a domain you can actually register, ranks them on how crowded the name is, and checks handles and trademarks when you find one you like.",
    brief: "A B2B SaaS that helps small teams",
    keywords: ["teams", "simple"],
    tips: [
      {
        title: "Distinctive beats descriptive",
        body: "\"InvoiceHub\" tells people what you do and gives you nothing to own in search. A real-word metaphor or a coined word is easier to rank for.",
      },
      {
        title: "Mind the renewal price",
        body: "Some TLDs are cheap in year one and expensive after. Vocari shows first-year and renewal pricing next to each domain.",
      },
      {
        title: "Check the App Store even if you're web-only",
        body: "A popular app with your name will outrank you and confuse customers, whatever platform you start on.",
      },
      {
        title: "Say it on a sales call",
        body: "If you have to spell it every time, it'll cost you in every demo and referral.",
      },
    ],
    examples: [
      { name: "Notion", why: "A real word about ideas, which fits a tool for thinking and writing." },
      { name: "Calendly", why: "A clear root plus a friendly suffix: descriptive, but still ownable." },
      { name: "Loom", why: "Short, visual and a weaving metaphor for stitching video into work." },
      { name: "Airtable", why: "A compound that makes a spreadsheet sound light." },
    ],
    checks: ["Domain with renewal price", "Web and App Store collisions", "X, LinkedIn and Instagram handles", "US trademark screen"],
    faq: [
      {
        q: "Is it OK to use a .io or .ai domain for a SaaS?",
        a: "Yes, both are common for software. Check the renewal price first: some country-code domains cost several times more to renew than to register.",
      },
    ],
  },
  {
    slug: "npm-package",
    keyword: "npm package name checker",
    h1: "Find an npm package name",
    description:
      "Check whether an npm package name is taken and find available alternatives, with the matching domain and GitHub handle. Free, no signup.",
    intro:
      "npm's namespace is crowded, and the registry also blocks names that are too similar to existing packages. Vocari finds names that are free on npm and as a domain, then checks the npm scope and GitHub org so your package, repo and docs all match.",
    brief: "A JavaScript library published on npm that",
    keywords: ["javascript", "library"],
    tips: [
      {
        title: "Punctuation won't save you",
        body: "npm rejects new names that differ from an existing package only by punctuation, so \"my-lib\" is blocked if \"mylib\" exists.",
      },
      {
        title: "Consider a scope",
        body: "Publishing as @yourname/pkg side-steps collisions entirely, and the unscoped name can come later.",
      },
      {
        title: "Short names get typed, long names get copied",
        body: "zod, chalk and axios are all easy to type in an import. Long descriptive names get copy-pasted and misspelled.",
      },
      {
        title: "Check what's squatting",
        body: "An empty package on your name may be reclaimable through npm support, but that takes time. Pick a free name if you can.",
      },
    ],
    examples: [
      { name: "lodash", why: "Named after the underscore it's exported as: a \"low dash\". Clever and unforgettable." },
      { name: "zod", why: "Three letters and easy to import. It became a common word in TypeScript circles." },
      { name: "chalk", why: "A real word that pictures colored terminal output." },
      { name: "axios", why: "Greek for \"worthy\", short and distinctive in import statements." },
    ],
    checks: ["npm package and scope", "GitHub", "PyPI (for cross-language SDKs)", "Domain for docs"],
    faq: [
      {
        q: "How do I check if an npm package name is available?",
        a: "Look it up at npmjs.com/package/<name>, and remember npm also rejects names too similar to existing ones. Vocari checks the exact npm package, the npm scope, GitHub and the domain together.",
      },
    ],
  },
  {
    slug: "python-package",
    keyword: "Python package name generator",
    h1: "Name your Python package",
    description:
      "Find a PyPI package name that's free, with the matching import name, GitHub handle and domain checked. Free, no signup.",
    intro:
      "PyPI treats names case-insensitively and considers hyphens, underscores and dots equivalent, so the name you want may already be taken in a form you didn't check. Vocari checks PyPI, npm, GitHub and the domain for every candidate.",
    brief: "A Python library published on PyPI that",
    keywords: ["python", "data"],
    tips: [
      {
        title: "Keep the install and import names the same",
        body: "scikit-learn imports as sklearn and beautifulsoup4 as bs4. It works, but it confuses every new user. Match them if you can.",
      },
      {
        title: "Normalization matters",
        body: "PyPI normalizes names, so My_Package, my-package and my.package are the same project.",
      },
      {
        title: "Lowercase and short",
        body: "PEP 8 asks for short, all-lowercase module names. requests and pandas are good models.",
      },
      {
        title: "Check conda-forge too",
        body: "If your users are in data science, a conda-forge package with the same name will confuse installs.",
      },
    ],
    examples: [
      { name: "requests", why: "A plain English word that says exactly what the library sends." },
      { name: "pandas", why: "Derived from \"panel data\", and easy to remember as an animal." },
      { name: "NumPy", why: "Numeric Python, shortened into something you can say." },
      { name: "Pydantic", why: "A pun on pedantic, which is exactly what strict validation is." },
    ],
    checks: ["PyPI (normalized)", "GitHub", "npm (for JS bindings)", "Domain for docs"],
    faq: [
      {
        q: "Are PyPI names case-sensitive?",
        a: "No. PyPI normalizes names by lowercasing them and treating runs of hyphens, underscores and dots as the same, so check every variant.",
      },
    ],
  },
  {
    slug: "ai-startup",
    keyword: "AI startup name generator",
    h1: "Name your AI startup",
    description:
      "Brandable AI startup names that aren't another -ly or -GPT, with an available .ai or .com and live collision checks. Free, no signup.",
    intro:
      "Thousands of AI products launched with names ending in -AI or -GPT, and most are now indistinguishable. Vocari generates distinctive names, checks .ai, .com and other TLDs live, and flags names already crowded on the App Store or the web.",
    brief: "An AI product that",
    keywords: ["ai", "assistant"],
    tips: [
      {
        title: "Don't put the model in the name",
        body: "OpenAI's brand guidelines ask builders not to use \"GPT\" in product names, and model names change. A name that outlives the model is worth more.",
      },
      {
        title: "Skip the -AI suffix",
        body: "Everyone has it. If the domain is .ai, the name doesn't need to say it again.",
      },
      {
        title: "Check the .ai renewal",
        body: ".ai domains usually cost much more than .com, and the renewal price is what you pay every year after.",
      },
      {
        title: "Real words work",
        body: "Cursor and Perplexity are ordinary words with a clear link to what the product does.",
      },
    ],
    examples: [
      { name: "Cursor", why: "The thing every developer stares at, used for an AI code editor." },
      { name: "Perplexity", why: "The feeling you have before you get an answer, for an answer engine." },
      { name: "Replicate", why: "A verb that describes running and copying models." },
      { name: "Hugging Face", why: "Named after the emoji, which made a technical company feel friendly." },
    ],
    checks: [".ai and .com with renewal price", "App Store collisions", "X and GitHub handles", "US trademark screen"],
    faq: [
      {
        q: "Is a .ai domain worth it?",
        a: "It signals AI clearly and is widely recognized, but it costs more to register and renew than .com. Vocari shows both prices so you can decide.",
      },
    ],
  },
  {
    slug: "mobile-app",
    keyword: "app name generator",
    h1: "Name your mobile app",
    description:
      "App names that are free on the App Store, with an available domain and social handles checked. Free, no signup.",
    intro:
      "The App Store requires app names to be unique and caps them at 30 characters, and a crowded name buries you in search. Vocari checks each candidate against live App Store results, the domain registries and the social handles you'll need for launch.",
    brief: "A mobile app that helps people",
    keywords: ["mobile", "daily"],
    appType: "mobile",
    tips: [
      {
        title: "Your name plus a subtitle",
        body: "Keep the name short and put keywords in the subtitle. \"Headspace: Meditation & Sleep\" ranks for both without an awkward name.",
      },
      {
        title: "Check the App Store first",
        body: "If an established app has the name, you'll lose the search, and Apple may reject a confusingly similar one.",
      },
      {
        title: "Look at the icon test",
        body: "Under the icon, iOS shows roughly a dozen characters. Longer names get cut off on the home screen.",
      },
      {
        title: "Get Instagram and TikTok",
        body: "Consumer apps grow on social. Check the handles before you commit, not after launch.",
      },
    ],
    examples: [
      { name: "Duolingo", why: "\"Duo\" plus \"lingo\": two short roots that say what it does and still feel playful." },
      { name: "Strava", why: "From the Swedish for \"strive\", a real word turned into a distinctive brand." },
      { name: "Headspace", why: "A common phrase that became the name for a meditation app." },
      { name: "Calm", why: "One word, one feeling, and it fits under any icon." },
    ],
    checks: ["App Store collisions", "Instagram, TikTok and X handles", "Domain", "US trademark screen"],
    faq: [
      {
        q: "How long can an App Store name be?",
        a: "Up to 30 characters, and names must be unique on the store. Only roughly a dozen characters show under the home-screen icon, so shorter is better.",
      },
    ],
  },
  {
    slug: "rust-crate",
    keyword: "Rust crate name generator",
    h1: "Name your Rust crate",
    description:
      "Find a crates.io name that's free, with the matching GitHub handle and domain checked. Free, no signup.",
    intro:
      "crates.io has a flat, first-come namespace, so good crate names go fast. Vocari checks crates.io, GitHub, npm and PyPI (for bindings) and the domain for every candidate.",
    brief: "A Rust crate that",
    keywords: ["rust", "fast"],
    tips: [
      {
        title: "Short and snake-case friendly",
        body: "Crate names become identifiers in `use` statements. serde, tokio and clap are short and read well in code.",
      },
      {
        title: "Hyphens become underscores",
        body: "A crate named my-crate is imported as my_crate. Pick something that reads well both ways.",
      },
      {
        title: "Plan for the family",
        body: "Popular crates grow companions (tokio-util, serde_json). Pick a root that takes suffixes well.",
      },
      {
        title: "Grab the bindings too",
        body: "If you'll ship Python or JS bindings, check PyPI and npm now.",
      },
    ],
    examples: [
      { name: "serde", why: "SERialize and DEserialize, fused into two syllables." },
      { name: "clap", why: "Command Line Argument Parser, and a real word that's easy to remember." },
      { name: "tokio", why: "Short, distinctive and easy to type in every async file." },
      { name: "ripgrep", why: "Says what it does (rips through files with grep) and shortens to rg." },
    ],
    checks: ["crates.io", "GitHub", "PyPI and npm (bindings)", "Domain"],
    faq: [
      {
        q: "Does crates.io have namespaces?",
        a: "Not in the way npm scopes work: names are first-come and global, which is why checking early matters.",
      },
    ],
  },
  {
    slug: "side-project",
    keyword: "side project name generator",
    h1: "Name your side project",
    description:
      "Quick, brandable names for indie and side projects with a cheap domain that's actually available. Free, no signup.",
    intro:
      "A side project needs a name before the weekend is over, not a branding agency. Describe it in a sentence and Vocari returns names with registerable domains, first-year and renewal prices, and a shortlist you can send a friend.",
    brief: "A weekend side project that",
    keywords: ["indie", "simple"],
    tips: [
      {
        title: "Don't overspend on the domain",
        body: "Check the renewal price, not just the first year. A $2 domain that renews at $40 adds up across ten projects.",
      },
      {
        title: "Leave room to grow",
        body: "A name that only describes today's feature gets awkward if the project turns into a product.",
      },
      {
        title: "Share the shortlist",
        body: "Send two or three options to friends. The one they remember a day later is usually the winner.",
      },
      {
        title: "Check the handles you'll post from",
        body: "If you plan to build in public, grab the X or Bluesky handle with the domain.",
      },
    ],
    examples: [
      { name: "Gumroad", why: "Playful and easy to remember, and it started as a side project." },
      { name: "Pinboard", why: "A real object that describes bookmarks, by a solo founder." },
      { name: "Carrd", why: "A misspelled real word that got a short, available name for one-page sites." },
      { name: "Plausible", why: "A real word that sums up the pitch for privacy-friendly analytics." },
    ],
    checks: ["Domain with renewal price", "X and Bluesky handles", "GitHub", "Shortlist to share"],
    faq: [
      {
        q: "What's the cheapest domain for a side project?",
        a: "It depends on the TLD and the registrar, and renewal prices vary a lot. Vocari shows first-year and renewal prices and links to several registrars so you can compare.",
      },
    ],
  },
];

export interface ComparePage {
  slug: string;
  rival: string;
  rivalUrl: string;
  h1: string;
  description: string;
  summary: string;
  rows: { label: string; vocari: string; rival: string }[];
  chooseVocari: string[];
  chooseRival: string[];
}

export const COMPARE_PAGES: ComparePage[] = [
  {
    slug: "namelix",
    rival: "Namelix",
    rivalUrl: "https://namelix.com/",
    h1: "Vocari vs Namelix",
    description:
      "A Namelix alternative for developers: Vocari only shows names whose domain is available and checks App Store, npm, PyPI and handles. Honest comparison.",
    summary:
      "Namelix, from the makers of Brandmark, is one of the most popular AI name generators and is great for fast, brandable inspiration and a logo. Vocari starts from the domain instead: it only shows names you can register right now, and adds developer collision checks.",
    rows: [
      { label: "Only shows names with an available domain", vocari: "Yes, checked live against each registry", rival: "Suggests names first; you check domains per name" },
      { label: "App Store, npm, PyPI collision screen", vocari: "Yes", rival: "Not advertised" },
      { label: "Social handles and trademark check", vocari: "GitHub, npm, Docker, Bluesky and more; USPTO screen", rival: "Not advertised" },
      { label: "Logo maker", vocari: "No (links to a partner)", rival: "Yes, through Brandmark" },
      { label: "Registrar", vocari: "Neutral, with price compare", rival: "Links out to registrars" },
      { label: "Price", vocari: "Free, no signup", rival: "Free to generate; logos are paid" },
    ],
    chooseVocari: [
      "You're naming a developer product and need the domain, repo and package names free.",
      "You're tired of shortlisting names only to find the .com taken.",
      "You want renewal prices and several registrars side by side.",
    ],
    chooseRival: [
      "You want a big volume of brandable ideas quickly.",
      "You want a logo generated from the name in the same place.",
    ],
  },
  {
    slug: "godaddy",
    rival: "GoDaddy's business name generator",
    rivalUrl: "https://www.godaddy.com/business-name-generator",
    h1: "Vocari vs GoDaddy's name generator",
    description:
      "Comparing Vocari with GoDaddy's AI business name generator for developer products: registrar choice, collision checks and renewal prices.",
    summary:
      "GoDaddy's AI generator (part of Airo) also shows only names with an available domain and checks social handles, and it's tied into GoDaddy's domains, websites and email. Vocari is registrar-neutral and built for developer products, with App Store, npm and PyPI collision checks and a judge that ranks names on how crowded they are.",
    rows: [
      { label: "Only shows names with an available domain", vocari: "Yes, via each registry's RDAP", rival: "Yes, from GoDaddy's inventory" },
      { label: "Where you register", vocari: "Your choice: Spaceship, Porkbun, Namecheap, Dynadot, Cloudflare", rival: "GoDaddy" },
      { label: "Developer collisions (npm, PyPI, App Store)", vocari: "Yes", rival: "Not advertised" },
      { label: "Social handles", vocari: "Yes, plus GitHub, npm, Docker Hub", rival: "Yes" },
      { label: "Website builder, email, LLC", vocari: "Links to partners", rival: "Built in" },
    ],
    chooseVocari: [
      "You want to compare registrars and renewal prices before buying.",
      "You're naming software and care about GitHub, npm and App Store collisions.",
    ],
    chooseRival: [
      "You want the domain, website, email and business setup from one company.",
      "You're naming a local or non-software business.",
    ],
  },
  {
    slug: "namemy-app",
    rival: "namemy.app",
    rivalUrl: "https://namemy.app/",
    h1: "Vocari vs namemy.app",
    description:
      "Vocari and namemy.app both pre-check domains before suggesting names. How they differ on price, checks and developer features.",
    summary:
      "namemy.app is the closest tool to Vocari: it's availability-first and pre-screens suggestions for domains and trademarks. It sells a one-time paid pack and offers an API, CLI and MCP server. Vocari is free with no signup, and adds App Store, npm and PyPI collision checks, a keyword graph you can steer, and registrar price comparison.",
    rows: [
      { label: "Only shows names with an available domain", vocari: "Yes", rival: "Yes" },
      { label: "Trademark screen", vocari: "USPTO screen in the handles & trademarks panel", rival: "Yes, pre-screened" },
      { label: "App Store, npm, PyPI collisions", vocari: "Yes", rival: "Not advertised" },
      { label: "API / CLI / MCP", vocari: "Not yet", rival: "Yes" },
      { label: "Price", vocari: "Free, no signup", rival: "Paid one-time pack ($99 Launch Stack)" },
    ],
    chooseVocari: [
      "You want everything free, without an account.",
      "You're naming an app or package and need App Store, npm and PyPI collisions checked.",
      "You want to steer generation through a keyword graph and \"more like this\".",
    ],
    chooseRival: [
      "You want an API, CLI or MCP server for naming inside your own tools today.",
      "You prefer trademark screening built into every suggestion.",
    ],
  },
];

export const namePage = (slug: string) => NAME_PAGES.find((p) => p.slug === slug);
export const comparePage = (slug: string) => COMPARE_PAGES.find((p) => p.slug === slug);
