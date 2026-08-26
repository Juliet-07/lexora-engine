import { parse, HTMLElement, Node } from 'node-html-parser';

type FontCategory = 'sans' | 'serif' | 'mono';

interface TextStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  fontCategory: FontCategory;
  // Real point size, already converted from the editor's CSS px —
  // null means "use whatever size the enclosing block chose"
  // (11pt body text, or the heading's own size).
  fontSize: number | null;
}

const DEFAULT_STYLE: TextStyle = {
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  fontCategory: 'sans',
  fontSize: null,
};
const HEADING_SIZES: Record<string, number> = { h1: 18, h2: 15, h3: 13 };

// PDFKit ships exactly 14 built-in fonts: Helvetica, Times, Courier
// (each with Bold/Oblique/BoldOblique), Symbol, and ZapfDingbats —
// nothing else is available without embedding a real TTF file.
// Arial, Calibri, Trebuchet MS, Georgia, and Verdana are proprietary
// Microsoft fonts we have no license to embed, so a tenant's exact
// typeface choice maps to the closest of the three real families
// (sans-serif, serif, or monospace) rather than being silently
// dropped — the category the tenant picked survives, even if the
// exact glyphs don't.
function fontCategoryFor(fontFamilyValue: string): FontCategory {
  const v = fontFamilyValue.toLowerCase();
  if (
    v.includes('times') ||
    v.includes('georgia') ||
    v.includes('garamond') ||
    v.includes('serif')
  ) {
    return 'serif';
  }
  if (v.includes('courier') || v.includes('mono')) {
    return 'mono';
  }
  return 'sans';
}

const FONT_FAMILIES: Record<
  FontCategory,
  { regular: string; bold: string; italic: string; boldItalic: string }
> = {
  sans: {
    regular: 'Helvetica',
    bold: 'Helvetica-Bold',
    italic: 'Helvetica-Oblique',
    boldItalic: 'Helvetica-BoldOblique',
  },
  serif: {
    regular: 'Times-Roman',
    bold: 'Times-Bold',
    italic: 'Times-Italic',
    boldItalic: 'Times-BoldItalic',
  },
  mono: {
    regular: 'Courier',
    bold: 'Courier-Bold',
    italic: 'Courier-Oblique',
    boldItalic: 'Courier-BoldOblique',
  },
};

function fontFor(style: TextStyle): string {
  const set = FONT_FAMILIES[style.fontCategory];
  if (style.bold && style.italic) return set.boldItalic;
  if (style.bold) return set.bold;
  if (style.italic) return set.italic;
  return set.regular;
}

// CSS px and PDF pt are both real, fixed-ratio units — a CSS pixel
// is defined as 1/96 inch, a point as 1/72 inch, so 1px = 0.75pt
// exactly. Treating the editor's px values as pt directly (skipping
// this conversion) would render everything a third too large.
const PX_TO_PT = 0.75;

// Reads every inline style this editor can actually produce —
// alignment, font-size, and font-family (as a real CSS value, or as
// the face="" attribute execCommand('fontName', …) writes on a
// <font> tag in most browsers) — falling back to whatever the
// enclosing block already resolved to.
function extractInlineStyle(el: HTMLElement, inherited: TextStyle): TextStyle {
  const styleAttr = el.getAttribute?.('style') ?? '';
  const alignMatch = styleAttr.match(/text-align:\s*(left|center|right)/);
  const sizeMatch = styleAttr.match(/font-size:\s*(\d+(?:\.\d+)?)px/);
  const familyMatch = styleAttr.match(/font-family:\s*([^;]+)/);
  const faceAttr =
    el.tagName?.toLowerCase() === 'font' ? el.getAttribute?.('face') : null;

  return {
    ...inherited,
    align: (alignMatch?.[1] as TextStyle['align']) ?? inherited.align,
    fontSize: sizeMatch
      ? parseFloat(sizeMatch[1]) * PX_TO_PT
      : inherited.fontSize,
    fontCategory: familyMatch
      ? fontCategoryFor(familyMatch[1])
      : faceAttr
        ? fontCategoryFor(faceAttr)
        : inherited.fontCategory,
  };
}

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'table',
  'blockquote',
]);

