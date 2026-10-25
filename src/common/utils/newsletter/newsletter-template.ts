import { BadRequestException } from '@nestjs/common';
import { socialLinksHtml } from '../mailing/templates/social-icons';

// ─────────────────────────────────────────────────────────────────
// Shared newsletter templates — used by BOTH the platform-level
// SuperAdmin newsletter (sent to public website subscribers, branded
// "Lexora") and each tenant's own CRM → Tools → Newsletter (sent to
// that tenant's clients / contacts / board members, branded with the
// tenant's own business name). One set of designs, one renderer, so
// the two can never drift apart.
//
// The supplied reference designs used CSS flexbox throughout (a
// template *picker* UI, not an email) — flexbox isn't reliably
// supported by real mail clients (Outlook's Word rendering engine in
// particular). These renderers reproduce the same visual design
// (colours, spacing, typography) using nested <table> layout and
// inline styles, the only layout approach that survives every major
// mail client.
//
// Two output modes:
//   - 'email'    a complete HTML document, ready for SMTP.
//   - 'fragment' just the outer 640px table — what the client and
//                board portals inject into their page, so a template
//                newsletter reads the same in the portal as it did in
//                the inbox.
// ─────────────────────────────────────────────────────────────────

export enum NewsletterTemplate {
  REGULATORY_ALERT = 'RegulatoryAlert',
  QUARTERLY_ROUNDUP = 'QuarterlyRoundup',
  ARTICLE_SPOTLIGHT = 'ArticleSpotlight',
  EVENT_INVITE = 'EventInvite',
}

export const NEWSLETTER_TEMPLATES: NewsletterTemplate[] =
  Object.values(NewsletterTemplate);

export interface NewsletterBrand {
  // Text shown in the header wordmark and the document <title>.
  headerText: string;
  // Footer lines, plain text (escaped when rendered).
  footerLines: string[];
  // When present, an "Unsubscribe" link is rendered in the footer.
  // The super-admin newsletter (public website subscribers) and the
  // tenant newsletters (each recipient gets their own signed link —
  // see EmailFooterService) both use it; the portal fragment never
  // does, since a portal reader isn't being emailed.
  unsubscribeUrl?: string | null;
  // Tenant social links shown above the unsubscribe line. Only links
  // with a real http(s) URL are rendered.
  socialLinks?: { label: string; url: string; key?: string }[];
  // Postal address line, shown under the links when set.
  address?: string;
}

const COLORS = {
  accent: '#5b4bff',
  accentDark: '#4636c9',
  ink: '#181229',
  inkSoft: '#4a4560',
  soft: '#8b87a0',
  line: '#e6e4f0',
  paper: '#f3f1f9',
  red: '#c0392b',
  redBg: '#fdecea',
};

const FONT = "font-family:'Inter',Arial,Helvetica,sans-serif;";

// Escapes for both text nodes and double/single-quoted attributes.
const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Multi-line free text: escape first, then keep the author's line
// breaks (a textarea's newlines would otherwise collapse to nothing).
const multiline = (s: unknown) => esc(s).replace(/\r?\n/g, '<br/>');

// Only http(s), mailto and tel links survive — anything else
// (javascript:, data:, …) becomes an inert '#'. Tenant-authored
// content is shown to the tenant's own clients and board, so a link
// must never be able to run script.
const safeUrl = (u: unknown) => {
  const v = String(u ?? '').trim();
  return /^(https?:\/\/|mailto:|tel:)/i.test(v) ? v : '#';
};

// Images are http(s) only.
const safeImageUrl = (u: unknown) => {
  const v = String(u ?? '').trim();
  return /^https?:\/\//i.test(v) ? v : '';
};

function ctaButton(label: string, url: string, secondary = false) {
  const look = secondary
    ? `background:#ffffff;color:${COLORS.accent};border:1.5px solid ${COLORS.accent};padding:11.5px 26.5px;`
    : `background:${COLORS.accent};color:#ffffff;padding:13px 28px;`;
  return `<a href="${esc(safeUrl(url))}" style="display:inline-block;${look}font-weight:700;font-size:13.5px;border-radius:7px;text-decoration:none;margin:4px 5px;${FONT}">${esc(label)}</a>`;
}

