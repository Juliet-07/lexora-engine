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
import {
  ClientRejectionEmailData,
  clientRejectionTemplate,
} from './templates/client-rejection.template';
import {
  InfoRequestEmailData,
  infoRequestTemplate,
} from './templates/client-info-request.template';
import {
  SignedCertificateEmailData,
  signedCertificateTemplate,
} from './templates/signed-certificate.template';
import {
  EngagementLetterInviteData,
  engagementLetterInviteTemplate,
} from './templates/engagement-letter-invite.template';
import {
  EngagementLetterSignedNotificationData,
  engagementLetterSignedNotificationTemplate,
} from './templates/engagement-letter-signed-notice';
import {
  ClientCredentialsAfterSigningData,
  clientCredentialsAfterSigningTemplate,
} from './templates/credentials-post-sign.template';
import {
  ClientApprovalData,
  clientApprovalTemplate,
} from './templates/client-approval.template';
import {
  SubscriptionWarningData,
  subscriptionWarningTemplate,
} from './templates/subscription-warning.template';
import {
  SubscriptionRenewedData,
  subscriptionRenewedTemplate,
} from './templates/subscription-renewed.template';
import {
  SubscriptionExpiredData,
  subscriptionExpiredTemplate,
} from './templates/subscription-expired.template';
import {
  EngagementLetterReminderData,
  engagementLetterReminderTemplate,
} from './templates/engagement-letter-reminder.template';
import {
  OnboardingSubmittedNotificationData,
  onboardingSubmittedNotificationTemplate,
} from './templates/client-onboarding-submitted.template';
import {
  ComplianceAlertEmailData,
  complianceAlertTemplate,
} from './templates/compliance-alert.template';
import {
  PaymentInvoiceEmailData,
  paymentInvoiceTemplate,
  PaymentReceiptEmailData,
  paymentReceiptTemplate,
} from './templates/payment-emails.template';
import {
  TeamMemberWelcomeEmailData,
  teamMemberWelcomeTemplate,
} from './templates/team-member-welcome.template';
import {
  EmployeeWelcomeEmailData,
  employeeWelcomeTemplate,
} from './templates/employee-welcome.template';
import {
  LeaveRequestNotificationData,
  leaveRequestNotificationTemplate,
  LeaveReviewNotificationData,
  leaveReviewNotificationTemplate,
} from './templates/leave-emails.template';
import {
  PayslipEmailData,
  payslipTemplate,
} from './templates/payslip.template';
import {
  InterviewInviteEmailData,
  interviewInviteTemplate,
} from './templates/interview-invite.template';
import {
  CandidateHiredEmailData,
  candidateHiredTemplate,
} from './templates/candidate-hired.template';
import {
  CandidateRejectionEmailData,
  candidateRejectionTemplate,
} from './templates/candidate-rejection.template';
import {
  ContractForSignatureEmailData,
  contractForSignatureTemplate,
} from './templates/contract-for-signature.template';
import {
  ContractSignedConfirmationEmailData,
  contractSignedConfirmationTemplate,
} from './templates/contract-signed-confirmation.template';
import {
  SignedContractCopyEmailData,
  signedContractCopyTemplate,
} from './templates/signed-contract-copy.template';

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

  async sendClientRejection(data: ClientRejectionEmailData): Promise<void> {
    const { subject, html } = clientRejectionTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendInfoRequest(data: InfoRequestEmailData): Promise<void> {
    const { subject, html } = infoRequestTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendEngagementLetterInvite(
    data: EngagementLetterInviteData,
  ): Promise<void> {
    const { subject, html } = engagementLetterInviteTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  // ─── New: Notify tenant when client has signed the engagement letter ─────────

  async sendEngagementLetterSignedNotification(
    data: EngagementLetterSignedNotificationData,
  ): Promise<void> {
    const { subject, html } = engagementLetterSignedNotificationTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendEngagementLetterReminder(
    data: EngagementLetterReminderData,
  ): Promise<void> {
    const { subject, html } = engagementLetterReminderTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }
  // ─── New: Send credentials to client after they sign the engagement letter ───

  async sendClientCredentialsAfterSigning(
    data: ClientCredentialsAfterSigningData,
  ): Promise<void> {
    const { subject, html } = clientCredentialsAfterSigningTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  // ─── New: Client approval notification ──────────────────────────────────────

  async sendClientApproval(data: ClientApprovalData): Promise<void> {
    const { subject, html } = clientApprovalTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  // ─── New: Subscription expiry warning (7, 3, 1 day before) ──────────────────

  async sendSubscriptionWarning(data: SubscriptionWarningData): Promise<void> {
    const { subject, html } = subscriptionWarningTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  // ─── New: Subscription expired + account deactivated ────────────────────────

  async sendSubscriptionExpired(data: SubscriptionExpiredData): Promise<void> {
    const { subject, html } = subscriptionExpiredTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  // ─── New: Subscription renewed + account reactivated ────────────────────────

  async sendSubscriptionRenewed(data: SubscriptionRenewedData): Promise<void> {
    const { subject, html } = subscriptionRenewedTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendSignedCertificate(data: SignedCertificateEmailData): Promise<void> {
    const { subject, html } = signedCertificateTemplate(data);

    // Send to client
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.toClient,
      subject,
      html,
    });

    // Send same certificate notification to tenant
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.toTenant,
      subject: `[Copy] ${subject}`,
      html,
    });
  }

  async sendOnboardingSubmittedNotification(
    data: OnboardingSubmittedNotificationData,
  ): Promise<void> {
    const { subject, html } = onboardingSubmittedNotificationTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendComplianceAlert(data: ComplianceAlertEmailData): Promise<void> {
    const { subject, html } = complianceAlertTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendPaymentReceipt(data: PaymentReceiptEmailData): Promise<void> {
    const { subject, html } = paymentReceiptTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendPaymentInvoice(data: PaymentInvoiceEmailData): Promise<void> {
    const { subject, html } = paymentInvoiceTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendTeamMemberWelcome(data: TeamMemberWelcomeEmailData): Promise<void> {
    const { subject, html } = teamMemberWelcomeTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendEmployeeWelcome(data: EmployeeWelcomeEmailData): Promise<void> {
    const { subject, html } = employeeWelcomeTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendLeaveRequestNotification(
    data: LeaveRequestNotificationData,
  ): Promise<void> {
    const { subject, html } = leaveRequestNotificationTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendLeaveReviewNotification(
    data: LeaveReviewNotificationData,
  ): Promise<void> {
    const { subject, html } = leaveReviewNotificationTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendPayslip(data: PayslipEmailData): Promise<void> {
    const { subject, html } = payslipTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendInterviewInvite(data: InterviewInviteEmailData): Promise<void> {
    const { subject, html } = interviewInviteTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendHiredNotification(data: CandidateHiredEmailData): Promise<void> {
    const { subject, html } = candidateHiredTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendRejectionNotification(
    data: CandidateRejectionEmailData,
  ): Promise<void> {
    const { subject, html } = candidateRejectionTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendContractForSignature(
    data: ContractForSignatureEmailData,
  ): Promise<void> {
    const { subject, html } = contractForSignatureTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendContractSignedConfirmation(
    data: ContractSignedConfirmationEmailData,
  ): Promise<void> {
    const { subject, html } = contractSignedConfirmationTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendSignedContractCopy(
    data: SignedContractCopyEmailData,
    pdfBuffer?: Buffer,
  ): Promise<void> {
    const { subject, html } = signedContractCopyTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
      attachments: pdfBuffer
        ? [
            {
              filename: 'signed-agreement.pdf',
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ]
        : undefined,
    });
  }
}
