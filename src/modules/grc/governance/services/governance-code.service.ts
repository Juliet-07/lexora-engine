import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  GovernanceCode,
  GovernanceCodeDocument,
  GovernanceCodeStatus,
} from '../schemas';
import { CreateGovernanceCodeDto, UpdateCodeBodyDto } from '../dtos/index.dto';

@Injectable()
export class GovernanceCodeService {
  constructor(
    @InjectModel(GovernanceCode.name)
    private readonly codeModel: Model<GovernanceCodeDocument>,
  ) {}

  async create(tenantId: string, dto: CreateGovernanceCodeDto) {
    return this.codeModel.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      category: dto.category,
      body: dto.body ?? '',
      documents: [],
      version: 1,
      status: GovernanceCodeStatus.DRAFT,
    });
  }

  async getAll(tenantId: string) {
    return this.codeModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ updatedAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string): Promise<GovernanceCodeDocument> {
    const code = await this.codeModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!code) throw new NotFoundException('Governance code not found');
    return code;
  }

  async updateBody(tenantId: string, id: string, dto: UpdateCodeBodyDto) {
    const code = await this.getById(tenantId, id);
    code.body = dto.body;
    await code.save();
    return code;
  }

  async addDocument(tenantId: string, id: string, file: Express.Multer.File) {
    const code = await this.getById(tenantId, id);
    code.documents.push({
      name: file.originalname,
      fileUrl: `/uploads/grc/governance-codes/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    } as any);
    code.markModified('documents');
    await code.save();
    return code;
  }

  async removeDocument(tenantId: string, id: string, index: number) {
    const code = await this.getById(tenantId, id);
    code.documents.splice(index, 1);
    code.markModified('documents');
    await code.save();
    return code;
  }

  async publish(tenantId: string, id: string) {
    const code = await this.getById(tenantId, id);
    if (code.status !== GovernanceCodeStatus.DRAFT) {
      throw new BadRequestException('Only a draft can be published.');
    }
    code.status = GovernanceCodeStatus.PUBLISHED;
    await code.save();
    return code;
  }

  // Matches the actual UI exactly — bumps version and reopens the
  // SAME record for editing. No version chain, no new document.
  async startNewVersion(tenantId: string, id: string) {
    const code = await this.getById(tenantId, id);
    if (code.status !== GovernanceCodeStatus.PUBLISHED) {
      throw new BadRequestException(
        'Start a new version only from a published code.',
      );
    }
    code.status = GovernanceCodeStatus.DRAFT;
    code.version += 1;
    await code.save();
    return code;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.codeModel.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Governance code not found');
  }
}
