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

const wrap = (template: string | undefined, url: string) =>
  template?.includes("{url}")
    ? template.replace("{url}", encodeURIComponent(url))
    : url;

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
