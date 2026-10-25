// Social links, postal address and the unsubscribe line for the
// "house style" CRM emails (purple/gold, cream footer). The newer
// newsletter/event design draws the same three things itself — see
// footer() in utils/newsletter/newsletter-template.ts — so every
// tenant email ends the same way whichever layout it uses.

import { socialLinksHtml } from './social-icons';

export interface FooterExtras {
  socialLinks?: { label: string; url: string; key?: string }[];
  address?: string;
  // Present for a real recipient; omitted where a link would be
  // meaningless (portal copies).
  unsubscribeUrl?: string | null;
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const http = (u: unknown) => {
  const v = String(u ?? '').trim();
  return /^https?:\/\//i.test(v) ? v : '';
};

export function footerExtrasHtml(x?: FooterExtras | null): string {
  if (!x) return '';
  const links = (x.socialLinks ?? []).filter((l) => l?.label && http(l.url));
  const parts: string[] = [];
  if (links.length) {
    parts.push(
      socialLinksHtml(links, {
        href: http,
        textColor: '#4B0082',
        font: 'font-family:Arial,sans-serif;',
        margin: '0 0 12px',
      }),
    );
  }
  if (x.address) {
    parts.push(
      `<p style="margin:0 0 10px;font-size:11px;color:#999999;line-height:1.6;font-family:Arial,sans-serif;text-align:center;">${esc(x.address)}</p>`,
    );
  }
  if (http(x.unsubscribeUrl)) {
    parts.push(
      `<p style="margin:0 0 10px;font-size:11px;color:#999999;line-height:1.6;font-family:Arial,sans-serif;text-align:center;">Don&rsquo;t want these emails? <a href="${esc(http(x.unsubscribeUrl))}" style="color:#4B0082;text-decoration:underline;">Unsubscribe</a></p>`,
    );
  }
  return parts.join('\n              ');
}
