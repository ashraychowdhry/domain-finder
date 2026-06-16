// Registrar outbound links — affiliate-ready.
//
// Affiliate networks (Impact/CJ/in-house) require their WRAPPED tracking
// links, not raw query params. Each slot takes an optional NEXT_PUBLIC_AFF_*
// template containing "{url}" (the encoded deep link); when unset, links go
// direct, so the product works identically before/after program approval.
// Porkbun's affiliate program is discontinued — Spaceship (25%+ program,
// usually the cheapest .com) is the primary checkout; Porkbun stays as a
// price-compare option. Commissions never change the user's price.

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

/** Where an available-domain badge sends the user. */
export function primaryCheckout(domain: string): RegistrarLink {
  const url = `https://www.spaceship.com/domain-search/?query=${domain}&tab=domains`;
  return {
    name: "Spaceship",
    href: wrap(process.env.NEXT_PUBLIC_AFF_SPACESHIP, url),
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
