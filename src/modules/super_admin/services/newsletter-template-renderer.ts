import { BadRequestException } from '@nestjs/common';
import { NewsletterTemplate } from '../schemas';

// ─────────────────────────────────────────────────────────────────
// Renders each of the 4 supplied "Lexora Africa" email designs
// (Regulatory alert, Quarterly round-up, Article spotlight, Event
// invite) as email-safe, table-based HTML with inline styles.
//
// The supplied reference file used CSS flexbox throughout (.shell,
// .ev-hero, .ev-info, etc.) to lay out a template *picker* UI, not an
// email client — flexbox isn't reliably supported by real mail
// clients (Outlook's Word rendering engine in particular). These
// renderers reproduce the same visual design (colours, spacing,
// typography) using nested <table> layout and inline styles, which
// is the only layout approach that survives every major mail client.
// ─────────────────────────────────────────────────────────────────

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

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const FONT = "font-family:'Inter',Arial,Helvetica,sans-serif;";

function ctaButton(label: string, url: string) {
  return `<a href="${esc(url || '#')}" style="display:inline-block;background:${COLORS.accent};color:#ffffff;font-weight:700;font-size:13.5px;padding:13px 28px;border-radius:7px;text-decoration:none;${FONT}">${esc(label)}</a>`;
}

// A plain <img> inside a table cell is safe in every mail client —
// unlike flexbox/grid, this isn't the part of HTML email that's
// unreliable. Renders nothing when the campaign doesn't have one, so
// every template works exactly as before when imageUrl is left blank.
// GIFs pass through untouched (mail clients play them natively).
function imageRow(imageUrl: string | undefined, imageAlt: string | undefined) {
  if (!imageUrl) return '';
  return `<tr><td style="padding:0;line-height:0;font-size:0;">
    <img src="${esc(imageUrl)}" alt="${esc(imageAlt || '')}" width="640" style="display:block;width:100%;max-width:640px;height:auto;border:0;outline:none;" />
  </td></tr>`;
}

function header() {
  return `
  <tr><td style="padding:22px 36px 18px;text-align:center;border-bottom:1px solid ${COLORS.line};">
    <span style="font-weight:800;font-size:18px;letter-spacing:.06em;color:${COLORS.ink};${FONT}">L E X O R A</span>
  </td></tr>`;
}

function footer(unsubscribeUrl: string) {
  return `
  <tr><td style="padding:26px 36px 32px;text-align:center;border-top:1px solid ${COLORS.line};background:#fbfaff;">
    <p style="font-size:11px;color:${COLORS.soft};line-height:1.7;margin:3px 0;${FONT}"><b style="color:${COLORS.ink};">Lexora Africa (Limited)</b> &middot; KG 414, Gacuriro, Kigali &middot; info@lexoraafrica.com</p>
    <p style="font-size:11px;color:${COLORS.soft};line-height:1.7;margin:3px 0;${FONT}">
      <a href="${esc(unsubscribeUrl)}" style="color:${COLORS.accent};text-decoration:none;">Unsubscribe</a>
    </p>
  </td></tr>`;
}

