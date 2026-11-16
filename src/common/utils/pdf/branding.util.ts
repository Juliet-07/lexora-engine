// One document identity for everything a tenant issues — invoices,
// receipts, quotes, purchase orders and payslips. The values come from
// Finance Settings → Document Branding; every PDF builder takes an
// optional DocumentBranding and falls back to DEFAULT_DOCUMENT_BRANDING
// (the palette these documents have always used) when it is not given.

export type DocNumberFormat = 'comma-dot' | 'dot-comma' | 'space-dot';
export type DocDateFormat =
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'DD MMM YYYY'
  | 'YYYY-MM-DD';

export interface DocumentBranding {
  headerColor: string;
  accentColor: string;
  highlightColor: string;
  showLogo: boolean;
  logoDataUrl: string | null;
  companyName: string;
  tagline: string;
  showTagline: boolean;
  addressLines: string[];
  tin: string;
  email: string;
  footerEnabled: boolean;
  watermarkDrafts: boolean;
  headingFont: string;
  bodyFont: string;
  numberFormat: DocNumberFormat;
  dateFormat: DocDateFormat;
}

export const DEFAULT_DOCUMENT_BRANDING: DocumentBranding = {
  headerColor: '#4B0082',
  accentColor: '#7C3AED',
  highlightColor: '#C9A84C',
  showLogo: true,
  logoDataUrl: null,
  companyName: '',
  tagline: '',
  showTagline: false,
  addressLines: [],
  tin: '',
  email: '',
  footerEnabled: true,
  watermarkDrafts: true,
  headingFont: 'DM Sans',
  bodyFont: 'DM Sans',
  numberFormat: 'comma-dot',
  dateFormat: 'DD MMM YYYY',
};

export const HEADING_FONTS = [
  'DM Sans',
  'Inter',
  'Roboto',
  'Poppins',
  'Montserrat',
  'Merriweather',
];
export const BODY_FONTS = [
  'DM Sans',
  'Inter',
  'Roboto',
  'Source Sans Pro',
  'Open Sans',
];

export const BRANDING_PRESETS: Record<
  string,
  { headerColor: string; accentColor: string; highlightColor: string }
> = {
  lexora: {
    headerColor: '#4B0082',
    accentColor: '#7C3AED',
    highlightColor: '#C9A84C',
  },
  ocean: {
    headerColor: '#0B3C5D',
    accentColor: '#1D8FE1',
    highlightColor: '#F2B134',
  },
  forest: {
    headerColor: '#1F4D3A',
    accentColor: '#2E9E6B',
    highlightColor: '#C4A35A',
  },
  royal: {
    headerColor: '#1B2A4A',
    accentColor: '#27AE60',
    highlightColor: '#C4A35A',
  },
  amber: {
    headerColor: '#7A3E00',
    accentColor: '#D97706',
    highlightColor: '#F59E0B',
  },
};

// PDF documents can only draw with the families PDFKit ships (the
// web fonts in the picker cannot be embedded without font files), so
// each choice maps to the closest built-in family: serif choices to
// Times, everything else to Helvetica.
const SERIF = new Set(['Merriweather']);
export const pdfFamily = (font: string, mono = false) =>
  mono ? 'Courier' : SERIF.has(font) ? 'Times' : 'Helvetica';

export interface PdfFontSet {
  regular: string;
  bold: string;
  mono: string;
  monoBold: string;
}
export const pdfFonts = (
  b: Pick<DocumentBranding, 'headingFont' | 'bodyFont'>,
  role: 'heading' | 'body' = 'body',
): PdfFontSet => {
  const fam = pdfFamily(role === 'heading' ? b.headingFont : b.bodyFont);
  const regular = fam === 'Times' ? 'Times-Roman' : fam;
  const bold = fam === 'Times' ? 'Times-Bold' : `${fam}-Bold`;
  return { regular, bold, mono: 'Courier', monoBold: 'Courier-Bold' };
};

export const withBranding = (b?: Partial<DocumentBranding> | null) => ({
  ...DEFAULT_DOCUMENT_BRANDING,
  ...(b ?? {}),
});

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const pad = (n: number) => String(n).padStart(2, '0');

export const formatDocDate = (
  value: Date | string,
  format: DocDateFormat = 'DD MMM YYYY',
) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getUTCDate();
  const mon = d.getUTCMonth();
  const yr = d.getUTCFullYear();
  switch (format) {
    case 'DD/MM/YYYY':
      return `${pad(day)}/${pad(mon + 1)}/${yr}`;
    case 'MM/DD/YYYY':
      return `${pad(mon + 1)}/${pad(day)}/${yr}`;
    case 'YYYY-MM-DD':
      return `${yr}-${pad(mon + 1)}-${pad(day)}`;
    default:
      return `${day} ${MONTHS[mon]} ${yr}`;
  }
};

export const formatDocNumber = (
  n: number,
  format: DocNumberFormat = 'comma-dot',
  decimals = 2,
) => {
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u0000');
  const sep =
    format === 'dot-comma' ? '.' : format === 'space-dot' ? ' ' : ',';
  const dec = format === 'dot-comma' ? ',' : '.';
  const out =
    grouped.split('\u0000').join(sep) + (frac !== undefined ? dec + frac : '');
  return (n < 0 ? '-' : '') + out;
};

// "Footer with address and TIN" — one line, centred at the foot of the
// page. Returns without drawing when there is nothing to say.
export const drawBrandFooter = (doc: any, b: DocumentBranding, color = '#6b7280') => {
  if (!b.footerEnabled) return;
  const parts = [
    b.companyName,
    b.addressLines.join(', '),
    b.tin ? `TIN ${b.tin}` : '',
    b.email,
  ].filter(Boolean);
  if (!parts.length) return;
  const bottom = doc.page.height - 30;
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(color)
    .text(parts.join('  ·  '), 50, bottom, {
      width: doc.page.width - 100,
      align: 'center',
      lineBreak: false,
    });
};

export const drawDraftWatermark = (doc: any) => {
  doc.save();
  doc
    .rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] })
    .font('Helvetica-Bold')
    .fontSize(96)
    .fillColor('#000000')
    .fillOpacity(0.06)
    .text('DRAFT', 0, doc.page.height / 2 - 48, {
      width: doc.page.width,
      align: 'center',
      lineBreak: false,
    });
  doc.restore();
};

// A stored logo path → the data URL every PDF builder already takes.
export const toDataUrl = (buf: Buffer, mime: string) =>
  `data:${mime};base64,${buf.toString('base64')}`;

// A very light wash of a colour — used behind totals bands.
export const tintOf = (hexColor: string, amount = 0.92) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hexColor);
  if (!m) return '#F3EDF9';
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const bl = mix(n & 255);
  return `#${[r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
};
