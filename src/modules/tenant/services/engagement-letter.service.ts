import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';
import {
  EngagementLetter,
  EngagementLetterDocument,
  ClientEngagementSigning,
  ClientEngagementSigningDocument,
} from '../schemas/engagement-letter.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileDocument,
} from '../schemas/client-profile.schema';
import { EmailService } from '../../../common/utils/mailing/email.service';
import { AccountStatus } from '../../../common/interfaces/user-role.enum';
import { generateSigningCertificate } from '../../../common/utils/pdf/signing-certificate.util';

@Injectable()
export class EngagementLetterService {
  constructor(
    @InjectModel(EngagementLetter.name)
    private readonly letterModel: Model<EngagementLetterDocument>,
    @InjectModel(ClientEngagementSigning.name)
    private readonly signingModel: Model<ClientEngagementSigningDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(ClientProfileRecord.name)
    private readonly profileModel: Model<ClientProfileDocument>,
    private readonly mailService: EmailService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // TENANT SETUP — Upload engagement document
  // ═══════════════════════════════════════════════════════════

  /**
   * Called after Multer saves the PDF to /uploads/engagement/
   * Tenant uploads once — re-uploading increments the version.
   */
  async uploadLetter(
    tenantId: string,
    file: Express.Multer.File,
    dto: {
      documentType: 'engagement_letter' | 'terms_and_agreement';
      title: string;
    },
  ): Promise<EngagementLetterDocument> {
    if (!file) throw new BadRequestException('No file uploaded.');

    if (file.mimetype !== 'application/pdf') {
      // Remove the uploaded file if wrong type
      fs.unlinkSync(file.path);
      throw new BadRequestException('Only PDF files are accepted.');
    }

    const existing = await this.letterModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
    });

    if (existing) {
      // Delete the old file from disk before replacing
      if (existing.filePath && fs.existsSync(existing.filePath)) {
        fs.unlinkSync(existing.filePath);
      }

      existing.documentType = dto.documentType;
      existing.title = dto.title;
      existing.filePath = file.path; // e.g. uploads/engagement/uuid.pdf
      existing.originalFileName = file.originalname;
      existing.fileSize = file.size;
      existing.version = existing.version + 1;
      existing.isActive = true;
      return existing.save();
    }

