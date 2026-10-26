// The social links at the bottom of every tenant email, drawn as
// round brand-coloured icons (LinkedIn blue, X black, Facebook blue,
// Instagram gradient, YouTube red, a violet globe for the website).
//
// The icons are embedded in the engine, not fetched from a URL — an
// icon hosted on the tenant app breaks whenever that host isn't
// public (localhost, an undeployed build, a firewalled staging
// site) and email clients block remote images by default anyway.
//
//   • In any HTML a browser shows (composer previews, the portal copy
//     of a newsletter) the image is a data: URI, so it always draws.
//   • Gmail and most clients refuse data: URIs, so just before an
//     email goes out EmailService turns each embedded icon into an
//     inline attachment (cid:) — see inlineSocialIcons(). The reader
//     sees the icon with no "load images" prompt and no external
//     request.

import { SOCIAL_ICON_PNG_BASE64 } from './social-icon-data';

export interface SocialLink {
  label: string;
  url: string;
  // website | linkedin | x | facebook | instagram | youtube
  key?: string;
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const keyOf = (l: SocialLink): string => {
  const k = String(l.key ?? l.label ?? '').toLowerCase();
  return k in SOCIAL_ICON_PNG_BASE64 ? k : '';
};

const dataUri = (key: string) =>
  `data:image/png;base64,${SOCIAL_ICON_PNG_BASE64[key]}`;

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
    const key = keyOf(l);
    return key
      ? `<a href="${esc(href)}" target="_blank" title="${esc(l.label)}" style="display:inline-block;margin:0 5px;text-decoration:none;"><img src="${dataUri(key)}" width="32" height="32" alt="${esc(l.label)}" style="display:block;width:32px;height:32px;border:0;border-radius:50%;font-size:11px;color:${opts.textColor};${opts.font}"></a>`
      : `<a href="${esc(href)}" style="display:inline-block;margin:0 6px;color:${opts.textColor};font-weight:700;font-size:12px;text-decoration:none;${opts.font}">${esc(l.label)}</a>`;
  });
  return `<div style="margin:${opts.margin ?? '14px 0 8px'};text-align:center;font-size:0;line-height:0;">${cells.join('')}</div>`;
}

// Swap each embedded icon for a cid: reference and return the inline
// attachments that carry them. Safe to call on any HTML (returns it
// unchanged, with no attachments, when no icon is present).
export function inlineSocialIcons(html: string): {
  html: string;
  attachments: {
    filename: string;
    content: Buffer;
    cid: string;
    contentType: string;
    contentDisposition: 'inline';
  }[];
} {
  let out = String(html ?? '');
  const attachments: ReturnType<typeof inlineSocialIcons>['attachments'] = [];
  for (const key of Object.keys(SOCIAL_ICON_PNG_BASE64)) {
    const uri = dataUri(key);
    if (!out.includes(uri)) continue;
    const cid = `lexora-social-${key}@lexora`;
    out = out.split(uri).join(`cid:${cid}`);
    attachments.push({
      filename: `${key}.png`,
      content: Buffer.from(SOCIAL_ICON_PNG_BASE64[key], 'base64'),
      cid,
      contentType: 'image/png',
      contentDisposition: 'inline',
    });
  }
  return { html: out, attachments };
}