// A plain <img> inside a table cell is safe in every mail client.
// Renders nothing when the campaign doesn't have one. GIFs pass
// through untouched (mail clients play them natively).
function imageRow(imageUrl: string | undefined, imageAlt: string | undefined) {
  const src = safeImageUrl(imageUrl);
  if (!src) return '';
  return `<tr><td style="padding:0;line-height:0;font-size:0;">
    <img src="${esc(src)}" alt="${esc(imageAlt || '')}" width="640" style="display:block;width:100%;max-width:640px;height:auto;border:0;outline:none;" />
  </td></tr>`;
}

function header(brand: NewsletterBrand) {
  return `
  <tr><td style="padding:22px 36px 18px;text-align:center;border-bottom:1px solid ${COLORS.line};">
    <span style="font-weight:800;font-size:18px;letter-spacing:.06em;color:${COLORS.ink};${FONT}">${esc(brand.headerText)}</span>
  </td></tr>`;
}

function footer(brand: NewsletterBrand) {
  const lines = brand.footerLines
    .filter(Boolean)
    .map(
      (l, i) =>
        `<p style="font-size:11px;color:${COLORS.soft};line-height:1.7;margin:3px 0;${FONT}">${i === 0 ? `<b style="color:${COLORS.ink};">${esc(l)}</b>` : esc(l)}</p>`,
    )
    .join('');
  const socialHtml = socialLinksHtml(brand.socialLinks ?? [], {
    href: safeUrl,
    textColor: COLORS.accent,
    font: FONT,
  });
  const addressHtml = brand.address
    ? `<p style="font-size:11px;color:${COLORS.soft};line-height:1.7;margin:3px 0;${FONT}">${esc(brand.address)}</p>`
    : '';
  const unsub = brand.unsubscribeUrl
    ? `<p style="font-size:11px;color:${COLORS.soft};line-height:1.7;margin:8px 0 3px;${FONT}">Don&rsquo;t want these emails? <a href="${esc(safeUrl(brand.unsubscribeUrl))}" style="color:${COLORS.accent};text-decoration:underline;">Unsubscribe</a></p>`
    : '';
  return `
  <tr><td style="padding:26px 36px 32px;text-align:center;border-top:1px solid ${COLORS.line};background:#fbfaff;">
    ${lines}
    ${socialHtml}
    ${addressHtml}
    ${unsub}
  </td></tr>`;
}

type Mode = 'email' | 'fragment';

