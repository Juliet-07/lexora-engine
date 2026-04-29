import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  tenantWelcomeTemplate,
  TenantWelcomeEmailData,
} from './templates/tenant-welcome.template';

@Injectable()
export class EmailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        authMethod: 'PLAIN,LOGIN',
      },
      tls: {
        rejectUnauthorized: process.env.SMTP_STARTTLS === 'true',
      },
    });
  }

  async sendTenantWelcome(data: TenantWelcomeEmailData): Promise<void> {
    const { subject, html } = tenantWelcomeTemplate(data);

    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Legal Practice Platform'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }
}