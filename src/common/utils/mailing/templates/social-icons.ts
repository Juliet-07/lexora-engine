// The social links at the bottom of every tenant email, drawn as
// round brand-coloured icons (LinkedIn blue, X black, Facebook blue,
// Instagram gradient, YouTube red, a violet globe for the website).
//
// Email clients strip inline SVG and block data: URIs, so the icons
// are ordinary PNG files, served from the tenant app's own public
// folder (lexora-tenant/public/social/<key>.png) — the same origin
// as the unsubscribe page, which every deployment already has to
// have reachable for the emails to work. If that URL isn't known, or
// a link has no icon, the link falls back to a plain text link so a
// footer never loses a link.

export interface SocialLink {
  label: string;
  url: string;
  // website | linkedin | x | facebook | instagram | youtube
  key?: string;
}

const KEY_BY_LABEL: Record<string, string> = {
  website: 'website',
  linkedin: 'linkedin',
  x: 'x',
  facebook: 'facebook',
  instagram: 'instagram',
  youtube: 'youtube',
};

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function iconBaseUrl(): string {
  return String(process.env.TENANT_APP_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
}

export function socialIconUrl(link: SocialLink): string {
  const base = iconBaseUrl();
  const key = link.key ?? KEY_BY_LABEL[String(link.label ?? '').toLowerCase()];
  if (!base || !key || !(key in KEY_BY_LABEL)) return '';
  return `${base}/social/${key}.png`;
}

// `textColor` / `font` only matter for the text fallback and for the
// alt text shown while images are blocked.
export function socialLinksHtml(
  links: SocialLink[],
  opts: {
    href: (url: string) => string; // sanitiser — returns '' / '#' when unsafe
    textColor: string;
    font: string;
    margin?: string;
  },
): string {
  const items = links
    .map((l) => ({ l, href: opts.href(l.url) }))
    .filter((x) => x.l?.label && x.href && x.href !== '#');
  if (!items.length) return '';
  const cells = items.map(({ l, href }) => {
    const icon = socialIconUrl(l);
    return icon
      ? `<a href="${esc(href)}" target="_blank" title="${esc(l.label)}" style="display:inline-block;margin:0 5px;text-decoration:none;"><img src="${esc(icon)}" width="32" height="32" alt="${esc(l.label)}" style="display:block;width:32px;height:32px;border:0;border-radius:50%;font-size:11px;color:${opts.textColor};${opts.font}"></a>`
      : `<a href="${esc(href)}" style="display:inline-block;margin:0 6px;color:${opts.textColor};font-weight:700;font-size:12px;text-decoration:none;${opts.font}">${esc(l.label)}</a>`;
  });
  return `<div style="margin:${opts.margin ?? '14px 0 8px'};text-align:center;font-size:0;line-height:0;">${cells.join('')}</div>`;
}