// A container only counts as "transparent" (its children rendered
// as separate blocks) if it actually has a block-level child.
// <p>Some <b>bold</b> text</p> must still render as one inline
// paragraph — only a wrapper that itself contains a <p>, <div>,
// <ul>, etc. should be split apart instead of flattened.
function hasBlockChild(el: HTMLElement): boolean {
  return el.childNodes.some((child) => {
    const tag = (child as HTMLElement).tagName?.toLowerCase();
    return tag ? BLOCK_TAGS.has(tag) : false;
  });
}

// Renders the formatting this editor's toolbar exposes: bold/italic/
// underline, 3 alignments, font family and size, bulleted/numbered
// lists, H1-H3 headings, and simple bordered tables. Table cell text
// renders as PLAIN TEXT — inline bold/italic/font styling inside a
// cell is not preserved, a deliberate scope limit. Not a general
// HTML-to-PDF renderer.
export function renderRichText(doc: PDFKit.PDFDocument, html: string): void {
  if (!html?.trim()) {
    doc
      .font('Helvetica')
      .fontSize(11)
      .text('(No minutes recorded.)', { align: 'left' });
    return;
  }
  const root = parse(html);
  for (const child of root.childNodes) {
    renderBlock(doc, child, DEFAULT_STYLE);
  }
}

function renderBlock(
  doc: PDFKit.PDFDocument,
  node: Node,
  inheritedStyle: TextStyle,
): void {
  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase();

  if (!tag) {
    const text = node.text?.trim();
    if (text) {
      doc
        .font(fontFor(inheritedStyle))
        .fontSize(inheritedStyle.fontSize ?? 11)
        .text(text, {
          align: inheritedStyle.align,
          underline: inheritedStyle.underline,
        });
      doc.moveDown(0.5);
    }
    return;
  }

  const style = extractInlineStyle(el, inheritedStyle);

  if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
    doc.moveDown(0.4);
    renderInlineParagraph(
      doc,
      el,
      { ...style, bold: true },
      undefined,
      style.fontSize ?? HEADING_SIZES[tag],
    );
    doc.moveDown(0.2);
    return;
  }

  if (tag === 'table') {
    renderTable(doc, el);
    return;
  }

  if (tag === 'ul' || tag === 'ol') {
    let idx = 0;
    for (const child of el.childNodes) {
      const childEl = child as HTMLElement;
      const childTag = childEl.tagName?.toLowerCase();
      // An actual nested sub-list isn't handled here (this editor's
      // toolbar has no way to create one) — better left alone than
      // mis-rendered as a flat item.
      if (childTag === 'ul' || childTag === 'ol') continue;
      // A stray whitespace text node between <li> tags (common in
      // formatted HTML) isn't a real item — only count it if it's
      // an actual element, or non-whitespace text.
      if (!childTag && !child.text?.trim()) continue;
      // Real <li> is the normal case, but a browser occasionally
      // wraps list content in something else (a stray <div>, say) —
      // rendering it as a list item anyway beats silently dropping
      // it, since anything directly inside a <ul>/<ol> is
      // semantically a list item regardless of the exact tag used.
      idx++;
      const prefix = tag === 'ul' ? '•  ' : `${idx}.  `;
      const liStyle = extractInlineStyle(childEl, style);
      renderInlineParagraph(doc, childEl, liStyle, prefix);
    }
    return;
  }

  if (tag === 'li') {
    renderInlineParagraph(doc, el, style);
    return;
  }

  if (tag === 'br') {
    doc.moveDown(0.5);
    return;
  }

  // A wrapper that itself contains block-level content — almost
  // always a <div>, which is what most browsers' contenteditable
  // uses for line breaks — is transparent: each child renders as
  // its own block instead of every line being flattened into one
  // run-on paragraph. This is what makes a paragraph or a list
  // survive being wrapped in a <div>.
  if (hasBlockChild(el)) {
    for (const child of el.childNodes) {
      renderBlock(doc, child, style);
    }
    return;
  }

  renderInlineParagraph(doc, el, style);
}

