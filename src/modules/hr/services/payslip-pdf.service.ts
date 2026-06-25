import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { PayslipDocument, PayslipTemplateDocument } from '../schemas';

const INK = '#0f172a';
const MUTED = '#64748b';
const NEG = '#dc2626';
const LINE = '#e2e8f0';

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const fmtMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
};

@Injectable()
export class PayslipPdfService {
  async buildPayslipPdf(
    slip: PayslipDocument,
    template: PayslipTemplateDocument,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const accent = template.accentColor || '#6366f1';
      const companyName = template.companyName || 'Company';
      const currency = slip.payCurrency;
      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - 100;

      // Brand bar — logo (if present) + company name, period on the right
      doc.rect(0, 0, pageWidth, 86).fill(accent);

      let textX = 50;
      if (template.logoUrl) {
        try {
          // logoUrl expected as a base64 data URL (same convention
          // as the contract signature/stamp images built earlier
          // this session). If malformed, skip the logo rather than
          // fail the whole PDF.
          const base64 = template.logoUrl.split(',')[1];
          if (base64) {
            const imgBuffer = Buffer.from(base64, 'base64');
            doc.image(imgBuffer, 50, 18, { height: 50 });
            textX = 112;
          }
        } catch {
          // malformed logo data — proceed without it
        }
      }

      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(15)
        .text(companyName, textX, 28, {
          width: contentWidth - (textX - 50) - 140,
        });
      if (template.companyAddress) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#ffffffcc')
          .text(template.companyAddress, textX, 48, {
            width: contentWidth - (textX - 50) - 140,
          });
      }

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#ffffffdd')
        .text('PAYSLIP', pageWidth - 190, 26, { width: 140, align: 'right' });
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#ffffff')
        .text(slip.periodLabel, pageWidth - 190, 40, {
          width: 140,
          align: 'right',
        });

      doc.y = 110;

      // Employee row
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(slip.employeeName, 50, doc.y);
      const subParts = [slip.jobTitle, slip.employeeNumber]
        .filter(Boolean)
        .join(' · ');
      if (subParts) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(MUTED)
          .text(subParts, 50, doc.y + 2);
      }
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(MUTED)
        .text(
          `${fmtDate(slip.periodStart)} – ${fmtDate(slip.periodEnd)}`,
          50,
          doc.y,
          {
            width: contentWidth,
            align: 'right',
          },
        );

      doc.moveDown(1.5);
      doc
        .moveTo(50, doc.y)
        .lineTo(50 + contentWidth, doc.y)
        .strokeColor(LINE)
        .stroke();
      doc.moveDown(1);

      // Net pay box
      const netBoxY = doc.y;
      doc.rect(50, netBoxY, contentWidth, 46).fill('#f1f5f9');
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(MUTED)
        .text('NET PAY', 66, netBoxY + 16, { characterSpacing: 0.5 });
      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor(accent)
        .text(fmtMoney(slip.netSalary, currency), 50, netBoxY + 12, {
          width: contentWidth - 16,
          align: 'right',
        });
      doc.y = netBoxY + 46 + 8;

      if (slip.sourceCurrency && slip.exchangeRateApplied) {
        doc
          .font('Helvetica-Oblique')
          .fontSize(8)
          .fillColor('#94a3b8')
          .text(
            `Converted from ${slip.sourceCurrency} at a rate of ${slip.exchangeRateApplied.toFixed(4)} (as of ${fmtDate(slip.exchangeRateDate!)})`,
            50,
            doc.y,
          );
        doc.moveDown(0.5);
      }

      const section = (title: string) => {
        doc.moveDown(0.8);
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor(MUTED)
          .text(title.toUpperCase(), 50, doc.y, { characterSpacing: 0.5 });
        doc.moveDown(0.3);
        doc
          .moveTo(50, doc.y)
          .lineTo(50 + contentWidth, doc.y)
          .strokeColor(LINE)
          .stroke();
        doc.moveDown(0.5);
      };

      const row = (
        label: string,
        amount: number,
        opts: { negative?: boolean; bold?: boolean } = {},
      ) => {
        const y = doc.y;
        doc
          .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(10)
          .fillColor(opts.negative ? NEG : INK)
          .text(label, 50, y, { width: contentWidth - 150 });
        doc
          .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(10)
          .fillColor(opts.negative ? NEG : INK)
          .text(
            (opts.negative ? '-' : '') + fmtMoney(amount, currency),
            50 + contentWidth - 150,
            y,
            { width: 150, align: 'right' },
          );
        doc.moveDown(0.4);
      };

      // Earnings
      section('Earnings');
      row('Basic Salary', slip.basicSalary);
      for (const a of slip.allowances) row(a.label, a.amount);
      doc.moveDown(0.2);
      doc
        .moveTo(50, doc.y)
        .lineTo(50 + contentWidth, doc.y)
        .strokeColor(LINE)
        .stroke();
      doc.moveDown(0.4);
      row('Gross Salary', slip.grossSalary, { bold: true });

      // Deductions
      section('Employee Deductions');
      const visibleDeductions = slip.deductions.filter(
        (d) => d.visibleToEmployee,
      );
      if (
        visibleDeductions.length === 0 &&
        (!template.showLoanDeductions || slip.loanDeductions.length === 0)
      ) {
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor(MUTED)
          .text('No statutory deductions configured', 50, doc.y);
        doc.moveDown(0.4);
      } else {
        for (const d of visibleDeductions)
          row(d.label, d.employeeAmount, { negative: true });
        if (template.showLoanDeductions) {
          for (const l of slip.loanDeductions)
            row(l.label, l.amountDeducted, { negative: true });
        }
      }
      doc.moveDown(0.2);
      doc
        .moveTo(50, doc.y)
        .lineTo(50 + contentWidth, doc.y)
        .strokeColor(LINE)
        .stroke();
      doc.moveDown(0.4);
      row('Total Deductions', slip.totalEmployeeDeductions, {
        negative: true,
        bold: true,
      });

      // Employer contributions (optional)
      const employerLines = slip.deductions.filter((d) => d.employerAmount > 0);
      if (template.showEmployerContributions && employerLines.length > 0) {
        if (doc.y > doc.page.height - 200) doc.addPage();
        section(
          'Employer Contributions (informational — not deducted from your pay)',
        );
        for (const d of employerLines) row(d.label, d.employerAmount);
        doc.moveDown(0.2);
        doc
          .moveTo(50, doc.y)
          .lineTo(50 + contentWidth, doc.y)
          .strokeColor(LINE)
          .stroke();
        doc.moveDown(0.4);
        row('Total Employer Contributions', slip.totalEmployerContributions, {
          bold: true,
        });
      }

      // Footer
      const footerText = template.footerNote || 'Generated by Lexora';
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#94a3b8')
        .text(footerText, 50, doc.page.height - 40, {
          width: contentWidth,
          align: 'center',
        });

      doc.end();
    });
  }
}
