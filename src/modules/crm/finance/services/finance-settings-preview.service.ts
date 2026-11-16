import { BadRequestException, Injectable } from '@nestjs/common';
import { buildInvoicePdf } from 'src/common/utils/pdf/invoice.util';
import { buildQuotePdf } from 'src/common/utils/pdf/quote.util';
import { buildPurchaseOrderPdf } from 'src/common/utils/pdf/purchase-order.util';
import { PayslipPdfService } from 'src/modules/hr/services/payslip-pdf.service';
import { FinanceSettingsService } from './finance-settings.service';

export const PREVIEW_KINDS = [
  'invoice',
  'receipt',
  'quote',
  'purchase-order',
  'payslip',
] as const;

// Sample documents for Finance Settings → Document Branding, drawn by the
// very same builders as the real ones with the tenant's saved branding,
// so what the preview shows is what a client receives.
@Injectable()
export class FinanceSettingsPreviewService {
  private readonly payslipPdf = new PayslipPdfService();

  constructor(private readonly settings: FinanceSettingsService) {}

  async build(tenantId: string, kind: string): Promise<Buffer> {
    if (!(PREVIEW_KINDS as readonly string[]).includes(kind))
      throw new BadRequestException(
        `Preview one of: ${PREVIEW_KINDS.join(', ')}.`,
      );
    const branding = await this.settings.getBranding(tenantId);
    const invoicing = await this.settings.getSection(tenantId, 'invoicing');
    const firm = {
      firmName: branding.companyName,
      firmAddressLines: branding.addressLines,
      logoDataUrl: branding.logoDataUrl,
      branding,
    };
    const issued = new Date();
    const due = new Date(issued.getTime() + 30 * 86400000);

    if (kind === 'invoice' || kind === 'receipt') {
      return buildInvoicePdf({
        ref: 'INV-2026-0001',
        clientName: 'Sample Client Ltd',
        mandateName: 'Advisory engagement',
        isPaid: kind === 'receipt',
        isDraft: false,
        lines: [
          { description: 'Advisory services — October', qty: 12, unit: 150 },
          { description: 'Document review', qty: 4, unit: 120 },
        ],
        currency: 'USD',
        net: 2280,
        vat: 410.4,
        vatRate: 18,
        wht: 0,
        whtRate: 0,
        payable: 2690.4,
        issuedOn: issued,
        dueOn: due,
        remittanceAccounts: [
          {
            accountName: branding.companyName,
            bankName: 'Sample Bank',
            accountNumber: '00040-00123456-01',
            currency: 'USD',
            swiftCode: 'SAMPLEXX',
          },
        ],
        footerNote: invoicing.invoiceFooter || undefined,
        ...firm,
      });
    }
    if (kind === 'quote') {
      return buildQuotePdf({
        ref: 'QT-2026-001',
        kind: 'Quote',
        clientName: 'Sample Client Ltd',
        title: 'Corporate advisory retainer',
        description: 'Monthly advisory retainer, billed in arrears.',
        amount: 2000,
        vatPercent: 18,
        vatAmount: 360,
        totalAmount: 2360,
        currency: 'USD',
        issued,
        expires: due,
        termsAndConditions:
          'Payment is due within 30 days of the invoice date.',
        isDraft: false,
        ...firm,
      });
    }
    if (kind === 'purchase-order') {
      return buildPurchaseOrderPdf({
        ref: 'PO-2026-001',
        vendorName: 'Sample Supplier Ltd',
        vendorTin: '123456789',
        currency: 'USD',
        issuedOn: issued,
        expectedDelivery: due,
        notes: '',
        lines: [
          {
            description: 'Office chairs',
            qty: 10,
            unit: 85,
            discountPct: 0,
            taxLabel: 'STD',
          },
          {
            description: 'Standing desks',
            qty: 4,
            unit: 240,
            discountPct: 5,
            taxLabel: 'STD',
          },
        ],
        deliveryAddress: 'Head office, Kigali',
        deliveryAttention: 'Operations',
        deliveryPhone: '+250 000 000 000',
        deliveryInstructions: 'Deliver between 9am and 4pm.',
        firmRegistrationNumber: '',
        firmTaxId: branding.tin,
        isDraft: false,
        ...firm,
      } as any);
    }
    const slip: any = {
      employeeName: 'Sample Employee',
      employeeNumber: 'EMP-001',
      jobTitle: 'Accountant',
      periodLabel: 'October 2026',
      periodStart: new Date('2026-10-01'),
      periodEnd: new Date('2026-10-31'),
      payCurrency: 'USD',
      sourceCurrency: 'USD',
      exchangeRateApplied: null,
      exchangeRateDate: null,
      basicSalary: 2500,
      allowances: [{ key: 'transport', label: 'Transport', amount: 150 }],
      deductions: [
        {
          key: 'paye',
          label: 'PAYE',
          employeeAmount: 380,
          employerAmount: 0,
          visibleToEmployee: true,
        },
        {
          key: 'pension',
          label: 'Pension',
          employeeAmount: 150,
          employerAmount: 150,
          visibleToEmployee: true,
        },
      ],
      loanDeductions: [],
      grossSalary: 2650,
      totalEmployeeDeductions: 530,
      totalEmployerContributions: 150,
      netSalary: 2120,
    };
    const template: any = {
      logoUrl: branding.logoDataUrl,
      accentColor: branding.headerColor,
      companyName: branding.companyName,
      companyAddress: branding.addressLines.join(', ') || null,
      footerNote: branding.footerEnabled
        ? [
            branding.companyName,
            branding.addressLines.join(', '),
            branding.tin ? `TIN ${branding.tin}` : '',
          ]
            .filter(Boolean)
            .join('  ·  ') || null
        : null,
      showEmployerContributions: true,
      showLoanDeductions: true,
      showYearToDateSummary: true,
    };
    return this.payslipPdf.buildPayslipPdf(slip, template, branding);
  }
}
