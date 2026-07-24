import { parse, HTMLElement, Node } from 'node-html-parser';

interface TextStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
}

const DEFAULT_STYLE: TextStyle = {
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
};
const HEADING_SIZES: Record<string, number> = { h1: 18, h2: 15, h3: 13 };

function fontFor(style: TextStyle): string {
  if (style.bold && style.italic) return 'Helvetica-BoldOblique';
  if (style.bold) return 'Helvetica-Bold';
  if (style.italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

function extractAlign(
  el: HTMLElement,
  inherited: TextStyle['align'],
): TextStyle['align'] {
  const styleAttr = el.getAttribute?.('style') ?? '';
  const match = styleAttr.match(/text-align:\s*(left|center|right)/);
  return (match?.[1] as TextStyle['align']) ?? inherited;
}

// Renders the formatting this editor's toolbar exposes: bold/italic/
// underline, 3 alignments, bulleted/numbered lists, H1-H3 headings, and
// simple bordered tables. Table cell text renders as PLAIN TEXT — inline
// bold/italic inside a cell is not preserved, a deliberate scope limit.
// Not a general HTML-to-PDF renderer.
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
      doc.font(fontFor(inheritedStyle)).fontSize(11).text(text, {
        align: inheritedStyle.align,
        underline: inheritedStyle.underline,
      });
      doc.moveDown(0.5);
    }
    return;
  }

  const style = {
    ...inheritedStyle,
    align: extractAlign(el, inheritedStyle.align),
  };

  if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
    doc.moveDown(0.4);
    renderInlineParagraph(
      doc,
      el,
      { ...style, bold: true },
      undefined,
      HEADING_SIZES[tag],
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
      if (childEl.tagName?.toLowerCase() === 'li') {
        idx++;
        const prefix = tag === 'ul' ? '•  ' : `${idx}.  `;
        renderInlineParagraph(doc, childEl, style, prefix);
      }
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

  renderInlineParagraph(doc, el, style);
}

function renderInlineParagraph(
  doc: PDFKit.PDFDocument,
  el: HTMLElement,
  style: TextStyle,
  prefix?: string,
  fontSize = 11,
): void {
  const runs: { text: string; style: TextStyle }[] = [];
  collectInlineRuns(el, style, runs);
  const hasText = runs.some((r) => r.text.trim());
  if (!hasText && !prefix) return;

  doc.fontSize(fontSize);

  if (prefix && !hasText) {
    doc
      .font('Helvetica')
      .text(prefix, { continued: false, indent: 20, align: style.align });
    doc.moveDown(fontSize > 11 ? 0.3 : 0.5);
    return;
  }
  if (prefix) {
    doc
      .font('Helvetica')
      .text(prefix, { continued: true, indent: 20, align: style.align });
  }
  runs.forEach((run, i) => {
    const isLast = i === runs.length - 1;
    doc.font(fontFor(run.style)).text(run.text, {
      continued: !isLast,
      underline: run.style.underline,
      align: style.align,
    });
  });
  doc.moveDown(fontSize > 11 ? 0.3 : 0.5);
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
    const childStyle = { ...style };
    if (tag === 'b' || tag === 'strong') childStyle.bold = true;
    if (tag === 'i' || tag === 'em') childStyle.italic = true;
    if (tag === 'u') childStyle.underline = true;
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
