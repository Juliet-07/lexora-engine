import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import {
  Fund,
  FundDocument,
  CapitalCommitment,
  CapitalCommitmentDocument,
  CapitalCall,
  CapitalCallDocument,
  Distribution,
  DistributionDocument,
  SideLetter,
  SideLetterDocument,
  FundVaultDocument,
  FundVaultDocumentDocument,
  FundDocumentStatus,
  FundDocumentConfidentiality,
} from '../schemas';
import {
  DraftFundDocumentDto,
  UpdateFundDocumentDto,
  UploadFundDocumentDto,
} from '../dtos';
import {
  BUILT_IN_FUND_TEMPLATES,
  FUND_DOCUMENT_GROUPS,
  groupForCategory,
} from '../fund-document-templates';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  PlatformContractTemplate,
  PlatformContractTemplateDocument,
  PlatformTemplateStatus,
} from 'src/modules/super_admin/schemas/contract-template.schema';
import { renderTemplateDocument } from 'src/common/utils/contract-structure.util';
import { getMergeFieldRegistry } from 'src/common/utils/contract-merge-registry';
import { FUND_DOC_AREA } from 'src/common/utils/contract-merge-fund-fields';
import {
  buildCommonMergeFields,
  loadTenantCompany,
  overlayNonEmpty,
} from 'src/common/utils/contract-common-fields';
import { buildTextDocumentPdf } from 'src/common/utils/pdf/fund-pdf.util';
import { lookupTenantCompanyName } from 'src/common/utils/pdf/report-builder.util';

