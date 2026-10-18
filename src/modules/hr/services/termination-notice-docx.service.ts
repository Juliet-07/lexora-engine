import { Injectable } from '@nestjs/common';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import { TerminationNoticeData } from './termination-notice-pdf.service';

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

// A4 in DXA (same convention used elsewhere in this codebase's PDF
// generation — kept A4 here too since Rwanda uses A4, not US Letter).
const PAGE = { width: 11906, height: 16838 };

@Injectable()
export class TerminationNoticeDocxService {
  async buildNoticeDocx(data: TerminationNoticeData): Promise<Buffer> {
    const body: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: data.businessName.toUpperCase(),
            bold: true,
            size: 22,
          }),
        ],
      }),
      ...(data.businessAddress
        ? [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: data.businessAddress,
                  size: 18,
                  color: '777777',
                }),
              ],
            }),
          ]
        : []),
      new Paragraph({ text: '' }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'NOTICE OF TERMINATION OF EMPLOYMENT',
            bold: true,
          }),
        ],
      }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: `Date: ${fmtDate(data.initiatedDate)}` }),
      new Paragraph({ text: `To: ${data.employeeName}` }),
      new Paragraph({ text: `Position: ${data.jobTitle}` }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: `Dear ${data.employeeName.split(' ')[0]},` }),
      new Paragraph({ text: '' }),
      new Paragraph({
        text: `We write to formally notify you that your employment with ${data.businessName} is terminated with effect from ${fmtDate(data.lastWorkingDay)}, subject to the notice period set out below.`,
      }),
      new Paragraph({ text: '' }),
      new Paragraph({
        children: [
          new TextRun({ text: '1. Grounds for termination', bold: true }),
        ],
      }),
      new Paragraph({
        text: `This termination is made on the grounds of ${data.category.toLowerCase().replace(/_/g, ' ')}, as set out in the proceedings initiated on ${fmtDate(data.initiatedDate)} and conducted in accordance with company policy and the Labour Law of Rwanda (Law No. 66/2018).`,
      }),
      new Paragraph({ text: '' }),
      new Paragraph({
        children: [new TextRun({ text: '2. Notice period', bold: true })],
      }),
      new Paragraph({
        text: `In accordance with Article 27 of Law No. 66/2018, you are entitled to a notice period of ${data.noticePeriodLabel}. Your last working day will be ${fmtDate(data.lastWorkingDay)}.`,
      }),
      new Paragraph({ text: '' }),
      new Paragraph({
        children: [new TextRun({ text: '3. Final entitlements', bold: true })],
      }),
      new Paragraph({
        text: 'Upon your departure, you will receive payment for:',
      }),
      new Paragraph({ text: '(a) Pro-rata salary to your last working day;' }),
      new Paragraph({ text: '(b) Accrued but untaken annual leave;' }),
      new Paragraph({
        text: '(c) Any pro-rata bonus entitlements per your contract of employment;',
      }),
      new Paragraph({
        text: '(d) Reimbursement of verified outstanding expenses.',
      }),
      new Paragraph({
        text: 'Any amounts owed by you to the company (salary advances, equipment) will be deducted from your final pay in accordance with Article 82.',
      }),
      new Paragraph({ text: '' }),
      new Paragraph({
        children: [
          new TextRun({ text: '4. Post-termination obligations', bold: true }),
        ],
      }),
      new Paragraph({
        text: 'You are reminded of your continuing obligations under the confidentiality and non-disclosure provisions of your employment contract, which survive termination.',
      }),
      new Paragraph({ text: '' }),
      new Paragraph({
        children: [new TextRun({ text: '5. Right of appeal', bold: true })],
      }),
      new Paragraph({
        text: `You have the right to appeal this decision in writing within ${data.appealWindowLabel} of receipt of this notice. Appeals should be addressed to ${data.signatoryName}.`,
      }),
      new Paragraph({ text: '' }),
      new Paragraph({
        children: [new TextRun({ text: '6. Return of property', bold: true })],
      }),
      new Paragraph({
        text: 'Please return all company property, including IT equipment, access cards, and confidential documents, to the Office Manager on or before your last working day.',
      }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: 'We wish you well in your future endeavours.' }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: 'Yours sincerely,' }),
      new Paragraph({ text: '' }),
      new Paragraph({
        children: [new TextRun({ text: data.signatoryName, bold: true })],
      }),
      new Paragraph({ text: data.signatoryTitle }),
      new Paragraph({ text: data.businessName }),
      new Paragraph({ text: '' }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'cc: Employee file · RSSB notification · Labour inspector (if applicable)',
            size: 18,
            color: '777777',
          }),
        ],
      }),
    ];

    const doc = new Document({
      sections: [
        {
          properties: { page: { size: PAGE } },
          children: body,
        },
      ],
    });

    return Packer.toBuffer(doc);
  }
}
