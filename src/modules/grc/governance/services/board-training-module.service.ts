import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BoardTrainingModule, BoardTrainingModuleDocument } from '../schemas';
import {
  CreateBoardTrainingModuleDto,
  UpdateBoardTrainingModuleDto,
} from '../dtos/board-training-module.dto';

// Tenant-managed catalog behind board onboarding's Step 4 (mandatory
// training) — see the comment on the schema for why this replaced the
// old fixed 3-module list. Deliberately no "delete blocked while in
// use" guard like AuditFolder/BoardDocumentFolder have: a director's
// own completedModuleIds is a plain snapshot of ids they completed,
// so removing a module later doesn't retroactively invalidate
// anything they already finished — it just stops being required for
// directors still mid-onboarding.
@Injectable()
export class BoardTrainingModuleService {
  constructor(
    @InjectModel(BoardTrainingModule.name)
    private readonly model: Model<BoardTrainingModuleDocument>,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ order: 1, createdAt: 1 })
      .lean();
  }

  async create(
    tenantId: string,
    dto: CreateBoardTrainingModuleDto,
    file?: Express.Multer.File,
  ) {
    return this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      description: dto.description ?? '',
      order: dto.order ?? 0,
      resourceUrl: file
        ? `/uploads/grc/training-modules/${file.filename}`
        : null,
      resourceMimeType: file ? file.mimetype : null,
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateBoardTrainingModuleDto,
    file?: Express.Multer.File,
  ) {
    const module_ = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!module_) throw new NotFoundException('Training module not found');
    if (dto.title !== undefined) module_.title = dto.title;
    if (dto.description !== undefined) module_.description = dto.description;
    if (dto.order !== undefined) module_.order = dto.order;
    if (file) {
      module_.resourceUrl = `/uploads/grc/training-modules/${file.filename}`;
      module_.resourceMimeType = file.mimetype;
    }
    await module_.save();
    return module_;
  }

  async remove(tenantId: string, id: string) {
    const res = await this.model.deleteOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!res.deletedCount)
      throw new NotFoundException('Training module not found');
    return { success: true };
  }
}
