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
  StrToFicEmailData,
  strToFicTemplate,
} from './templates/str-fic-submission.template';
import {
  InfoRequestEmailData,
  infoRequestTemplate,
} from './templates/client-info-request.template';
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
import {
  DisputeFiledAgainstYouData,
  disputeFiledAgainstYouTemplate,
} from './templates/dispute-filed-against-you.template';
import {
  DisputeAcknowledgedData,
  disputeAcknowledgedTemplate,
} from './templates/dispute-acknowledged.template';
import {
  DisputeHearingScheduledData,
  disputeHearingScheduledTemplate,
} from './templates/dispute-hearing-scheduled.template';
import {
  DisputeWarningIssuedData,
  disputeWarningIssuedTemplate,
} from './templates/dispute-warning-issued.template';
import {
  DisputeSuspensionEmailData,
  disputeSuspensionEmailTemplate,
} from './templates/dispute-suspension-letter.template';
import {
  EmployeeTerminatedData,
  employeeTerminatedTemplate,
} from './templates/employee-terminated.template';
import {
  DisputeRespondentReplyData,
  disputeRespondentReplyTemplate,
} from './templates/dispute-respondent-reply.template';
import {
  EmployeeRecordAddedData,
  employeeRecordAddedTemplate,
} from './templates/employee-record-added.template';
import {
  IssuedDocumentEmailData,
  issuedDocumentTemplate,
} from './templates/issued-document.template';
import {
  NewJobOpeningEmailData,
  newJobOpeningTemplate,
} from './templates/new-job-opening.template';
import {
  JobOpeningFilledEmailData,
  jobOpeningFilledTemplate,
} from './templates/job-opening-filled.template';
import {
  NewCourseEmailData,
  newCourseTemplate,
} from './templates/new-course.template';
import {
  BoardMemberAppointedEmailData,
  boardMemberAppointedTemplate,
} from './templates/board-member-appointed.template';
import {
  CommitteeMemberAddedEmailData,
  committeeMemberAddedTemplate,
} from './templates/committee-member-added.template';
import {
  CommitteeTaskAddedEmailData,
  committeeTaskAddedTemplate,
} from './templates/committee-task-added.template';
import {
  CommitteeChairAssignedEmailData,
  committeeChairAssignedTemplate,
} from './templates/committee-chair-assgned.template';
import {
  MeetingDispatchEmailData,
  meetingDispatchTemplate,
} from './templates/meeting-dispatch.template';
import {
  MeetingMinutesEmailData,
  meetingMinutesTemplate,
} from './templates/meeting-minutes.template';
import {
  MeetingPostponedEmailData,
  meetingPostponedTemplate,
} from './templates/meeting-postponed.template';
import {
  MeetingAckReminderEmailData,
  meetingAckReminderTemplate,
} from './templates/meeting-ack-reminder.template';
import {
  ResolutionCirculatedEmailData,
  resolutionCirculatedTemplate,
} from './templates/resolution-circulated.template';
import {
  ComplianceDeadlineReminderEmailData,
  complianceDeadlineReminderTemplate,
} from './templates/compliance-deadline-reminder.template';
import {
  ContractObligationReminderEmailData,
  contractObligationReminderTemplate,
} from './templates/contract-obligation-reminder.template';
import {
  PolicyAcknowledgmentEmailData,
  policyAcknowledgmentTemplate,
} from './templates/policy-acknowledgment.template';
import {
  DataRoomDeliveryEmailData,
  dataRoomDeliveryTemplate,
} from './templates/data-room-delivery.template';
import {
  DealReviewInviteEmailData,
  dealReviewInviteTemplate,
} from './templates/deal-review-invite.template';
import {
  QuoteSentEmailData,
  quoteSentTemplate,
} from './templates/quote-sent.template';
import {
  InvoiceSentEmailData,
  invoiceSentTemplate,
} from './templates/invoice-sent.template';
import {
  PurchaseOrderIssuedEmailData,
  purchaseOrderIssuedTemplate,
} from './templates/purchase-order-issued.template';
import {
  TaxObligationReminderEmailData,
  taxObligationReminderTemplate,
} from './templates/tax-obligation-reminder.template';

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

  // Real STR submission to Rwanda FIC — the goAML XML is sent as a
  // genuine attachment, not just described in the email body.
  async sendStrToFic(data: StrToFicEmailData): Promise<void> {
    const { subject, html } = strToFicTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
      attachments: [
        {
          filename: `${data.strId}.xml`,
          content: data.xml,
          contentType: 'application/xml',
        },
      ],
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

  async sendPayslip(data: PayslipEmailData, pdfBuffer?: Buffer): Promise<void> {
    const { subject, html } = payslipTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
      attachments: pdfBuffer
        ? [
            {
              fileName: 'payslip.pdf',
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ]
        : undefined,
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
    pdfBuffer?: Buffer,
  ): Promise<void> {
    const { subject, html } = contractForSignatureTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
      attachments: pdfBuffer
        ? [
            {
              filename: 'contract-for-review.pdf',
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ]
        : undefined,
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

  async sendDisputeFiledAgainstYou(
    data: DisputeFiledAgainstYouData,
  ): Promise<void> {
    const { subject, html } = disputeFiledAgainstYouTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendDisputeAcknowledged(data: DisputeAcknowledgedData): Promise<void> {
    const { subject, html } = disputeAcknowledgedTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendDisputeHearingScheduled(
    data: DisputeHearingScheduledData,
  ): Promise<void> {
    const { subject, html } = disputeHearingScheduledTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendDisputeWarningIssued(
    data: DisputeWarningIssuedData,
  ): Promise<void> {
    const { subject, html } = disputeWarningIssuedTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendDisputeSuspensionLetter(
    data: DisputeSuspensionEmailData,
    letterPdf: Buffer,
  ): Promise<void> {
    const { subject, html } = disputeSuspensionEmailTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
      attachments: [
        {
          filename: `Suspension-Letter-${data.caseNumber}.pdf`,
          content: letterPdf,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  async sendEmployeeTerminated(data: EmployeeTerminatedData): Promise<void> {
    const { subject, html } = employeeTerminatedTemplate(data);
    await this.transporter.sendMail({
      from: `"${data.businessName}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendDisputeRespondentReply(
    data: DisputeRespondentReplyData,
  ): Promise<void> {
    const { subject, html } = disputeRespondentReplyTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendEmployeeRecordAdded(data: EmployeeRecordAddedData): Promise<void> {
    const { subject, html } = employeeRecordAddedTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendIssuedDocument(
    data: IssuedDocumentEmailData,
    pdfBuffer: Buffer,
  ): Promise<void> {
    const { subject, html } = issuedDocumentTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
      attachments: [
        {
          filename: `${data.documentName.replace(/\s+/g, '_')}.pdf`,
          content: pdfBuffer,
        },
      ],
    });
  }

  async sendNewJobOpeningNotice(data: NewJobOpeningEmailData): Promise<void> {
    const { subject, html } = newJobOpeningTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendJobOpeningFilledNotice(
    data: JobOpeningFilledEmailData,
  ): Promise<void> {
    const { subject, html } = jobOpeningFilledTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendNewCourseNotice(data: NewCourseEmailData): Promise<void> {
    const { subject, html } = newCourseTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendBoardMemberAppointed(
    data: BoardMemberAppointedEmailData,
  ): Promise<void> {
    const { subject, html } = boardMemberAppointedTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendCommitteeChairAssigned(
    data: CommitteeChairAssignedEmailData,
  ): Promise<void> {
    const { subject, html } = committeeChairAssignedTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendCommitteeMemberAdded(
    data: CommitteeMemberAddedEmailData,
  ): Promise<void> {
    const { subject, html } = committeeMemberAddedTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendCommitteeTaskAdded(
    data: CommitteeTaskAddedEmailData,
  ): Promise<void> {
    const { subject, html } = committeeTaskAddedTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendMeetingDispatch(
    data: MeetingDispatchEmailData,
    attachments: { filename: string; path: string }[] = [],
  ): Promise<void> {
    const { subject, html } = meetingDispatchTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
      attachments,
    });
  }

  async sendMeetingMinutes(
    data: MeetingMinutesEmailData,
    attachments: { filename: string; content: Buffer }[] = [],
  ): Promise<void> {
    const { subject, html } = meetingMinutesTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
      attachments,
    });
  }

  async sendMeetingPostponed(data: MeetingPostponedEmailData): Promise<void> {
    const { subject, html } = meetingPostponedTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendMeetingAckReminder(
    data: MeetingAckReminderEmailData,
  ): Promise<void> {
    const { subject, html } = meetingAckReminderTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendResolutionCirculated(
    data: ResolutionCirculatedEmailData,
  ): Promise<void> {
    const { subject, html } = resolutionCirculatedTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendComplianceDeadlineReminder(
    data: ComplianceDeadlineReminderEmailData,
  ): Promise<void> {
    const { subject, html } = complianceDeadlineReminderTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendContractObligationReminder(
    data: ContractObligationReminderEmailData,
  ): Promise<void> {
    const { subject, html } = contractObligationReminderTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendPolicyForAcknowledgment(
    data: PolicyAcknowledgmentEmailData,
  ): Promise<void> {
    const { subject, html } = policyAcknowledgmentTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendDataRoomDelivery(
    data: DataRoomDeliveryEmailData,
    attachments: { filename: string; content: Buffer }[],
  ): Promise<void> {
    const { subject, html } = dataRoomDeliveryTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
      attachments,
    });
  }

  async sendDealReviewInvite(data: DealReviewInviteEmailData): Promise<void> {
    const { subject, html } = dealReviewInviteTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendQuoteEmail(data: QuoteSentEmailData): Promise<void> {
    const { subject, html } = quoteSentTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendInvoiceEmail(data: InvoiceSentEmailData): Promise<void> {
    const { subject, html } = invoiceSentTemplate(data);
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  async sendPurchaseOrderIssued(
    data: PurchaseOrderIssuedEmailData,
    pdfBuffer: Buffer,
  ): Promise<void> {
    const { subject, html } = purchaseOrderIssuedTemplate(data);
    await this.transporter.sendMail({
      from: `"${data.firmName}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
      attachments: [
        {
          filename: `${data.ref}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  async sendTaxObligationReminder(
    data: TaxObligationReminderEmailData,
  ): Promise<void> {
    const { subject, html } = taxObligationReminderTemplate(data);
    await this.transporter.sendMail({
      from: `"${data.firmName}" <${process.env.SMTP_FROM}>`,
      to: data.to,
      subject,
      html,
    });
  }

  // Generic send for arbitrary content that doesn't come from a
  // fixed template — used by Communications campaigns, where the
  // subject/body are tenant-authored rather than one of the
  // predefined templates above. Same real transporter as every
  // other method in this class.
  async sendCampaign(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
      to,
      subject,
      html,
    });
  }
}