function wrapEmail(
  bodyRows: string,
  previewText: string,
  unsubscribeUrl: string,
) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lexora Africa</title>
</head>
<body style="margin:0;background:#f7f6fb;${FONT}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(previewText)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6fb;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:#ffffff;border:1px solid ${COLORS.line};border-radius:10px;overflow:hidden;">
        ${bodyRows}
        ${footer(unsubscribeUrl)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderRegulatoryAlert(
  data: Record<string, any>,
  previewText: string,
  unsubscribeUrl: string,
) {
  const checklist: string[] = Array.isArray(data.checklist)
    ? data.checklist
    : [];
  const checklistHtml = checklist
    .map(
      (item) =>
        `<tr><td style="padding:0 0 10px;font-size:13.5px;line-height:1.6;color:${COLORS.inkSoft};${FONT}"><span style="color:${COLORS.red};font-weight:800;">&mdash;&nbsp;</span>${esc(item)}</td></tr>`,
    )
    .join('');

  const body = `
  <tr><td style="background:${COLORS.red};color:#ffffff;text-align:center;padding:9px;font-size:11.5px;font-weight:800;letter-spacing:.08em;${FONT}">&#9888; URGENT &mdash; REGULATORY ALERT</td></tr>
  ${header()}
  ${imageRow(data.imageUrl, data.imageAlt)}
  <tr><td style="padding:30px 36px 10px;">
    ${data.refTag ? `<span style="display:inline-block;font-family:'SF Mono','Courier New',monospace;font-size:10px;letter-spacing:.03em;color:${COLORS.soft};background:#f1f0f7;border-radius:4px;padding:2px 7px;margin-bottom:8px;">${esc(data.refTag)}</span><br/>` : ''}
    <span style="font-size:21px;line-height:1.3;font-weight:700;color:${COLORS.ink};${FONT}">${esc(data.heading)}</span>
    <div style="font-size:13px;color:${COLORS.soft};margin:6px 0 20px;${FONT}">${esc(data.subtext)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.redBg};border-radius:0 8px 8px 0;margin-bottom:20px;">
      <tr><td style="border-left:4px solid ${COLORS.red};padding:16px 18px;font-size:13.5px;line-height:1.7;color:${COLORS.inkSoft};${FONT}">${esc(data.alertText)}</td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">${checklistHtml}</table>
    <div style="text-align:center;padding:6px 0 24px;">${ctaButton(data.ctaLabel || 'Read the full advisory', data.ctaUrl)}</div>
    ${data.fineText ? `<div style="font-size:12px;color:${COLORS.soft};text-align:center;padding-bottom:4px;${FONT}">${esc(data.fineText)}</div>` : ''}
  </td></tr>`;

  return wrapEmail(body, previewText, unsubscribeUrl);
}

function renderQuarterlyRoundup(
  data: Record<string, any>,
  previewText: string,
  unsubscribeUrl: string,
) {
  const sections: any[] = Array.isArray(data.sections) ? data.sections : [];
  const sectionsHtml = sections
    .map(
      (s) => `
    <tr><td style="padding:18px 36px;border-top:1px solid ${COLORS.line};">
      <div style="font-family:'SF Mono','Courier New',monospace;font-size:10.5px;color:${COLORS.accent};font-weight:700;">${esc(s.num)}</div>
      <div style="font-size:15px;margin:4px 0 6px;font-weight:700;color:${COLORS.ink};${FONT}">${esc(s.heading)}</div>
      <div style="font-size:13px;line-height:1.65;color:${COLORS.inkSoft};margin:0 0 8px;${FONT}">${esc(s.body)}</div>
      ${s.linkUrl ? `<a href="${esc(s.linkUrl)}" style="font-size:12.5px;color:${COLORS.accent};font-weight:700;text-decoration:none;">${esc(s.linkLabel || 'Read more')} &rarr;</a>` : ''}
    </td></tr>`,
    )
    .join('');

  const blogItems: any[] = Array.isArray(data.blogItems) ? data.blogItems : [];
  const blogHtml = blogItems.length
    ? `<tr><td style="padding:20px 36px;background:${COLORS.paper};">
        <div style="font-size:12px;letter-spacing:.05em;color:${COLORS.soft};margin:0 0 10px;text-transform:uppercase;${FONT}">Also from Lexora this quarter</div>
        ${blogItems
          .map(
            (b) =>
              `<div style="display:block;font-size:13px;padding:7px 0;border-bottom:1px solid #e6e2f5;${FONT}">
                ${b.url ? `<a href="${esc(b.url)}" style="color:${COLORS.ink};text-decoration:none;font-weight:600;">${esc(b.label)}</a>` : `<span style="font-weight:600;color:${COLORS.ink};">${esc(b.label)}</span>`}
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
  <tr><td style="padding:26px 36px 6px;font-size:13.5px;line-height:1.7;color:${COLORS.inkSoft};${FONT}">${esc(data.intro)}</td></tr>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sectionsHtml}</table>
  ${blogHtml}`;

  // header() injects a <tr>, but this template's hero band replaces
  // the normal logo header entirely (matches the reference design).
  return wrapEmail(body, previewText, unsubscribeUrl);
}

function renderArticleSpotlight(
  data: Record<string, any>,
  previewText: string,
  unsubscribeUrl: string,
) {
  const moreItems: any[] = Array.isArray(data.moreItems) ? data.moreItems : [];
  const moreHtml = moreItems.length
    ? `<tr><td style="padding:20px 36px 26px;background:${COLORS.paper};">
        <div style="font-size:12px;letter-spacing:.05em;color:${COLORS.soft};margin:0 0 12px;text-transform:uppercase;${FONT}">More from the series</div>
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
  ${header()}
  <tr><td style="background:${COLORS.accent};background-image:linear-gradient(135deg,#5b4bff,#8b7be0);padding:40px 36px 22px;">
    <span style="background:rgba(255,255,255,.18);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.06em;padding:5px 11px;border-radius:20px;">${esc(data.heroLabel)}</span>
  </td></tr>
  ${imageRow(data.imageUrl, data.imageAlt)}
  <tr><td style="padding:28px 36px 8px;">
    <div style="font-size:11.5px;font-weight:800;letter-spacing:.08em;color:${COLORS.accent};margin-bottom:8px;${FONT}">${esc(data.eyebrow)}</div>
    <div style="font-size:22px;line-height:1.3;font-weight:700;color:${COLORS.ink};margin:0 0 10px;${FONT}">${esc(data.heading)}</div>
    <div style="font-size:12.5px;color:${COLORS.soft};margin-bottom:18px;${FONT}">${esc(data.byline)}</div>
    <p style="font-size:14px;line-height:1.75;color:${COLORS.inkSoft};margin-bottom:20px;${FONT}">${esc(data.excerpt)}</p>
    <div style="padding-bottom:26px;">${ctaButton(data.ctaLabel || 'Read the full article', data.ctaUrl)}</div>
  </td></tr>
  ${moreHtml}`;

  return wrapEmail(body, previewText, unsubscribeUrl);
}

function renderEventInvite(
  data: Record<string, any>,
  previewText: string,
  unsubscribeUrl: string,
) {
  const infoRows: any[] = Array.isArray(data.infoRows) ? data.infoRows : [];
  const infoHtml = infoRows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${COLORS.line};border-radius:9px;margin-bottom:22px;">
        <tr>${infoRows
          .map(
            (r, i) => `
          <td style="padding:14px;text-align:center;${i < infoRows.length - 1 ? `border-right:1px solid ${COLORS.line};` : ''}">
            <div style="font-size:10.5px;color:${COLORS.soft};letter-spacing:.05em;text-transform:uppercase;margin-bottom:3px;${FONT}">${esc(r.label)}</div>
            <div style="font-size:13px;font-weight:700;color:${COLORS.ink};${FONT}">${esc(r.value)}</div>
          </td>`,
          )
          .join('')}</tr>
      </table>`
    : '';

  const agenda: any[] = Array.isArray(data.agenda) ? data.agenda : [];
  const agendaHtml = agenda.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
        ${agenda
          .map(
            (a, i) => `
          <tr><td style="padding:8px 0;${i < agenda.length - 1 ? `border-bottom:1px solid #f1f0f7;` : ''}font-size:13px;${FONT}">
            <span style="color:${COLORS.accent};font-weight:700;display:inline-block;width:60px;font-size:12.5px;">${esc(a.time)}</span>
            <span style="color:${COLORS.inkSoft};">${esc(a.label)}</span>
          </td></tr>`,
          )
          .join('')}
      </table>`
    : '';

  const body = `
  ${header()}
  <tr><td style="background:${COLORS.ink};color:#ffffff;padding:30px 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="background:#ffffff;color:${COLORS.ink};border-radius:10px;padding:10px 16px;text-align:center;">
        <div style="font-size:26px;font-weight:800;line-height:1;">${esc(data.day)}</div>
        <div style="font-size:11px;font-weight:700;letter-spacing:.05em;color:${COLORS.accent};">${esc(data.month)}</div>
      </td>
      <td style="padding-left:20px;${FONT}">
        <div style="font-size:19px;margin:0 0 4px;font-weight:700;">${esc(data.heading)}</div>
        <div style="font-size:12.5px;color:#b9b5d6;">${esc(data.location)}</div>
      </td>
    </tr></table>
  </td></tr>
  ${imageRow(data.imageUrl, data.imageAlt)}
  <tr><td style="padding:26px 36px 6px;">
    <p style="font-size:13.5px;line-height:1.7;color:${COLORS.inkSoft};${FONT}">${esc(data.bodyText)}</p>
    ${infoHtml}
    ${agendaHtml}
    <div style="text-align:center;padding:6px 0 12px;">${ctaButton(data.ctaLabel || 'Reserve my seat', data.ctaUrl)}</div>
    ${data.calendarUrl ? `<div style="text-align:center;font-size:12.5px;color:${COLORS.accent};font-weight:600;padding-bottom:4px;"><a href="${esc(data.calendarUrl)}" style="color:inherit;text-decoration:none;">+ ${esc(data.calendarLabel || 'Add to calendar')}</a></div>` : ''}
  </td></tr>`;

  return wrapEmail(body, previewText, unsubscribeUrl);
}

export function renderNewsletterHtml(
  template: NewsletterTemplate,
  data: Record<string, any>,
  previewText: string,
  unsubscribeUrl: string,
): string {
  switch (template) {
    case NewsletterTemplate.REGULATORY_ALERT:
      return renderRegulatoryAlert(data, previewText, unsubscribeUrl);
    case NewsletterTemplate.QUARTERLY_ROUNDUP:
      return renderQuarterlyRoundup(data, previewText, unsubscribeUrl);
    case NewsletterTemplate.ARTICLE_SPOTLIGHT:
      return renderArticleSpotlight(data, previewText, unsubscribeUrl);
    case NewsletterTemplate.EVENT_INVITE:
      return renderEventInvite(data, previewText, unsubscribeUrl);
    default:
      throw new BadRequestException('Unknown template');
  }
}

// Fields required before a campaign can send (not just save as
// draft) — matches what each design's visual actually depends on.
export function validateTemplateData(
  template: NewsletterTemplate,
  data: Record<string, any>,
) {
  const missing: string[] = [];
  const req = (cond: boolean, field: string) => {
    if (!cond) missing.push(field);
  };

  switch (template) {
    case NewsletterTemplate.REGULATORY_ALERT:
      req(!!data.heading, 'heading');
      req(!!data.alertText, 'alertText');
      break;
    case NewsletterTemplate.QUARTERLY_ROUNDUP:
      req(!!data.heading, 'heading');
      req(!!data.intro, 'intro');
      req(Array.isArray(data.sections) && data.sections.length > 0, 'sections');
      break;
    case NewsletterTemplate.ARTICLE_SPOTLIGHT:
      req(!!data.heading, 'heading');
      req(!!data.excerpt, 'excerpt');
      req(!!data.ctaUrl, 'ctaUrl');
      break;
    case NewsletterTemplate.EVENT_INVITE:
      req(!!data.heading, 'heading');
      req(!!data.day, 'day');
      req(!!data.month, 'month');
      break;
  }

  if (missing.length) {
    throw new BadRequestException(
      `This template is missing required fields: ${missing.join(', ')}`,
    );
  }
}
