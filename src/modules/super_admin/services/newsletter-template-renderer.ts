import {
  NewsletterBrand,
  NewsletterTemplate,
  renderNewsletter,
  validateTemplateData,
} from 'src/common/utils/newsletter/newsletter-template';

// The platform-level SuperAdmin newsletter renders through the same
// shared templates the tenants' own CRM newsletters use (see
// common/utils/newsletter/newsletter-templates.ts) — only the brand
// differs: this one is "Lexora", sent to public website subscribers,
// so it carries an unsubscribe link.
const LEXORA_BRAND = (unsubscribeUrl: string): NewsletterBrand => ({
  headerText: 'L E X O R A',
  footerLines: [
    'Lexora Africa (Limited) · KG 414, Gacuriro, Kigali · info@lexoraafrica.com',
  ],
  unsubscribeUrl,
});

export function renderNewsletterHtml(
  template: NewsletterTemplate,
  data: Record<string, any>,
  previewText: string,
  unsubscribeUrl: string,
): string {
  return renderNewsletter({
    template,
    data: {
      blogHeading: 'Also from Lexora this quarter',
      ...(data ?? {}),
    },
    previewText,
    brand: LEXORA_BRAND(unsubscribeUrl),
    mode: 'email',
  });
}

export { validateTemplateData };
