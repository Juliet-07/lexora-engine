import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import {
  Contract,
  ContractDocument,
  ContractStatus,
  InteractionType,
} from '../schemas/contract.schema';
import {
  ContractTemplate,
  ContractTemplateDocument,
} from '../schemas/contract-template.schema';
import {
  SigningToken,
  SigningTokenDocument,
} from '../schemas/signing-token.schema';
import { Candidate, CandidateDocument } from '../schemas/candidate.schema';
import { Employee, EmployeeDocument } from '../schemas/employee.schema';
import { EmailService } from 'src/common/utils/mailing/email.service';
import {
  renderContractBody,
  buildMergeFieldsForCandidate,
  buildMergeFieldsForEmployee,
} from '../../../common/utils/contract-fields.util';
import {
  GenerateContractFromCandidateDto,
  GenerateContractForEmployeeDto,
  TenantRespondToCommentDto,
  EditContractBodyDto,
  CountersignContractDto,
  IssueLetterDto,
} from '../dtos/contract.dto';
import { ContractPdfService } from './contract-pdf.service';

const DEFAULT_EXPIRY_HOURS = 168; // 7 days

@Injectable()
export class ContractService {
  constructor(
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectModel(ContractTemplate.name)
    private readonly templateModel: Model<ContractTemplateDocument>,
    @InjectModel(SigningToken.name)
    private readonly tokenModel: Model<SigningTokenDocument>,
    @InjectModel(Candidate.name)
    private readonly candidateModel: Model<CandidateDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly emailService: EmailService,
    private readonly pdfService: ContractPdfService,
  ) {}