    return this.letterModel.create({
      tenantId: new Types.ObjectId(tenantId),
      documentType: dto.documentType,
      title: dto.title,
      filePath: file.path,
      originalFileName: file.originalname,
      fileSize: file.size,
      version: 1,
      bypassSigning: false,
      isActive: true,
    });
  }

  /** Get the tenant's current engagement document */
  async getMyLetter(
    tenantId: string,
  ): Promise<EngagementLetterDocument | null> {
    return this.letterModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .lean() as any;
  }

  /** Delete the tenant's engagement document */
  async deleteLetter(tenantId: string): Promise<{ success: boolean }> {
    const letter = await this.letterModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!letter) throw new NotFoundException('No engagement document found.');

    if (letter.filePath && fs.existsSync(letter.filePath)) {
      fs.unlinkSync(letter.filePath);
    }

    await this.letterModel.deleteOne({
      tenantId: new Types.ObjectId(tenantId),
    });
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════
  // BYPASS TOGGLE
  // Tenant consciously opts out of the signing requirement
  // ═══════════════════════════════════════════════════════════

  async setBypass(
    tenantId: string,
    bypass: boolean,
  ): Promise<{ bypassSigning: boolean }> {
    const existing = await this.letterModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
    });

    if (existing) {
      await this.letterModel.findOneAndUpdate(
        { tenantId: new Types.ObjectId(tenantId) },
        { bypassSigning: bypass },
        { new: true },
      );
    } else {
      await this.letterModel.create({
        tenantId: new Types.ObjectId(tenantId),
        documentType: 'engagement_letter',
        title: 'bypass',
        filePath: '',
        originalFileName: '',
        fileSize: 0,
        version: 0,
        bypassSigning: bypass,
        isActive: false,
      });
    }

    return { bypassSigning: bypass };
  }

  // ═══════════════════════════════════════════════════════════
  // GATE CHECK — called by quickAddClient before creating a client
  // ═══════════════════════════════════════════════════════════

  /**
   * Returns:
   *   { canProceed: true, requiresSigning: false } — bypass is on, send credentials directly
   *   { canProceed: true, requiresSigning: true }  — letter exists, go through signing flow
   *   throws ForbiddenException                    — no letter, no bypass — block
   */
  async checkTenantSetup(tenantId: string): Promise<{
    canProceed: boolean;
    requiresSigning: boolean;
    letter: EngagementLetterDocument | null;
  }> {
    const record = await this.letterModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .lean();

    // No record at all — tenant hasn't set up anything
    if (!record) {
      throw new ForbiddenException(
        'You must upload an engagement letter or terms & agreement before adding clients. ' +
          'Go to Settings → Engagement Document to upload yours.',
      );
    }

    // Bypass is explicitly on — skip signing
    if (record.bypassSigning) {
      return { canProceed: true, requiresSigning: false, letter: null };
    }

    // Has a real document uploaded
    if (record.isActive && record.filePath) {
      return {
        canProceed: true,
        requiresSigning: true,
        letter: record as EngagementLetterDocument,
      };
    }

    // Record exists but no file and no bypass — incomplete setup
    throw new ForbiddenException(
      'Your engagement document setup is incomplete. ' +
        'Please upload your engagement letter or terms & agreement in Settings, ' +
        'or enable the bypass option if you do not require client signing.',
    );
  }

  // ═══════════════════════════════════════════════════════════
  // SEND — Called by quickAddClient when requiresSigning = true
  // ═══════════════════════════════════════════════════════════

  async sendEngagementLetterToClient(
    clientId: string,
    tenantId: string,
    letter: EngagementLetterDocument,
  ): Promise<void> {
    const client = await this.userModel.findById(clientId).lean();
    if (!client) throw new NotFoundException('Client not found');

    const tenant = await this.userModel
      .findById(tenantId)
      .select('tenantProfile.businessName email firstName')
      .lean();

    const signingToken = uuidv4();
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 7);

    await this.signingModel.create({
      clientId: new Types.ObjectId(clientId),
      tenantId: new Types.ObjectId(tenantId),
      letterId: (letter as any)._id,
      letterVersion: letter.version,
      signingToken,
      tokenExpiresAt,
      status: 'pending',
    });

    const businessName =
      (tenant as any)?.tenantProfile?.businessName || 'Your Advisor';
    const signingUrl = `${process.env.CLIENT_APP_URL}/engagement-letter/${signingToken}`;

    await this.mailService.sendEngagementLetterInvite({
      to: (client as any).email,
      firstName: (client as any).firstName,
      tenantBusinessName: businessName,
      letterTitle: letter.title,
      signingUrl,
      expiresAt: tokenExpiresAt,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC — Get letter for signing page (no auth)
  // Returns the PDF file path + metadata so frontend can render it
  // ═══════════════════════════════════════════════════════════

  async getLetterByToken(token: string) {
    const signing = await this.signingModel
      .findOne({ signingToken: token })
      .lean();

    if (!signing) {
      throw new NotFoundException(
        'This invitation link is invalid or has expired.',
      );
    }

    if (signing.status === 'signed') {
      throw new BadRequestException('You have already signed this document.');
    }

    if (signing.status === 'expired' || new Date() > signing.tokenExpiresAt) {
      await this.signingModel.findOneAndUpdate(
        { signingToken: token },
        { status: 'expired' },
      );
      throw new BadRequestException(
        'This invitation link has expired. Please contact your advisor to resend.',
      );
    }

    const letter = await this.letterModel.findById(signing.letterId).lean();

    if (!letter) throw new NotFoundException('Document not found.');

    const client = await this.userModel
      .findById(signing.clientId)
      .select('firstName lastName email')
      .lean();

    const tenant = await this.userModel
      .findById(signing.tenantId)
      .select('tenantProfile.businessName')
      .lean();

    // Return the public URL path for the PDF iframe
    // const pdfUrl = `${process.env.APP_URL}/${(letter as any).filePath.replace(/\\/g, '/')}`;
    // filePath may be absolute (/home/.../uploads/engagement/file.pdf)
    // or relative (uploads/engagement/file.pdf)
    // We only want the part from 'uploads/' onwards
    const rawPath = (letter as any).filePath.replace(/\\/g, '/');
    const uploadsIndex = rawPath.indexOf('uploads/');
    const relativePath =
      uploadsIndex !== -1 ? rawPath.slice(uploadsIndex) : rawPath;
    const pdfUrl = `${process.env.APP_URL}/${relativePath}`;

    return {
      token,
      clientName: `${(client as any)?.firstName} ${(client as any)?.lastName}`,
      clientEmail: (client as any)?.email,
      tenantBusinessName:
        (tenant as any)?.tenantProfile?.businessName || 'Your Advisor',
      document: {
        title: (letter as any).title,
        documentType: (letter as any).documentType,
        version: (letter as any).version,
        pdfUrl, // frontend renders this in an iframe
      },
      expiresAt: signing.tokenExpiresAt,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC — Client signs (no auth)
  // ═══════════════════════════════════════════════════════════

  async signLetter(
    token: string,
    dto: { confirmedName: string; ipAddress?: string },
  ) {
    const signing = await this.signingModel.findOne({ signingToken: token });

    if (!signing) throw new NotFoundException('Invalid signing link.');
    if (signing.status === 'signed') {
      throw new BadRequestException('This document has already been signed.');
    }
    if (signing.status === 'expired' || new Date() > signing.tokenExpiresAt) {
      await this.signingModel.findOneAndUpdate(
        { signingToken: token },
        { status: 'expired' },
      );
      throw new BadRequestException(
        'This link has expired. Please contact your advisor.',
      );
    }

    if (!dto.confirmedName?.trim()) {
      throw new BadRequestException(
        'Please type your full name to confirm signing.',
      );
    }

    const signedAt = new Date();

    // ── Load all data needed for certificate ─────────────────
    const [letter, client, tenant] = await Promise.all([
      this.letterModel.findById(signing.letterId).lean(),
      this.userModel.findById(signing.clientId).lean(),
      this.userModel
        .findById(signing.tenantId)
        .select('tenantProfile.businessName email firstName')
        .lean(),
    ]);

    if (!letter || !client || !tenant) {
      throw new NotFoundException('Required data not found.');
    }

    const businessName =
      (tenant as any)?.tenantProfile?.businessName || 'Your Advisor';
    const clientFullName = `${(client as any).firstName} ${(client as any).lastName}`;

    // ── Generate signed certificate PDF ──────────────────────
    const certDir = path.join('uploads', 'engagement', 'signed');
    const certFileName = `${signing.clientId}-${Date.now()}.pdf`;
    const certOutputPath = path.join(certDir, certFileName);

    let certificatePath: string | null = null;
    try {
      await generateSigningCertificate({
        letterTitle: (letter as any).title,
        letterVersion: (letter as any).version,
        documentType: (letter as any).documentType,
        tenantBusinessName: businessName,
        tenantEmail: (tenant as any).email,
        clientName: clientFullName,
        clientEmail: (client as any).email,
        signedByName: dto.confirmedName.trim(),
        signedAt,
        signedIpAddress: dto.ipAddress || null,
        outputPath: certOutputPath,
      });
      certificatePath = certOutputPath;
    } catch (err) {
      // Certificate generation failure should not block signing
      console.error('Certificate generation failed:', err.message);
    }

    // ── Mark signing record as complete ──────────────────────
    await this.signingModel.findOneAndUpdate(
      { signingToken: token },
      {
        status: 'signed',
        signedAt,
        signedByName: dto.confirmedName.trim(),
        signedIpAddress: dto.ipAddress || null,
        signedCertificatePath: certificatePath,
      },
    );

    // ── Update client profile ─────────────────────────────────
    await this.profileModel.findOneAndUpdate(
      { userId: signing.clientId },
      {
        engagementLetterSigned: true,
        engagementLetterSignedAt: signedAt,
        $push: {
          'metadata.auditTrail': {
            action: 'engagement_letter_signed',
            timestamp: signedAt,
            detail: `Signed as "${dto.confirmedName.trim()}"`,
          },
        },
      },
    );

    // ── 1. Notify tenant ──────────────────────────────────────
    await this.mailService.sendEngagementLetterSignedNotification({
      to: (tenant as any).email,
      tenantFirstName: (tenant as any).firstName,
      clientName: clientFullName,
      clientEmail: (client as any).email,
      signedAt,
      businessName,
    });

    // ── 2. Send client their credentials ─────────────────────
    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    await this.userModel.findByIdAndUpdate(signing.clientId, {
      password: hashedPassword,
      status: AccountStatus.PENDING,
      mustChangePassword: true,
    });

    await this.mailService.sendClientCredentialsAfterSigning({
      to: (client as any).email,
      firstName: (client as any).firstName,
      tenantBusinessName: businessName,
      tempPassword,
      loginUrl: `${process.env.CLIENT_APP_URL}/login`,
    });

    // ── 3. Email signed certificate to both parties ───────────
    if (certificatePath && fs.existsSync(certificatePath)) {
      const certUrl = `${process.env.APP_URL}/${certificatePath.replace(/\\/g, '/')}`;

      await this.mailService.sendSignedCertificate({
        toClient: (client as any).email,
        toTenant: (tenant as any).email,
        clientName: clientFullName,
        tenantBusinessName: businessName,
        letterTitle: (letter as any).title,
        signedAt,
        certificateUrl: certUrl,
      });
    }

    return {
      success: true,
      message:
        'Thank you — your document has been signed. ' +
        'A signed copy has been sent to your email. ' +
        'Your login credentials will arrive in a separate email shortly.',
    };
  }

  // ═══════════════════════════════════════════════════════════
  // TENANT — View all client signing records
  // ═══════════════════════════════════════════════════════════

  async getSigningStatus(tenantId: string) {
    return this.signingModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .populate('clientId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();
  }

  async resendSigningLink(clientId: string, tenantId: string) {
    const letter = await this.letterModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      isActive: true,
    });
    if (!letter) {
      throw new NotFoundException('No active engagement document found.');
    }

    // Expire any pending tokens for this client
    await this.signingModel.updateMany(
      {
        clientId: new Types.ObjectId(clientId),
        tenantId: new Types.ObjectId(tenantId),
        status: 'pending',
      },
      { status: 'expired' },
    );

    // Send fresh link
    await this.sendEngagementLetterToClient(clientId, tenantId, letter);
    return { success: true, message: 'Signing link resent.' };
  }

  // ═══════════════════════════════════════════════════════════
  // TENANT — Mark a client as having signed offline
  // For existing clients who signed outside the platform
  // ═══════════════════════════════════════════════════════════

  async markSignedOffline(
    clientId: string,
    tenantId: string,
    dto: { signedDate: string; note?: string },
  ) {
    const client = await this.userModel.findOne({
      _id: clientId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!client) throw new NotFoundException('Client not found.');

    await this.profileModel.findOneAndUpdate(
      { userId: new Types.ObjectId(clientId) },
      {
        engagementLetterSigned: true,
        engagementLetterSignedAt: new Date(dto.signedDate),
        $push: {
          'metadata.auditTrail': {
            action: 'engagement_letter_signed_offline',
            timestamp: new Date(),
            detail: dto.note || 'Marked as signed offline by tenant',
          },
        },
      },
    );

    return {
      success: true,
      message: 'Client marked as having signed engagement document offline.',
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const special = '@#$!';
    let pass = '';
    for (let i = 0; i < 10; i++)
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    pass += special.charAt(Math.floor(Math.random() * special.length));
    pass += Math.floor(Math.random() * 9);
    return pass;
  }
}