function wrap(
  bodyRows: string,
  previewText: string,
  brand: NewsletterBrand,
  mode: Mode,
) {
  const card = `<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border:1px solid ${COLORS.line};border-radius:10px;overflow:hidden;margin:0 auto;">
        ${bodyRows}
        ${footer(brand)}
      </table>`;

  if (mode === 'fragment') {
    return `<div style="background:#f7f6fb;padding:20px 8px;${FONT}">${card}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(brand.headerText)}</title>
</head>
<body style="margin:0;background:#f7f6fb;${FONT}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(previewText)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6fb;">
    <tr><td align="center" style="padding:24px 12px;">
      ${card}
    </td></tr>
  </table>
</body>
</html>`;
}

function renderRegulatoryAlert(
  data: Record<string, any>,
  previewText: string,
  brand: NewsletterBrand,
  mode: Mode,
) {
  const checklist: string[] = Array.isArray(data.checklist)
    ? data.checklist.filter((x: unknown) => String(x ?? '').trim())
    : [];
  const checklistHtml = checklist
    .map(
      (item) =>
        `<tr><td style="padding:0 0 10px;font-size:13.5px;line-height:1.6;color:${COLORS.inkSoft};${FONT}"><span style="color:${COLORS.red};font-weight:800;">&mdash;&nbsp;</span>${esc(item)}</td></tr>`,
    )
    .join('');

  const body = `
  <tr><td style="background:${COLORS.red};color:#ffffff;text-align:center;padding:9px;font-size:11.5px;font-weight:800;letter-spacing:.08em;${FONT}">&#9888; URGENT &mdash; REGULATORY ALERT</td></tr>
  ${header(brand)}
  ${imageRow(data.imageUrl, data.imageAlt)}
  <tr><td style="padding:30px 36px 10px;">
    ${data.refTag ? `<span style="display:inline-block;font-family:'SF Mono','Courier New',monospace;font-size:10px;letter-spacing:.03em;color:${COLORS.soft};background:#f1f0f7;border-radius:4px;padding:2px 7px;margin-bottom:8px;">${esc(data.refTag)}</span><br/>` : ''}
    <span style="font-size:21px;line-height:1.3;font-weight:700;color:${COLORS.ink};${FONT}">${esc(data.heading)}</span>
    <div style="font-size:13px;color:${COLORS.soft};margin:6px 0 20px;${FONT}">${esc(data.subtext)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.redBg};border-radius:0 8px 8px 0;margin-bottom:20px;">
      <tr><td style="border-left:4px solid ${COLORS.red};padding:16px 18px;font-size:13.5px;line-height:1.7;color:${COLORS.inkSoft};${FONT}">${multiline(data.alertText)}</td></tr>
    </table>
    ${checklistHtml ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">${checklistHtml}</table>` : ''}
    ${data.ctaUrl ? `<div style="text-align:center;padding:6px 0 24px;">${ctaButton(data.ctaLabel || 'Read the full advisory', data.ctaUrl)}</div>` : '<div style="padding-bottom:18px;"></div>'}
    ${data.fineText ? `<div style="font-size:12px;color:${COLORS.soft};text-align:center;padding-bottom:4px;${FONT}">${esc(data.fineText)}</div>` : ''}
  </td></tr>`;

  return wrap(body, previewText, brand, mode);
}

function renderQuarterlyRoundup(
  data: Record<string, any>,
  previewText: string,
  brand: NewsletterBrand,
  mode: Mode,
) {
  const sections: any[] = Array.isArray(data.sections) ? data.sections : [];
  const sectionsHtml = sections
    .map(
      (s) => `
    <tr><td style="padding:18px 36px;border-top:1px solid ${COLORS.line};">
      <div style="font-family:'SF Mono','Courier New',monospace;font-size:10.5px;color:${COLORS.accent};font-weight:700;">${esc(s.num)}</div>
      <div style="font-size:15px;margin:4px 0 6px;font-weight:700;color:${COLORS.ink};${FONT}">${esc(s.heading)}</div>
      <div style="font-size:13px;line-height:1.65;color:${COLORS.inkSoft};margin:0 0 8px;${FONT}">${multiline(s.body)}</div>
      ${s.linkUrl ? `<a href="${esc(safeUrl(s.linkUrl))}" style="font-size:12.5px;color:${COLORS.accent};font-weight:700;text-decoration:none;">${esc(s.linkLabel || 'Read more')} &rarr;</a>` : ''}
    </td></tr>`,
    )
    .join('');

  const blogItems: any[] = Array.isArray(data.blogItems) ? data.blogItems : [];
  const blogHtml = blogItems.length
    ? `<tr><td style="padding:20px 36px;background:${COLORS.paper};">
        <div style="font-size:12px;letter-spacing:.05em;color:${COLORS.soft};margin:0 0 10px;text-transform:uppercase;${FONT}">${esc(data.blogHeading || 'Also from us this quarter')}</div>
        ${blogItems
          .map(
            (b) =>
              `<div style="display:block;font-size:13px;padding:7px 0;border-bottom:1px solid #e6e2f5;${FONT}">
                ${b.url ? `<a href="${esc(safeUrl(b.url))}" style="color:${COLORS.ink};text-decoration:none;font-weight:600;">${esc(b.label)}</a>` : `<span style="font-weight:600;color:${COLORS.ink};">${esc(b.label)}</span>`}
                <span style="color:${COLORS.soft};font-size:12px;float:right;">${esc(b.meta)}</span>
              </div>`,
          )
          .join('')}
      </td></tr>`
    : '';

  const body = `
  <tr><td style="background:${COLORS.ink};background-image:linear-gradient(120deg,#181229,#3a2f7a);color:#ffffff;padding:34px 36px;text-align:center;">
    <div style="font-size:11px;letter-spacing:.12em;color:#b9b0f5;font-weight:700;${FONT}">${esc(data.eyebrow)}</div>
    <div style="font-size:24px;margin:6px 0 0;font-weight:700;${FONT}">${esc(data.heading)}</div>
  </td></tr>
  ${imageRow(data.imageUrl, data.imageAlt)}
  <tr><td style="padding:26px 36px 6px;font-size:13.5px;line-height:1.7;color:${COLORS.inkSoft};${FONT}">${multiline(data.intro)}</td></tr>
  ${sectionsHtml}
  ${blogHtml}`;

  // The hero band replaces the normal wordmark header entirely
  // (matches the reference design).
  return wrap(body, previewText, brand, mode);
}

function renderArticleSpotlight(
  data: Record<string, any>,
  previewText: string,
  brand: NewsletterBrand,
  mode: Mode,
) {
  const moreItems: any[] = Array.isArray(data.moreItems) ? data.moreItems : [];
  const moreHtml = moreItems.length
    ? `<tr><td style="padding:20px 36px 26px;background:${COLORS.paper};">
        <div style="font-size:12px;letter-spacing:.05em;color:${COLORS.soft};margin:0 0 12px;text-transform:uppercase;${FONT}">${esc(data.moreHeading || 'More from the series')}</div>
        ${moreItems
          .map(
            (m) => `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px;">
            <tr>
              <td width="44" style="width:44px;height:44px;border-radius:7px;background:#e3ebfb;"></td>
              <td style="padding-left:12px;font-size:13px;${FONT}">
                <b style="display:block;color:${COLORS.ink};">${esc(m.title)}</b>
                <span style="font-size:11.5px;color:${COLORS.soft};">${esc(m.meta)}</span>
              </td>
            </tr>
          </table>`,
          )
          .join('')}
      </td></tr>`
    : '';

  const body = `
  ${header(brand)}
  <tr><td style="background:${COLORS.accent};background-image:linear-gradient(135deg,#5b4bff,#8b7be0);padding:40px 36px 22px;">
    <span style="background:rgba(255,255,255,.18);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.06em;padding:5px 11px;border-radius:20px;">${esc(data.heroLabel)}</span>
  </td></tr>
  ${imageRow(data.imageUrl, data.imageAlt)}
  <tr><td style="padding:28px 36px 8px;">
    <div style="font-size:11.5px;font-weight:800;letter-spacing:.08em;color:${COLORS.accent};margin-bottom:8px;${FONT}">${esc(data.eyebrow)}</div>
    <div style="font-size:22px;line-height:1.3;font-weight:700;color:${COLORS.ink};margin:0 0 10px;${FONT}">${esc(data.heading)}</div>
    <div style="font-size:12.5px;color:${COLORS.soft};margin-bottom:18px;${FONT}">${esc(data.byline)}</div>
    <p style="font-size:14px;line-height:1.75;color:${COLORS.inkSoft};margin:0 0 20px;${FONT}">${multiline(data.excerpt)}</p>
    ${data.ctaUrl ? `<div style="padding-bottom:26px;">${ctaButton(data.ctaLabel || 'Read the full article', data.ctaUrl)}</div>` : '<div style="padding-bottom:10px;"></div>'}
  </td></tr>
  ${moreHtml}`;

  return wrap(body, previewText, brand, mode);
}

// ── Event email shell ────────────────────────────────────────────
// The Event Invite design, as one reusable layout. The newsletter
// "Event Invite" template (super-admin) and every tenant event email
// (invitation, reminder, registration confirmation, follow-ups,
// cancellation) are all drawn by this, so an event reads the same
// from the first invitation to the last thank-you.
export interface EventMessageOptions {
  brand: NewsletterBrand;
  previewText?: string;
  mode?: Mode;
  banner: {
    day?: string;
    month?: string;
    heading: string;
    sub?: string;
    // 'alert' paints the banner red (cancellations).
    tone?: 'default' | 'alert';
  };
  imageUrl?: string;
  imageAlt?: string;
  // e.g. "Dear Amina," — plain text.
  greeting?: string;
  // Plain text; line breaks are kept.
  paragraphs?: string[];
  infoRows?: { label: string; value: string }[];
  agenda?: { time?: string; label: string }[];
  buttons?: { label: string; url: string; secondary?: boolean }[];
  calendarUrl?: string;
  calendarLabel?: string;
  footnote?: string;
}

export function renderEventMessage(o: EventMessageOptions): string {
  const mode: Mode = o.mode ?? 'email';
  const infoRows = (o.infoRows ?? []).filter((r) => r && r.label && r.value);
  // Up to three facts sit side by side; more than that wrap onto a
  // second line (4 → 2+2, 5 → 3+2) so none gets squeezed.
  const perRow =
    infoRows.length <= 3 ? infoRows.length : Math.ceil(infoRows.length / 2);
  const infoLines: (typeof infoRows)[] = [];
  for (let i = 0; i < infoRows.length; i += perRow || 1) {
    infoLines.push(infoRows.slice(i, i + perRow));
  }
  const infoHtml = infoRows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${COLORS.line};border-radius:9px;margin-bottom:22px;">
        ${infoLines
          .map(
            (line, li) =>
              `<tr>${line
                .map(
                  (r, i) => `
          <td width="${Math.floor(100 / perRow)}%" style="padding:14px;text-align:center;vertical-align:top;${i < line.length - 1 ? `border-right:1px solid ${COLORS.line};` : ''}${li > 0 ? `border-top:1px solid ${COLORS.line};` : ''}">
            <div style="font-size:10.5px;color:${COLORS.soft};letter-spacing:.05em;text-transform:uppercase;margin-bottom:3px;${FONT}">${esc(r.label)}</div>
            <div style="font-size:13px;font-weight:700;color:${COLORS.ink};${FONT}">${esc(r.value)}</div>
          </td>`,
                )
                .join('')}</tr>`,
          )
          .join('')}
      </table>`
    : '';

  const agenda = (o.agenda ?? []).filter((a) => a && a.label);
  const agendaHtml = agenda.length
    ? `<div style="font-size:10.5px;color:${COLORS.soft};letter-spacing:.05em;text-transform:uppercase;margin:0 0 6px;${FONT}">Agenda</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
        ${agenda
          .map(
            (a, i) => `
          <tr><td style="padding:8px 0;${i < agenda.length - 1 ? `border-bottom:1px solid #f1f0f7;` : ''}font-size:13px;${FONT}">
            ${a.time ? `<span style="color:${COLORS.accent};font-weight:700;display:inline-block;width:60px;font-size:12.5px;">${esc(a.time)}</span>` : ''}
            <span style="color:${COLORS.inkSoft};">${esc(a.label)}</span>
          </td></tr>`,
          )
          .join('')}
      </table>`
    : '';

  const paragraphs = [
    ...(o.greeting
      ? [`<b style="color:${COLORS.ink};">${esc(o.greeting)}</b>`]
      : []),
    ...(o.paragraphs ?? []).filter(Boolean).map((p) => multiline(p)),
  ]
    .map(
      (p) =>
        `<p style="font-size:13.5px;line-height:1.7;color:${COLORS.inkSoft};margin:0 0 16px;${FONT}">${p}</p>`,
    )
    .join('');

  const buttons = (o.buttons ?? []).filter(
    (b) => b && b.label && safeUrl(b.url) !== '#',
  );
  const buttonsHtml = buttons.length
    ? `<div style="text-align:center;padding:6px 0 12px;">${buttons
        .map((b) => ctaButton(b.label, b.url, !!b.secondary))
        .join('')}</div>`
    : '';
  const calendarHtml =
    o.calendarUrl && safeUrl(o.calendarUrl) !== '#'
      ? `<div style="text-align:center;font-size:12.5px;color:${COLORS.accent};font-weight:600;padding-bottom:4px;"><a href="${esc(safeUrl(o.calendarUrl))}" style="color:inherit;text-decoration:none;">+ ${esc(o.calendarLabel || 'Add to calendar')}</a></div>`
      : '';
  const footnoteHtml = o.footnote
    ? `<p style="font-size:12px;line-height:1.6;color:${COLORS.soft};margin:14px 0 0;text-align:center;${FONT}">${multiline(o.footnote)}</p>`
    : '';

  const hasBadge = !!(o.banner.day || o.banner.month);
  const badge = hasBadge
    ? `<td style="background:#ffffff;color:${COLORS.ink};border-radius:10px;padding:10px 16px;text-align:center;">
        <div style="font-size:26px;font-weight:800;line-height:1;">${esc(o.banner.day)}</div>
        <div style="font-size:11px;font-weight:700;letter-spacing:.05em;color:${COLORS.accent};">${esc(o.banner.month)}</div>
      </td>`
    : '';
  const bannerBg = o.banner.tone === 'alert' ? '#8e2a1f' : COLORS.ink;

  const body = `
  ${header(o.brand)}
  <tr><td style="background:${bannerBg};color:#ffffff;padding:30px 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      ${badge}
      <td style="${hasBadge ? 'padding-left:20px;' : ''}${FONT}">
        <div style="font-size:19px;margin:0 0 4px;font-weight:700;color:#ffffff;">${esc(o.banner.heading)}</div>
        ${o.banner.sub ? `<div style="font-size:12.5px;color:#b9b5d6;">${esc(o.banner.sub)}</div>` : ''}
      </td>
    </tr></table>
  </td></tr>
  ${imageRow(o.imageUrl, o.imageAlt)}
  <tr><td style="padding:26px 36px 6px;">
    ${paragraphs}
    ${infoHtml}
    ${agendaHtml}
    ${buttonsHtml}
    ${calendarHtml}
    ${footnoteHtml}
  </td></tr>`;

  return wrap(body, o.previewText ?? '', o.brand, mode);
}