  // Generates a contract from a candidate in the pipeline — the
  // "moving to Hired" integration point. Template must match the
  // candidate's workerCategory, checked explicitly — sending an
  // employee contract to a consultant (or vice versa) is exactly
  // the mistake this categorization exists to prevent.
  async generateFromCandidate(
    tenantId: string,
    tenantCompanyName: string,
    dto: GenerateContractFromCandidateDto,
  ): Promise<ContractDocument> {
    const tId = new Types.ObjectId(tenantId);

    const candidate = await this.candidateModel.findOne({
      _id: dto.candidateId,
      tenantId: tId,
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    const template = await this.templateModel.findOne({
      _id: dto.templateId,
      tenantId: tId,
    });
    if (!template) throw new NotFoundException('Contract template not found');

    if (template.workerCategory !== candidate.workerCategory) {
      throw new BadRequestException(
        `This template is for ${template.workerCategory}s, but the candidate is a ${candidate.workerCategory}.`,
      );
    }

    const fields = buildMergeFieldsForCandidate({
      candidateName: candidate.name,
      roleAppliedFor: candidate.roleAppliedFor,
      workerCategory: candidate.workerCategory,
      tenantCompanyName,
    });

    return this.contractModel.create({
      tenantId: tId,
      templateId: template._id,
      templateName: template.name,
      candidateId: candidate._id,
      employeeId: null,
      signerName: candidate.name,
      signerEmail: candidate.email,
      workerCategory: candidate.workerCategory,
      renderedBody: renderContractBody(template.body, fields),
      status: ContractStatus.DRAFT,
    });
  }

  async generateForEmployee(
    tenantId: string,
    tenantCompanyName: string,
    dto: GenerateContractForEmployeeDto,
  ): Promise<ContractDocument> {
    const tId = new Types.ObjectId(tenantId);

    const employee = await this.employeeModel.findOne({
      _id: dto.employeeId,
      tenantId: tId,
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const template = await this.templateModel.findOne({
      _id: dto.templateId,
      tenantId: tId,
    });
    if (!template) throw new NotFoundException('Contract template not found');

    const employeeCategory = (employee as any).workerCategory ?? 'employee';
    if (template.workerCategory !== employeeCategory) {
      throw new BadRequestException(
        `This template is for ${template.workerCategory}s, but this employee is classified as a ${employeeCategory}.`,
      );
    }

    const fields = buildMergeFieldsForEmployee({
      employeeName: `${employee.firstName} ${employee.lastName}`,
      jobTitle: employee.jobTitle,
      startDate: employee.startDate
        ? new Date(employee.startDate).toISOString().slice(0, 10)
        : '',
      salary: employee.salary,
      salaryCurrency: employee.salaryCurrency,
      workerCategory: employeeCategory,
      tenantCompanyName,
      reason: dto.reason,
      effectiveDate: dto.effectiveDate,
      endDate: dto.endDate,
    });

    return this.contractModel.create({
      tenantId: tId,
      templateId: template._id,
      templateName: template.name,
      candidateId: null,
      employeeId: employee._id,
      signerName: `${employee.firstName} ${employee.lastName}`,
      signerEmail: employee.email,
      workerCategory: employeeCategory,
      renderedBody: renderContractBody(template.body, fields),
      status: ContractStatus.DRAFT,
      requiresSignature: template.requiresSignature,
    });
  }

  async getAll(tenantId: string, status?: string): Promise<ContractDocument[]> {
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    if (status) query.status = status;
    return this.contractModel.find(query).sort({ createdAt: -1 }).lean() as any;
  }

  async getById(
    tenantId: string,
    contractId: string,
  ): Promise<ContractDocument> {
    const contract = await this.contractModel.findOne({
      _id: contractId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  // Sends (or re-sends) a contract for signature — issues a FRESH
  // token every time. A previous unconsumed token for this contract
  // is not explicitly invalidated (it simply becomes one of
  // potentially several valid links) — see sign() below for why
  // multiple valid tokens per contract is the safer default.
  async send(
    tenantId: string,
    contractId: string,
    businessName: string,
    expiresInHours?: number,
  ): Promise<ContractDocument> {
    const contract = await this.getById(tenantId, contractId);

    if (contract.requiresSignature === false) {
      throw new BadRequestException(
        'This document is a one-way letter — use "Issue Letter" instead of sending it for signature.',
      );
    }

    if (contract.status === ContractStatus.SIGNED) {
      throw new ConflictException('This contract has already been signed.');
    }

    const wasAlreadySent = contract.status === ContractStatus.SENT;
    contract.status = ContractStatus.SENT;
    contract.interactions.push({
      type: wasAlreadySent ? InteractionType.RESENT : InteractionType.SENT,
      occurredAt: new Date(),
      actor: 'tenant',
      message: null,
      tenantUserId: null,
    });
    await contract.save();

    const token = await this.issueSigningToken(
      contract,
      expiresInHours ?? DEFAULT_EXPIRY_HOURS,
    );

    const baseUrl = process.env.TENANT_APP_URL;
    if (!baseUrl) {
      throw new Error(
        'TENANT_APP_URL is not configured - cannot build a valid signing link',
      );
    }
    try {
      await this.emailService.sendContractForSignature({
        to: contract.signerEmail,
        signerName: contract.signerName,
        signingUrl: `${baseUrl}/sign-contract/${token}`,
      });
    } catch (err) {
      console.error(`Failed to send contract email for ${contractId}:`, err);
    }

    return contract;
  }

  async respondToComment(
    tenantId: string,
    contractId: string,
    tenantUserId: string,
    dto: TenantRespondToCommentDto,
  ): Promise<ContractDocument> {
    const contract = await this.getById(tenantId, contractId);
    contract.interactions.push({
      type: InteractionType.TENANT_RESPONSE,
      occurredAt: new Date(),
      actor: 'tenant',
      message: dto.message,
      tenantUserId: new Types.ObjectId(tenantUserId),
    });
    await contract.save();
    return contract;
  }

  async editBody(
    tenantId: string,
    contractId: string,
    dto: EditContractBodyDto,
  ): Promise<ContractDocument> {
    const contract = await this.getById(tenantId, contractId);

    if (contract.status !== ContractStatus.SENT) {
      throw new ConflictException(
        contract.status === ContractStatus.SIGNED
          ? 'This contract has already been signed and can no longer be edited.'
          : contract.status === ContractStatus.DECLINED
            ? 'This contract was declined and can no longer be edited.'
            : 'Only a contract that has been sent can be edited. Generate or send it first.',
      );
    }

    contract.renderedBody = dto.renderedBody;
    contract.interactions.push({
      type: InteractionType.UPDATED,
      occurredAt: new Date(),
      actor: 'tenant',
      message: dto.changeNote ?? null,
      tenantUserId: null,
    });

    await contract.save();
    return contract;
  }

  // ── SIGNER-FACING (public, token-gated) ──

  // Resolves a token to its contract WITHOUT consuming it — used
  // for viewing and for comment/decline, which don't end the
  // signing window. Only an actual signature consumes the token.
  async getContractByToken(token: string): Promise<ContractDocument> {
    const tokenDoc = await this.tokenModel.findOne({ token });
    if (!tokenDoc)
      throw new NotFoundException('Invalid or unknown signing link.');
    if (tokenDoc.expiresAt < new Date()) {
      throw new BadRequestException(
        'This signing link has expired. Ask the sender to resend it.',
      );
    }

    const contract = await this.contractModel.findById(tokenDoc.contractId);
    if (!contract) throw new NotFoundException('Contract not found.');
    return contract;
  }

  async recordView(token: string): Promise<void> {
    const contract = await this.getContractByToken(token);
    contract.interactions.push({
      type: InteractionType.VIEWED,
      occurredAt: new Date(),
      actor: 'signer',
      message: null,
      tenantUserId: null,
    });
    await contract.save();
  }

  async submitComment(
    token: string,
    message: string,
  ): Promise<ContractDocument> {
    const contract = await this.getContractByToken(token);
    if (
      contract.status === ContractStatus.SIGNED ||
      contract.status === ContractStatus.DECLINED
    ) {
      throw new ConflictException(
        'This contract is already finalized and can no longer receive comments.',
      );
    }
    contract.interactions.push({
      type: InteractionType.COMMENT,
      occurredAt: new Date(),
      actor: 'signer',
      message,
      tenantUserId: null,
    });
    await contract.save();
    return contract;
  }

  async sign(
    token: string,
    signerName: string,
    signatureImageData: string | null,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<ContractDocument> {
    const tokenDoc = await this.tokenModel.findOne({ token });
    if (!tokenDoc)
      throw new NotFoundException('Invalid or unknown signing link.');
    if (tokenDoc.expiresAt < new Date()) {
      throw new BadRequestException(
        'This signing link has expired. Ask the sender to resend it.',
      );
    }
    if (tokenDoc.consumedAt) {
      throw new ConflictException('This signing link has already been used.');
    }

    const contract = await this.contractModel.findById(tokenDoc.contractId);
    if (!contract) throw new NotFoundException('Contract not found.');
    if (contract.status === ContractStatus.SIGNED) {
      throw new ConflictException('This contract has already been signed.');
    }
    if (contract.status === ContractStatus.DECLINED) {
      throw new ConflictException(
        'This contract was declined and can no longer be signed.',
      );
    }

    const signedAt = new Date();
    contract.status = ContractStatus.SIGNED;
    contract.signature = {
      signedAt,
      signerName,
      signatureImageData: signatureImageData ?? null,
      ipAddress,
      userAgent,
    };
    contract.interactions.push({
      type: InteractionType.SIGNED,
      occurredAt: signedAt,
      actor: 'signer',
      message: null,
      tenantUserId: null,
    });
    await contract.save();

    // Consume the token used for THIS signature. Other still-valid
    // tokens for the same contract (if any were issued via re-send)
    // are left as-is — the contract's status now being SIGNED is
    // what actually blocks further action through them, so an
    // orphaned second token isn't a real risk, just inert.
    tokenDoc.consumedAt = signedAt;
    await tokenDoc.save();

    try {
      await this.emailService.sendContractSignedConfirmation({
        to: contract.signerEmail,
        signerName: contract.signerName,
      });
    } catch (err) {
      console.error(
        `Failed to send signed-confirmation email for contract ${contract._id}:`,
        err,
      );
    }

    return contract;
  }

  async decline(
    token: string,
    reason: string | undefined,
  ): Promise<ContractDocument> {
    const contract = await this.getContractByToken(token);
    if (contract.status === ContractStatus.SIGNED) {
      throw new ConflictException('This contract has already been signed.');
    }

    contract.status = ContractStatus.DECLINED;
    contract.declinedAt = new Date();
    contract.declineReason = reason ?? null;
    contract.interactions.push({
      type: InteractionType.DECLINED,
      occurredAt: new Date(),
      actor: 'signer',
      message: reason ?? null,
      tenantUserId: null,
    });
    await contract.save();
    return contract;
  }

  async getHiredCandidatesWithoutContract(
    tenantId: string,
  ): Promise<CandidateDocument[]> {
    const tId = new Types.ObjectId(tenantId);
    const hiredCandidates = await this.candidateModel
      .find({ tenantId: tId, stage: 'hired' })
      .lean();

    const existingContracts = await this.contractModel
      .find({ tenantId: tId, candidateId: { $ne: null } })
      .select('candidateId')
      .lean();
    const candidateIdsWithContracts = new Set(
      existingContracts.map((c) => c.candidateId?.toString()),
    );

    return hiredCandidates.filter(
      (c) => !candidateIdsWithContracts.has(c._id.toString()),
    );
  }

  async countersign(
    tenantId: string,
    contractId: string,
    signedByUserId: string,
    dto: CountersignContractDto,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<ContractDocument> {
    const contract = await this.getById(tenantId, contractId);

    if (contract.requiresSignature === false) {
      throw new BadRequestException(
        'This document is a one-way letter with no recipient signature to countersign — use "Issue Letter" instead.',
      );
    }

    if (contract.status !== ContractStatus.SIGNED) {
      throw new ConflictException(
        contract.status === ContractStatus.COUNTERSIGNED
          ? 'This contract has already been fully executed.'
          : 'The employee/consultant must sign first before you can countersign.',
      );
    }

    const signedAt = new Date();
    contract.tenantSignature = {
      signedAt,
      signerName: dto.signerName,
      signedByUserId: new Types.ObjectId(signedByUserId),
      signatureImageData: dto.signatureImageData ?? null,
      stampImageData: dto.stampImageData ?? null,
      ipAddress,
      userAgent,
    };
    contract.status = ContractStatus.COUNTERSIGNED;
    contract.interactions.push({
      type: InteractionType.COUNTERSIGNED,
      occurredAt: signedAt,
      actor: 'tenant',
      message: null,
      tenantUserId: new Types.ObjectId(signedByUserId),
    });

    await contract.save();
    return contract;
  }

  async issueLetter(
    tenantId: string,
    contractId: string,
    issuedByUserId: string,
    dto: IssueLetterDto,
    ipAddress: string | null,
    userAgent: string | null,
    businessName: string,
  ): Promise<ContractDocument> {
    const contract = await this.getById(tenantId, contractId);

    if (contract.requiresSignature !== false) {
      throw new BadRequestException(
        'This document requires the recipient to sign — use "Send for Signature" instead.',
      );
    }
    if (contract.status !== ContractStatus.DRAFT) {
      throw new ConflictException('This document has already been issued.');
    }

    const signedAt = new Date();
    contract.tenantSignature = {
      signedAt,
      signerName: dto.signerName,
      signedByUserId: new Types.ObjectId(issuedByUserId),
      signatureImageData: dto.signatureImageData ?? null,
      stampImageData: dto.stampImageData ?? null,
      ipAddress,
      userAgent,
    };
    contract.status = ContractStatus.ISSUED;
    contract.interactions.push({
      type: InteractionType.ISSUED,
      occurredAt: signedAt,
      actor: 'tenant',
      message: null,
      tenantUserId: new Types.ObjectId(issuedByUserId),
    });

    const pdfBuffer = await this.pdfService.buildIssuedLetterPdf(
      contract,
      businessName,
    );

    try {
      await this.emailService.sendIssuedDocument(
        {
          to: contract.signerEmail,
          recipientName: contract.signerName,
          documentName: contract.templateName,
        },
        pdfBuffer,
      );
      contract.signedCopySentAt = signedAt;
    } catch (err) {
      console.error(
        `Failed to email issued document for contract ${contractId}:`,
        err,
      );
      throw err; // the tenant needs to know the letter wasn't delivered
    }

    await contract.save();
    return contract;
  }

  async sendSignedCopy(
    tenantId: string,
    contractId: string,
    businessName: string,
  ): Promise<ContractDocument> {
    const contract = await this.getById(tenantId, contractId);

    if (contract.status === ContractStatus.ISSUED) {
      const letterPdf = await this.pdfService.buildIssuedLetterPdf(
        contract,
        businessName,
      );
      try {
        await this.emailService.sendIssuedDocument(
          {
            to: contract.signerEmail,
            recipientName: contract.signerName,
            documentName: contract.templateName,
          },
          letterPdf,
        );
      } catch (err) {
        console.error(
          `Failed to re-send issued document for contract ${contractId}:`,
          err,
        );
        throw err;
      }
      contract.signedCopySentAt = new Date();
      contract.interactions.push({
        type: InteractionType.SIGNED_COPY_SENT,
        occurredAt: contract.signedCopySentAt,
        actor: 'tenant',
        message: null,
        tenantUserId: null,
      });
      await contract.save();
      return contract;
    }

    if (contract.status !== ContractStatus.COUNTERSIGNED) {
      throw new ConflictException(
        'Both parties must sign before the fully-executed copy can be sent.',
      );
    }

    const pdfBuffer = await this.pdfService.buildSignedContractPdf(
      contract,
      businessName,
    );

    try {
      await this.emailService.sendSignedContractCopy(
        {
          to: contract.signerEmail,
          signerName: contract.signerName,
          contractBody: contract.renderedBody,
          signerSignatureName: contract.signature!.signerName,
          signerSignedAt: contract.signature!.signedAt,
          tenantSignatureName: contract.tenantSignature!.signerName,
          tenantSignedAt: contract.tenantSignature!.signedAt,
          tenantSignatureImageData:
            contract.tenantSignature!.signatureImageData,
          tenantStampImageData: contract.tenantSignature!.stampImageData,
        },
        pdfBuffer,
      );
    } catch (err) {
      console.error(
        `Failed to send signed copy for contract ${contractId}:`,
        err,
      );
      throw err;
    }

    contract.signedCopySentAt = new Date();
    contract.interactions.push({
      type: InteractionType.SIGNED_COPY_SENT,
      occurredAt: contract.signedCopySentAt,
      actor: 'tenant',
      message: null,
      tenantUserId: null,
    });
    await contract.save();
    return contract;
  }

  async getSignedContractPdf(
    tenantId: string,
    contractId: string,
    businessName: string,
  ): Promise<Buffer> {
    const contract = await this.getById(tenantId, contractId);

    if (contract.status === ContractStatus.ISSUED) {
      return this.pdfService.buildIssuedLetterPdf(contract, businessName);
    }

    if (contract.status !== ContractStatus.COUNTERSIGNED) {
      throw new ConflictException(
        'Only a fully executed (countersigned) contract can be downloaded as PDF.',
      );
    }

    return this.pdfService.buildSignedContractPdf(contract, businessName);
  }

  private async issueSigningToken(
    contract: ContractDocument,
    expiresInHours: number,
  ): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    await this.tokenModel.create({
      contractId: contract._id,
      token,
      expiresAt,
      issuedToEmail: contract.signerEmail,
    });

    return token;
  }
}