function renderInlineParagraph(
  doc: PDFKit.PDFDocument,
  el: HTMLElement,
  style: TextStyle,
  prefix?: string,
  blockFontSize?: number,
): void {
  const runs: { text: string; style: TextStyle }[] = [];
  collectInlineRuns(el, style, runs);
  const hasText = runs.some((r) => r.text.trim());
  if (!hasText && !prefix) return;

  const defaultSize = blockFontSize ?? style.fontSize ?? 11;

  if (prefix && !hasText) {
    doc
      .font(fontFor(style))
      .fontSize(defaultSize)
      .text(prefix, { continued: false, indent: 20, align: style.align });
    doc.moveDown(defaultSize > 11 ? 0.3 : 0.5);
    return;
  }
  if (prefix) {
    doc
      .font(fontFor(style))
      .fontSize(defaultSize)
      .text(prefix, { continued: true, indent: 20, align: style.align });
  }
  let largestSize = defaultSize;
  runs.forEach((run, i) => {
    const isLast = i === runs.length - 1;
    const runSize = run.style.fontSize ?? defaultSize;
    largestSize = Math.max(largestSize, runSize);
    doc.font(fontFor(run.style)).fontSize(runSize).text(run.text, {
      continued: !isLast,
      underline: run.style.underline,
      align: style.align,
    });
  });
  doc.moveDown(largestSize > 11 ? 0.3 : 0.5);
}

function collectInlineRuns(
  node: Node,
  style: TextStyle,
  out: { text: string; style: TextStyle }[],
): void {
  for (const child of node.childNodes) {
    const el = child as HTMLElement;
    const tag = el.tagName?.toLowerCase();
    if (!tag) {
      if (child.text) out.push({ text: child.text, style });
      continue;
    }
    let childStyle = extractInlineStyle(el, style);
    if (tag === 'b' || tag === 'strong')
      childStyle = { ...childStyle, bold: true };
    if (tag === 'i' || tag === 'em')
      childStyle = { ...childStyle, italic: true };
    if (tag === 'u') childStyle = { ...childStyle, underline: true };
    collectInlineRuns(el, childStyle, out);
  }
}

function cellPlainText(cell: HTMLElement): string {
  return cell.text.replace(/\s+/g, ' ').trim();
}

// pdfkit has no native table primitive — cells are drawn manually as
// bordered rectangles with placed text, column widths divided evenly.
function renderTable(doc: PDFKit.PDFDocument, tableEl: HTMLElement): void {
  const rows = tableEl.querySelectorAll('tr');
  if (rows.length === 0) return;

  const colCount = Math.max(
    ...rows.map((r) => r.querySelectorAll('td,th').length),
  );
  if (colCount === 0) return;

  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = pageWidth / colCount;
  const padX = 6,
    padY = 4,
    fontSize = 10;

  for (const row of rows) {
    const cells = row.querySelectorAll('td,th');
    const texts = cells.map(cellPlainText);
    const heights = texts.map((t) =>
      doc
        .font('Helvetica')
        .fontSize(fontSize)
        .heightOfString(t || ' ', { width: colWidth - padX * 2 }),
    );
    const rowHeight = Math.max(...heights, fontSize) + padY * 2;

    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom)
      doc.addPage();

    const rowY = doc.y;
    texts.forEach((text, i) => {
      const x = doc.page.margins.left + i * colWidth;
      doc.rect(x, rowY, colWidth, rowHeight).stroke('#999999');
      doc
        .font('Helvetica')
        .fontSize(fontSize)
        .fillColor('#000000')
        .text(text, x + padX, rowY + padY, { width: colWidth - padX * 2 });
    });
    doc.y = rowY + rowHeight;
  }
  doc.moveDown(0.8);
}