// The newsletter "Event Invite" template — a thin mapping from the
// template's authored fields onto the shared event layout.
function renderEventInvite(
  data: Record<string, any>,
  previewText: string,
  brand: NewsletterBrand,
  mode: Mode,
) {
  return renderEventMessage({
    brand,
    previewText,
    mode,
    banner: {
      day: data.day,
      month: data.month,
      heading: data.heading,
      sub: data.location,
    },
    imageUrl: data.imageUrl,
    imageAlt: data.imageAlt,
    paragraphs: data.bodyText ? [data.bodyText] : [],
    infoRows: Array.isArray(data.infoRows) ? data.infoRows : [],
    agenda: Array.isArray(data.agenda) ? data.agenda : [],
    buttons: data.ctaUrl
      ? [{ label: data.ctaLabel || 'Reserve my seat', url: data.ctaUrl }]
      : [],
    calendarUrl: data.calendarUrl,
    calendarLabel: data.calendarLabel,
  });
}

export function renderNewsletter(opts: {
  template: NewsletterTemplate;
  data: Record<string, any>;
  previewText?: string;
  brand: NewsletterBrand;
  mode?: Mode;
}): string {
  const { template, brand } = opts;
  const data = opts.data ?? {};
  const preview = opts.previewText ?? '';
  const mode: Mode = opts.mode ?? 'email';
  switch (template) {
    case NewsletterTemplate.REGULATORY_ALERT:
      return renderRegulatoryAlert(data, preview, brand, mode);
    case NewsletterTemplate.QUARTERLY_ROUNDUP:
      return renderQuarterlyRoundup(data, preview, brand, mode);
    case NewsletterTemplate.ARTICLE_SPOTLIGHT:
      return renderArticleSpotlight(data, preview, brand, mode);
    case NewsletterTemplate.EVENT_INVITE:
      return renderEventInvite(data, preview, brand, mode);
    default:
      throw new BadRequestException('Unknown template');
  }
}

