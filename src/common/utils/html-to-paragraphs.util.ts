// Converts rich-HTML content (from RichTextEditor / mammoth docx
// conversion) into a plain-text array of paragraph-level chunks.
// Used by the PDF generator (which needs plain text, not markup)
// and reused as-is for redlining's line-by-line anchoring later.
export function htmlToParagraphs(html: string): string[] {
  const blocks = html
    .split(/<\/(p|div|li|h[1-6])>/i)
    .map((s) =>
      s
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  return blocks.length > 0 ? blocks : [html.replace(/<[^>]+>/g, '').trim()];
}
