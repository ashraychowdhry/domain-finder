// Registrar outbound links — affiliate-ready.
//
// Affiliate networks (Impact/CJ/in-house) require their WRAPPED tracking
// links, not raw query params. Each slot takes an optional NEXT_PUBLIC_AFF_*
// template containing "{url}" (the encoded deep link); when unset, links go
// direct, so the product works identically before/after program approval.
// Porkbun's affiliate program is discontinued — Spaceship (one Impact program,
// usually the cheapest .com) is the primary checkout; Porkbun stays as a
// price-compare option. Commissions never change the user's price.
//
// Spaceship is LIVE: the partner tracking links below are baked in (account
// 7412606, same as the Impact tag in layout.tsx) so revenue is captured on
// deploy, and are env-overridable. Spaceship runs ONE program — Impact sets
// the rate by what the referred customer buys: ~25% on domain registrations,
// ~50% on email/Spacemail + hosting. We point each CTA at the matching
// product creative (deep-linking confirmed enabled) so domain vs email report
// separately; steering intent to email (see emailCheckout) earns roughly ~2x.

export interface RegistrarLink {
  name: string;
  href: string;
}

// Affiliate wrapping. Two shapes are supported per env slot:
//   - a deep-link TEMPLATE containing "{url}" (registrars — destination
//     varies per domain): the encoded destination is substituted in.
//   - a full fixed affiliate URL with no "{url}" (logo/LLC/etc. — one
//     landing page): used verbatim.
// Unset → the plain direct URL, so every link works before any program
// is approved and commissions never change the user's price.
const wrap = (template: string | undefined, url: string) =>
  !template
    ? url
    : template.includes("{url}")
      ? template.replace("{url}", encodeURIComponent(url))
      : template;

// ── Spaceship (Impact) ──────────────────────────────────────────────────
// Tracking links are /c/<account>/<adId>/<campaign>. Account 7412606 and
// campaign 21274 (the media property) come from the issued link; the ad ID
// selects the creative. We use the per-product ads that are confirmed
// "Deeplinking: Supported" in the Impact dashboard:
//   2873271 — "Search for a domain name"  → domain checkout (~25% tier)
//   2386994 — "Spaceship Email Hosting"    → Spacemail / email (~50% tier)
// Each base is a *bare* tracking link (no "{url}"); spaceship() appends the
// encoded ?u= deep link. Override either via env to swap creatives/campaign.
const SPACESHIP = "https://spaceship.sjv.io/c/7412606"; // + /<adId>/21274
const SPACESHIP_DOMAIN_LINK =
  process.env.NEXT_PUBLIC_AFF_SPACESHIP || `${SPACESHIP}/2873271/21274`;
const SPACESHIP_EMAIL_LINK =
  process.env.NEXT_PUBLIC_AFF_SPACESHIP_EMAIL || `${SPACESHIP}/2386994/21274`;

// Deep-linking is enabled for these ads (verified) + spaceship.com is allow-
// listed, so ?u=<encoded dest> lands on the exact page (domain search /
// Spacemail) and attributes server-side at the redirect — surviving ad-blockers
// that break the on-page tag. If that's ever turned off (a ?u= link would then
// dead-end on a generic impact.com page), set NEXT_PUBLIC_AFF_SPACESHIP_DIRECT=1
// to emit the raw spaceship.com link instead and let the on-page Impact tag
// (transformLinks) attribute it, so a click never dead-ends.
const SPACESHIP_DIRECT = process.env.NEXT_PUBLIC_AFF_SPACESHIP_DIRECT === "1";

// Spacemail (business email) product page — #plans jumps straight to pricing
// (from $0.59/mo).
const SPACEMAIL_URL = "https://www.spaceship.com/business-email/#plans";

/**
 * Build a tracked Spaceship deep link from a base tracking link to `dest`.
 * `subId1` tags the click in Impact reports and never affects payout. In
 * DIRECT mode we return the raw destination so the page's Impact tag tracks it.
 */
function spaceship(base: string, dest: string, subId1: string): string {
  if (SPACESHIP_DIRECT) return dest;
  const sep = base.includes("?") ? "&" : "?";
  // subId1 is a short literal; the destination is the LAST param and the only
  // thing encoded — keeps the ?u= deep link correctly single-encoded.
  return `${base}${sep}subId1=${subId1}&u=${encodeURIComponent(dest)}`;
}

/** Where an available-domain badge sends the user (~25% commission tier). */
export function primaryCheckout(domain: string): RegistrarLink {
  const url = `https://www.spaceship.com/domain-search/?query=${domain}&tab=domains`;
  return {
    name: "Spaceship",
    href: spaceship(SPACESHIP_DOMAIN_LINK, url, "domain"),
  };
}

/**
 * The higher-commission upsell: professional email at the user's new domain
 * (Spaceship's Spacemail, ~50% tier — roughly double the domain rate). Same
 * Impact program as the domain checkout, on the email creative for clean
 * reporting; Impact pays out on whatever the customer buys.
 */
export function emailCheckout(): RegistrarLink {
  return {
    name: "Spacemail",
    href: spaceship(SPACESHIP_EMAIL_LINK, SPACEMAIL_URL, "email"),
  };
}

/** Secondary price-compare links. */
export function compareLinks(domain: string): RegistrarLink[] {
  return [
    {
      name: "Porkbun",
      href: `https://porkbun.com/checkout/search?q=${domain}`,
    },
    {
      name: "Namecheap",
      href: wrap(
        process.env.NEXT_PUBLIC_AFF_NAMECHEAP,
        `https://www.namecheap.com/domains/registration/results/?domain=${domain}`,
      ),
    },
    {
      name: "Dynadot",
      href: wrap(
        process.env.NEXT_PUBLIC_AFF_DYNADOT,
        `https://www.dynadot.com/domain/search?domain=${domain}`,
      ),
    },
  ];
}

/** Optional "now deploy it" upsell — hidden until a partner URL is set. */
export function deployLink(): RegistrarLink | null {
  const href = process.env.NEXT_PUBLIC_DEPLOY_AFF_URL;
  if (!href) return null;
  return { name: process.env.NEXT_PUBLIC_DEPLOY_AFF_LABEL ?? "Railway", href };
}

export interface NextStep {
  /** The action, e.g. "Design a logo". */
  label: string;
  /** The partner, e.g. "Looka". */
  name: string;
  href: string;
}

/**
 * The "you just named it — now you need X" funnel: the highest-intent moment
 * to surface a logo maker, business formation, trademark filing, and hosting.
 * Each goes through its affiliate template when set (NEXT_PUBLIC_AFF_*), and
 * direct otherwise — so the row is genuinely useful from day one and becomes
 * revenue the moment a program is approved. Links never change the price.
 */
export function nextSteps(): NextStep[] {
  const steps: NextStep[] = [
    {
      label: "Design a logo",
      name: "LogoAI",
      href: wrap(process.env.NEXT_PUBLIC_AFF_LOGOAI, "https://www.logoai.com/"),
    },
    {
      label: "Form an LLC",
      name: "Northwest",
      href: wrap(
        process.env.NEXT_PUBLIC_AFF_NORTHWEST,
        "https://www.northwestregisteredagent.com/llc",
      ),
    },
    {
      label: "File a trademark",
      name: "Trademark Engine",
      href: wrap(
        process.env.NEXT_PUBLIC_AFF_TRADEMARK,
        "https://www.trademarkengine.com/trademark-search",
      ),
    },
  ];
  const deploy = deployLink();
  if (deploy) steps.push({ label: "Deploy it", name: deploy.name, href: deploy.href });
  return steps;
}