// Fields required before a campaign can send (not just save as
// draft) — matches what each design's visual actually depends on.
export function missingTemplateFields(
  template: NewsletterTemplate,
  data: Record<string, any>,
): string[] {
  const d = data ?? {};
  const missing: string[] = [];
  const req = (cond: boolean, field: string) => {
    if (!cond) missing.push(field);
  };

  switch (template) {
    case NewsletterTemplate.REGULATORY_ALERT:
      req(!!d.heading, 'heading');
      req(!!d.alertText, 'alertText');
      break;
    case NewsletterTemplate.QUARTERLY_ROUNDUP:
      req(!!d.heading, 'heading');
      req(!!d.intro, 'intro');
      req(Array.isArray(d.sections) && d.sections.length > 0, 'sections');
      break;
    case NewsletterTemplate.ARTICLE_SPOTLIGHT:
      req(!!d.heading, 'heading');
      req(!!d.excerpt, 'excerpt');
      req(!!d.ctaUrl, 'ctaUrl');
      break;
    case NewsletterTemplate.EVENT_INVITE:
      req(!!d.heading, 'heading');
      req(!!d.day, 'day');
      req(!!d.month, 'month');
      break;
  }
  return missing;
}

export function validateTemplateData(
  template: NewsletterTemplate,
  data: Record<string, any>,
) {
  const missing = missingTemplateFields(template, data);
  if (missing.length) {
    throw new BadRequestException(
      `This template is missing required fields: ${missing.join(', ')}`,
    );
  }
}
