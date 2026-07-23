import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BoardMember, BoardMemberDocument } from '../schemas';
import {
  CreateBoardMemberDto,
  UpdateBoardMemberDto,
  RecordConflictDto,
  LogTrainingDto,
  AddSkillDto,
} from '../dtos/index.dto';
import { EmailService } from 'src/common/utils/mailing/email.service';

@Injectable()
export class BoardMemberService {
  constructor(
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMemberDocument>,
    private readonly emailService: EmailService,
  ) {}

  async create(
    tenantId: string,
    dto: CreateBoardMemberDto,
    businessName: string,
  ) {
    const member = await this.boardMemberModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      role: dto.role,
      email: dto.email.toLowerCase(),
      appointedAt: new Date(dto.appointedAt),
      termEnds: new Date(dto.termEnds),
      bio: dto.bio ?? '',
      conflicts: [],
      training: [],
      isActive: true,
    });

    this.emailService
      .sendBoardMemberAppointed({
        to: member.email,
        memberName: member.name,
        role: member.role,
        businessName,
        appointedAt: member.appointedAt,
        termEnds: member.termEnds,
      })
      .catch(() => {});

    return member;
  }

  async getAll(tenantId: string) {
    return this.boardMemberModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ appointedAt: -1 })
      .populate('successorId', 'name role')
      .lean();
  }

  async getById(tenantId: string, id: string): Promise<BoardMemberDocument> {
    const member = await this.boardMemberModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!member) throw new NotFoundException('Board member not found');
    return member;
  }

  async setSuccessor(tenantId: string, id: string, successorId: string | null) {
    const member = await this.getById(tenantId, id);

    if (successorId) {
      if (successorId === id) {
        throw new BadRequestException(
          'A board member cannot be their own successor.',
        );
      }
      const exists = await this.boardMemberModel.exists({
        _id: successorId,
        tenantId: new Types.ObjectId(tenantId),
      });
      if (!exists) {
        throw new NotFoundException(
          'Selected successor is not a valid board member.',
        );
      }
      member.successorId = new Types.ObjectId(successorId);
    } else {
      member.successorId = null;
    }

    await member.save();
    return member;
  }

  // The one place other GRC features (Meetings, once built) resolve
  // "who is the current board chair" — a query, not a stored pointer,
  // so there's a single source of truth as directors change over time.
  async getCurrentChair(tenantId: string): Promise<BoardMemberDocument | null> {
    return this.boardMemberModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      role: 'Chair',
      isActive: true,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateBoardMemberDto) {
    const member = await this.getById(tenantId, id);
    if (dto.name !== undefined) member.name = dto.name;
    if (dto.role !== undefined) member.role = dto.role;
    if (dto.email !== undefined) member.email = dto.email.toLowerCase();
    if (dto.termEnds !== undefined) member.termEnds = new Date(dto.termEnds);
    if (dto.bio !== undefined) member.bio = dto.bio;
    if (dto.isActive !== undefined) member.isActive = dto.isActive;
    await member.save();
    return member;
  }

  async recordConflict(tenantId: string, id: string, dto: RecordConflictDto) {
    const member = await this.getById(tenantId, id);
    member.conflicts.push({ note: dto.note, disclosedAt: new Date() } as any);
    member.markModified('conflicts');
    await member.save();
    return member;
  }

  async logTraining(tenantId: string, id: string, dto: LogTrainingDto) {
    const member = await this.getById(tenantId, id);
    member.training.push({
      title: dto.title,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : new Date(),
    } as any);
    member.markModified('training');
    await member.save();
    return member;
  }

  async addSkill(tenantId: string, id: string, dto: AddSkillDto) {
    const member = await this.getById(tenantId, id);
    member.skills.push({
      name: dto.name,
      category: dto.category,
      level: dto.level,
      yearsExperience: dto.yearsExperience ?? 0,
      qualified: dto.qualified ?? true,
      notes: dto.notes ?? '',
    } as any);
    member.markModified('skills');
    await member.save();
    return member;
  }

  async removeSkill(tenantId: string, id: string, index: number) {
    const member = await this.getById(tenantId, id);
    member.skills.splice(index, 1);
    member.markModified('skills');
    await member.save();
    return member;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.boardMemberModel.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Board member not found');
  }
}
