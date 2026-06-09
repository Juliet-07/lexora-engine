import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as xml2js from 'xml2js';

// ─────────────────────────────────────────────────────────────
// PAYMENT GATEWAY INTERFACE
// All future gateways (Stripe, Paystack etc.) implement this.
// DpoPaymentGateway is the first implementation.
// ─────────────────────────────────────────────────────────────

export interface CreatePaymentTokenInput {
  amount: number;
  currency: string; // 'USD' | 'RWF'
  companyRef: string; // our internal transaction reference
  redirectUrl: string; // tenant redirected here after payment
  backUrl: string; // our server callback URL
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  description: string;
  ptlHours?: number; // payment time limit in hours (default 24)
}

export interface CreatePaymentTokenResult {
  success: boolean;
  token?: string; // DPO TransToken — used in redirect URL
  transRef?: string; // DPO TransRef — our audit ref
  checkoutUrl?: string; // full URL to redirect tenant to
  error?: string;
}

export interface VerifyPaymentInput {
  token: string; // DPO TransToken
}

export interface VerifyPaymentResult {
  success: boolean;
  paid: boolean;
  resultCode: string;
  resultExplanation: string;
  amount?: string;
  currency?: string;
  customerEmail?: string;
  raw?: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────
// DPO PAY GATEWAY
// ─────────────────────────────────────────────────────────────

@Injectable()
export class DpoPaymentGateway {
  private readonly logger = new Logger(DpoPaymentGateway.name);

  private readonly apiUrl = 'https://secure.3gdirectpay.com/API/v6/';
  private readonly payUrl = 'https://secure.3gdirectpay.com/pay.asp';
  private readonly company = process.env.DPO_COMPANY_TOKEN;
  private readonly service = process.env.DPO_SERVICE_TYPE;

  // ── Create payment token — first step ─────────────────────
  async createToken(
    input: CreatePaymentTokenInput,
  ): Promise<CreatePaymentTokenResult> {
    const serviceDate = new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '/');
    const ptl = input.ptlHours ?? 24;

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${this.company}</CompanyToken>
  <Request>createToken</Request>
  <Transaction>
    <PaymentAmount>${input.amount.toFixed(2)}</PaymentAmount>
    <PaymentCurrency>${input.currency}</PaymentCurrency>
    <CompanyRef>${input.companyRef}</CompanyRef>
    <RedirectURL>${input.redirectUrl}</RedirectURL>
    <BackURL>${input.backUrl}</BackURL>
    <CompanyRefUnique>1</CompanyRefUnique>
    <PTL>${ptl}</PTL>
    <customerFirstName>${this.escapeXml(input.customerFirstName)}</customerFirstName>
    <customerLastName>${this.escapeXml(input.customerLastName)}</customerLastName>
    <customerEmail>${this.escapeXml(input.customerEmail)}</customerEmail>
  </Transaction>
  <Services>
    <Service>
      <ServiceType>${this.service}</ServiceType>
      <ServiceDescription>${this.escapeXml(input.description)}</ServiceDescription>
      <ServiceDate>${serviceDate} 00:00</ServiceDate>
    </Service>
  </Services>
</API3G>`;

    try {
      const response = await axios.post(this.apiUrl, xml, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          Accept: 'application/xml',
        },
        timeout: 15000,
      });

      const parsed = await this.parseXml(response.data);
      const result = parsed?.API3G;

      const resultCode = result?.Result?.[0];
      const transToken = result?.TransToken?.[0];
      const transRef = result?.TransRef?.[0];

      if (resultCode === '000' && transToken) {
        return {
          success: true,
          token: transToken,
          transRef,
          checkoutUrl: `${this.payUrl}?ID=${transToken}`,
        };
      }

      this.logger.error(
        `DPO createToken failed: ${resultCode} — ${result?.ResultExplanation?.[0]}`,
      );
      return {
        success: false,
        error: result?.ResultExplanation?.[0] ?? 'Token creation failed',
      };
    } catch (err) {
      this.logger.error(`DPO createToken error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // ── Verify payment — called after redirect / callback ─────
  async verifyToken(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${this.company}</CompanyToken>
  <Request>verifyToken</Request>
  <TransactionToken>${input.token}</TransactionToken>
</API3G>`;

    try {
      const response = await axios.post(this.apiUrl, xml, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          Accept: 'application/xml',
        },
        timeout: 15000,
      });

      const parsed = await this.parseXml(response.data);
      const result = parsed?.API3G;

      const resultCode = result?.Result?.[0] ?? '';
      const resultExplanation = result?.ResultExplanation?.[0] ?? '';

      // Result 000 = payment verified and successful
      const paid = resultCode === '000';

      return {
        success: true,
        paid,
        resultCode,
        resultExplanation,
        amount: result?.TransactionAmount?.[0],
        currency: result?.TransactionCurrency?.[0],
        customerEmail: result?.CustomerEmail?.[0],
        raw: result,
      };
    } catch (err) {
      this.logger.error(`DPO verifyToken error: ${err.message}`);
      return {
        success: false,
        paid: false,
        resultCode: 'ERROR',
        resultExplanation: err.message,
      };
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  private async parseXml(xmlString: string): Promise<any> {
    return xml2js.parseStringPromise(xmlString, { explicitArray: true });
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
