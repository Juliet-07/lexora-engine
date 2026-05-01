import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  tenantWelcomeTemplate,
  TenantWelcomeEmailData,
} from './templates/tenant-welcome.template';
import {
  ClientWelcomeEmailData,
  clientWelcomeTemplate,
} from './templates/client-welcome.template';

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
      from: `"${process.env.SMTP_FROM}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendClientWelcome(data: ClientWelcomeEmailData): Promise<void> {
    const { subject, html } = clientWelcomeTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }
}
