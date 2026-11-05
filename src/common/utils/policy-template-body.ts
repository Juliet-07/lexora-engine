import { splitTemplateIntoSections } from './deal.contract.util';

type TemplateLike = {
  body?: string;
  sections?: { title: string; content?: string }[];
};

/**
 * The template as one HTML document. A template is authored as a single
 * body; templates saved before that still hold a `sections` list, which is
 * folded into a body with one heading per section so both kinds work the same
 * way everywhere.
 */
export function templateBodyHtml(template: TemplateLike): string {
  if (template.body?.trim()) return template.body;
  return (template.sections ?? [])
    .map((s) => `<h2>${s.title}</h2>${s.content ?? ''}`)
    .join('');
}

/**
 * Splits a (merge-field-filled) body at Heading 1–3 into the sections a
 * tenant's policy is edited in. A body with no headings becomes one section
 * named after the policy.
 */
export function bodyToPolicySections(html: string, fallbackTitle: string) {
  return splitTemplateIntoSections(html, fallbackTitle).map((s, i) => ({
    id: `s${i + 1}`,
    title: s.title,
    content: s.body,
    order: i,
  }));
}
