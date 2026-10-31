// Converts rich-HTML content (from RichTextEditor / mammoth docx
// conversion / a rendered template) into a plain-text array of
// paragraph-level chunks. Used by the PDF generator (which needs plain
// text, not markup) and by redlining, which anchors a comment to a
// paragraph by its index in this array.
//
// The split uses a NON-capturing group: a capturing one would also put the
// matched tag name ("p", "li", …) into the result as if it were a
// paragraph, shifting every index after it and printing stray "p" lines.
const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

export function decodeHtmlEntities(s: string): string {
  return s.replace(
    /&(nbsp|amp|lt|gt|quot|apos|#39);/g,
    (m) => ENTITIES[m] ?? m,
  );
}

export function htmlToParagraphs(html: string): string[] {
  const blocks = html
    .split(/<\/(?:p|div|li|h[1-6])>/i)
    .map((s) => decodeHtmlEntities(s.replace(/<[^>]+>/g, '')).trim())
    .filter(Boolean);
  return blocks.length > 0
    ? blocks
    : [decodeHtmlEntities(html.replace(/<[^>]+>/g, '')).trim()];
}