const money = (n: number, cur: string) =>
  `${cur} ${(n ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const iso = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;');

export interface UploadedFundFile {
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
  filename: string;
}

export const fileRecord = (
  f: UploadedFundFile,
  folder: string,
  tenantId: string,
) => ({
  name: f.originalname,
  mimeType: f.mimetype,
  size: f.size,
  path: f.path,
  url: `${process.env.APP_URL}/uploads/${folder}/${tenantId}/${f.filename}`,
});

@Injectable()
export class FundDocumentService {
  constructor(
    @InjectModel(FundVaultDocument.name)
    private readonly docModel: Model<FundVaultDocumentDocument>,
    @InjectModel(Fund.name) private readonly fundModel: Model<FundDocument>,
    @InjectModel(CapitalCommitment.name)
    private readonly commitmentModel: Model<CapitalCommitmentDocument>,
    @InjectModel(CapitalCall.name)
    private readonly callModel: Model<CapitalCallDocument>,
    @InjectModel(Distribution.name)
    private readonly distributionModel: Model<DistributionDocument>,
    @InjectModel(SideLetter.name)
    private readonly sideLetterModel: Model<SideLetterDocument>,
    @InjectModel(PlatformContractTemplate.name)
    private readonly templateModel: Model<PlatformContractTemplateDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  private async fund(tenantId: string, fundId: string) {
    const f = await this.fundModel
      .findOne({
        _id: new Types.ObjectId(fundId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .lean();
    if (!f) throw new NotFoundException('Fund not found');
    return f;
  }

  /** Categories, the template library and the merge fields, for the dialogs. */
  async meta(tenantId: string) {
    const platform = await this.templateModel
      .find({
        moduleKey: 'finance',
        areaKey: FUND_DOC_AREA,
        status: PlatformTemplateStatus.PUBLISHED,
        sourceType: 'authored',
      })
      .select('title description category')
      .sort({ title: 1 })
      .lean();
    return {
      groups: FUND_DOCUMENT_GROUPS,
      statuses: Object.values(FundDocumentStatus),
      confidentiality: Object.values(FundDocumentConfidentiality),
      templates: [
        ...BUILT_IN_FUND_TEMPLATES.map((t) => ({
          key: `builtin:${t.key}`,
          title: t.title,
          description: t.description,
          tag: t.tag,
          category: t.category,
          needs: t.needs,
          source: 'built-in',
        })),
        ...platform.map((t) => ({
          key: String(t._id),
          title: t.title,
          description: t.description || 'Published template',
          tag: t.category,
          category: 'Other',
          needs: 'none',
          source: 'library',
        })),
      ],
      mergeRegistry: getMergeFieldRegistry('finance', FUND_DOC_AREA),
    };
  }

  async list(tenantId: string, fundId: string) {
    await this.fund(tenantId, fundId);
    const docs = await this.docModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
      })
      .select('-content')
      .sort({ docDate: -1, createdAt: -1 })
      .lean();
    const groups = FUND_DOCUMENT_GROUPS.map((g) => ({
      group: g.group,
      documents: docs.filter((d) => d.group === g.group),
    })).filter((g) => g.documents.length);
    return { total: docs.length, groups };
  }

  async getOne(tenantId: string, fundId: string, id: string) {
    const d = await this.docModel
      .findOne({
        _id: id,
        tenantId: new Types.ObjectId(tenantId),
        fundId: new Types.ObjectId(fundId),
      })
      .lean();
    if (!d) throw new NotFoundException('Document not found');
    return d;
  }

  async upload(
    tenantId: string,
    fundId: string,
    dto: UploadFundDocumentDto,
    file: UploadedFundFile | undefined,
    actorName: string,
  ) {
    await this.fund(tenantId, fundId);
    if (!file) throw new BadRequestException('Attach the document file');
    let lpName = '';
    if (dto.commitmentId) {
      const c = await this.commitmentModel
        .findOne({
          _id: dto.commitmentId,
          tenantId: new Types.ObjectId(tenantId),
          fundId: new Types.ObjectId(fundId),
        })
        .lean();
      if (!c) throw new BadRequestException('That LP is not in this fund');
      lpName = c.lpName;
    }
    const created = await this.docModel.create({
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
      category: dto.category,
      group: groupForCategory(dto.category),
      title: dto.title.trim(),
      version: dto.version || 'v1.0',
      docDate: new Date(dto.docDate),
      status: dto.status || FundDocumentStatus.DRAFT,
      confidentiality:
        dto.confidentiality ||
        (dto.commitmentId
          ? FundDocumentConfidentiality.LP_SPECIFIC
          : FundDocumentConfidentiality.FUND_LEVEL),
      commitmentId: dto.commitmentId
        ? new Types.ObjectId(dto.commitmentId)
        : null,
      lpName,
      holdingId: dto.holdingId ? new Types.ObjectId(dto.holdingId) : null,
      authority: dto.authority ?? '',
      filedOn: dto.filedOn ? new Date(dto.filedOn) : null,
      notes: dto.notes ?? '',
      file: fileRecord(file, 'fund-documents', tenantId),
      createdBy: actorName,
    });
    return created.toObject();
  }

  // ── Fields ─────────────────────────────────────────────────

  async buildFields(
    tenantId: string,
    fundId: string,
    ctx: { commitmentId?: string; callId?: string; distributionId?: string },
  ): Promise<Record<string, string>> {
    const tId = new Types.ObjectId(tenantId);
    const fId = new Types.ObjectId(fundId);
    const fund = await this.fund(tenantId, fundId);
    const cur = fund.currency;
    const company = await loadTenantCompany(this.userModel, tenantId);

    const [commitments, calls] = await Promise.all([
      this.commitmentModel.find({ tenantId: tId, fundId: fId }).lean(),
      this.callModel.find({ tenantId: tId, fundId: fId }).lean(),
    ]);
    const lp = ctx.commitmentId
      ? commitments.find((c) => String(c._id) === ctx.commitmentId)
      : undefined;
    if (ctx.commitmentId && !lp)
      throw new BadRequestException('That LP is not in this fund');
    const totalCommitted = commitments.reduce((s, c) => s + c.commitment, 0);

    const f: Record<string, string> = {
      ...buildCommonMergeFields({
        tenant: company,
        title: fund.name,
        partyA: {
          name: (fund as any).gpEntityName || company.name,
          address: company.registeredAddress,
          representative:
            (fund as any).noticeSignatory || company.representative,
          representativeTitle:
            (fund as any).noticeSignatoryTitle || company.representativeTitle,
        },
        partyB: lp
          ? { name: lp.lpName, email: (lp as any).lpEmail }
          : undefined,
      }),
      fundName: fund.name,
      fundCurrency: cur,
      gpEntityName: (fund as any).gpEntityName || company.name,
      lpaDate: iso((fund as any).lpaDate),
      fundTermYears: String((fund as any).termYears ?? ''),
      fundFirstCloseDate: iso((fund as any).firstCloseDate),
      fundFinalCloseDate: iso((fund as any).finalCloseDeadline),
      callLpaClause: (fund as any).lpaCallClause || '',
      callDefaultInterestClause: (fund as any).lpaDefaultInterestClause || '',
      callDefaultClause: (fund as any).lpaDefaultClause || '',
      wireBeneficiary: (fund as any).wireBeneficiary || fund.name,
      wireBankName: (fund as any).wireBankName || '',
      wireAccountNumber: (fund as any).wireAccountNumber || '',
      wireSwift: (fund as any).wireSwift || '',
      noticeSignatory: (fund as any).noticeSignatory || '',
      noticeSignatoryTitle: (fund as any).noticeSignatoryTitle || '',
    };

    if (lp) {
      const called = calls
        .filter((c) => (c as any).status !== 'Draft')
        .reduce((s, c) => {
          const a: any = (c.allocations as any[]).find(
            (x) => String(x.commitmentId) === String(lp._id),
          );
          return s + (a?.amount ?? 0);
        }, 0);
      Object.assign(f, {
        lpName: lp.lpName,
        lpEmail: (lp as any).lpEmail ?? '',
        lpType: lp.type,
        lpCommitment: money(lp.commitment, cur),
        lpCalledToDate: money(called, cur),
        lpUncalled: money(lp.commitment - called, cur),
        lpClose: `${lp.closeLabel} close`,
        lpSharePct: totalCommitted
          ? `${((lp.commitment / totalCommitted) * 100).toFixed(2)}%`
          : '',
      });
      const sl = await this.sideLetterModel
        .findOne({ tenantId: tId, fundId: fId, commitmentId: lp._id })
        .sort({ createdAt: -1 })
        .lean();
      if (sl) {
        f.sideLetterReference = sl.ref;
        f.sideLetterEffectiveDate = iso(sl.effectiveDate);
        f.sideLetterProvisions = `<ol>${sl.provisions
          .map(
            (p: any) =>
              `<li><strong>${esc(p.type)}</strong> — ${esc(p.term)}${
                p.lpaDefault ? ` (LPA: ${esc(p.lpaDefault)})` : ''
              }${p.mfn === 'Triggered' ? ' — MFN applies' : ''}</li>`,
          )
          .join('')}</ol>`;
      }
    }

    if (ctx.callId) {
      const call = calls.find((c) => String(c._id) === ctx.callId);
      if (!call)
        throw new BadRequestException('That capital call is not in this fund');
      const a: any = lp
        ? (call.allocations as any[]).find(
            (x) => String(x.commitmentId) === String(lp._id),
          )
        : undefined;
      Object.assign(f, {
        callReference: call.ref,
        callPurpose: call.purpose,
        callTotalAmount: money(call.totalAmount, cur),
        callLpAmount: a ? money(a.amount, cur) : '',
        callNoticeDate: iso((call as any).noticeDate || call.issuedOn),
        callDueDate: iso(call.dueOn),
      });
    }

    if (ctx.distributionId) {
      const d = await this.distributionModel
        .findOne({ _id: ctx.distributionId, tenantId: tId, fundId: fId })
        .lean();
      if (!d)
        throw new BadRequestException('That distribution is not in this fund');
      const a: any = lp
        ? (d.allocations as any[]).find(
            (x) => String(x.commitmentId) === String(lp._id),
          )
        : undefined;
      Object.assign(f, {
        distributionReference: d.ref,
        distributionDate: iso(d.date),
        distributionTotal: money(d.totalAmount, cur),
        distributionLpAmount: a ? money(a.amount, cur) : '',
      });
    }
    return overlayNonEmpty(f);
  }

  // ── Drafting ───────────────────────────────────────────────

  async draft(
    tenantId: string,
    fundId: string,
    dto: DraftFundDocumentDto,
    actorName: string,
  ) {
    const fund = await this.fund(tenantId, fundId);
    let template: {
      content?: string;
      coverPage?: string;
      tocEnabled?: boolean;
      tocTitle?: string;
    } = {
      content: dto.initialContent
        ? `<p>${esc(dto.initialContent)}</p>`
        : '<p></p>',
    };
    let templateName = 'Blank document';
    let category = dto.category || 'Other';

    if (dto.templateKey) {
      if (dto.templateKey.startsWith('builtin:')) {
        const t = BUILT_IN_FUND_TEMPLATES.find(
          (x) => `builtin:${x.key}` === dto.templateKey,
        );
        if (!t) throw new NotFoundException('Template not found');
        if (t.needs === 'lp' && !dto.commitmentId)
          throw new BadRequestException(`Choose the LP this ${t.title} is for`);
        if (t.needs === 'call' && !dto.callId)
          throw new BadRequestException(
            `Choose the capital call this ${t.title} is for`,
          );
        if (t.needs === 'call' && !dto.commitmentId)
          throw new BadRequestException(`Choose the LP this ${t.title} is for`);
        if (
          t.needs === 'distribution' &&
          (!dto.distributionId || !dto.commitmentId)
        )
          throw new BadRequestException(
            `Choose the distribution and the LP this ${t.title} is for`,
          );
        template = { content: t.content };
        templateName = t.title;
        category = dto.category || t.category;
      } else {
        const t = Types.ObjectId.isValid(dto.templateKey)
          ? await this.templateModel.findById(dto.templateKey).lean()
          : null;
        if (
          !t ||
          t.status !== PlatformTemplateStatus.PUBLISHED ||
          t.moduleKey !== 'finance' ||
          t.areaKey !== FUND_DOC_AREA
        )
          throw new NotFoundException('Template not found');
        template = t;
        templateName = t.title;
      }
    }

    const fields = await this.buildFields(tenantId, fundId, dto);
    // Fields the data can't supply stay as {{token}} in the text, so the
    // person can see — and fill in — what is missing.
    const html = renderTemplateDocument(template, fields, 'marked');
    const created = await this.docModel.create({
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
      category,
      group: groupForCategory(category),
      title: dto.title.trim(),
      version: 'Draft 1',
      docDate: new Date(),
      status: FundDocumentStatus.DRAFT,
      confidentiality: dto.commitmentId
        ? FundDocumentConfidentiality.LP_SPECIFIC
        : FundDocumentConfidentiality.FUND_LEVEL,
      commitmentId: dto.commitmentId
        ? new Types.ObjectId(dto.commitmentId)
        : null,
      lpName: fields.lpName ?? '',
      callId: dto.callId ? new Types.ObjectId(dto.callId) : null,
      distributionId: dto.distributionId
        ? new Types.ObjectId(dto.distributionId)
        : null,
      content: html,
      templateKey: dto.templateKey ?? '',
      templateName,
      mergeValues: fields,
      createdBy: actorName,
    });
    void fund;
    return created.toObject();
  }

  async update(
    tenantId: string,
    fundId: string,
    id: string,
    dto: UpdateFundDocumentDto & { mergeValues?: Record<string, string> },
  ) {
    const d = await this.docModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
    });
    if (!d) throw new NotFoundException('Document not found');
    if (
      d.status === FundDocumentStatus.EXECUTED &&
      (dto.content !== undefined || dto.title !== undefined)
    )
      throw new BadRequestException(
        'An executed document can no longer be edited — upload an amendment instead',
      );
    if (dto.title !== undefined) d.title = dto.title.trim();
    if (dto.category !== undefined) {
      d.category = dto.category;
      d.group = groupForCategory(dto.category);
    }
    if (dto.version !== undefined) d.version = dto.version;
    if (dto.status !== undefined) d.status = dto.status as FundDocumentStatus;
    if (dto.confidentiality !== undefined)
      d.confidentiality = dto.confidentiality as FundDocumentConfidentiality;
    if (dto.notes !== undefined) d.notes = dto.notes;
    if (dto.content !== undefined) d.content = dto.content;
    if (dto.docDate !== undefined) d.docDate = new Date(dto.docDate);
    if (dto.mergeValues) {
      d.mergeValues = dto.mergeValues;
      d.markModified('mergeValues');
    }
    await d.save();
    const { content, ...rest } = d.toObject();
    void content;
    return rest;
  }

  async remove(tenantId: string, fundId: string, id: string) {
    const d = await this.docModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
      fundId: new Types.ObjectId(fundId),
    });
    if (!d) throw new NotFoundException('Document not found');
    if (
      d.status !== FundDocumentStatus.DRAFT &&
      d.status !== FundDocumentStatus.ARCHIVED
    )
      throw new BadRequestException(
        'Only a draft or archived document can be deleted — archive it instead',
      );
    if (d.file?.path && existsSync(d.file.path)) {
      try {
        unlinkSync(d.file.path);
      } catch {
        /* the record goes regardless */
      }
    }
    await d.deleteOne();
    return { deleted: true };
  }

  /** The document as a file: the upload as-is, or a drafted one as PDF. */
  async download(
    tenantId: string,
    fundId: string,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const d = await this.getOne(tenantId, fundId, id);
    if (d.file?.path) {
      if (!existsSync(d.file.path))
        throw new NotFoundException('The file is no longer on the server');
      return {
        buffer: readFileSync(d.file.path),
        filename: d.file.name,
        mimeType: d.file.mimeType,
      };
    }
    const fund = await this.fund(tenantId, fundId);
    const buffer = await buildTextDocumentPdf({
      companyName:
        (fund as any).gpEntityName ||
        (await lookupTenantCompanyName(this.userModel, tenantId)),
      title: d.title,
      subtitle: `${fund.name} · ${d.version} · ${d.status}`,
      html: d.content,
    });
    return {
      buffer,
      filename: `${d.title.replace(/[^\w.-]+/g, '-')}.pdf`,
      mimeType: 'application/pdf',
    };
  }
}
