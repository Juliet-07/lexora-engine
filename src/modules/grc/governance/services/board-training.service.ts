import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BoardOnboardingTrainingModule,
  BoardOnboardingTrainingModuleDocument,
  BoardTraining,
  BoardTrainingDocument,
  TrainingCompletionMethod,
} from '../schemas';
import {
  CreateBoardOnboardingTrainingModuleDto,
  UpdateBoardOnboardingTrainingModuleDto,
  CreateBoardTrainingDto,
  UpdateBoardTrainingDto,
} from '../dtos/board-training.dto';

// Tenant-managed catalog behind board onboarding's Step 4 (mandatory
// training) — see the comment on the schema for why this replaced the
// old fixed 3-module list. Deliberately no "delete blocked while in
// use" guard like AuditFolder/BoardDocumentFolder have: a director's
// own completedModuleIds is a plain snapshot of ids they completed,
// so removing a module later doesn't retroactively invalidate
// anything they already finished — it just stops being required for
// directors still mid-onboarding.
@Injectable()
export class BoardOnboardingTrainingModuleService {
  constructor(
    @InjectModel(BoardOnboardingTrainingModule.name)
    private readonly model: Model<BoardOnboardingTrainingModuleDocument>,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ order: 1, createdAt: 1 })
      .lean();
  }

  async create(
    tenantId: string,
    dto: CreateBoardOnboardingTrainingModuleDto,
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
    dto: UpdateBoardOnboardingTrainingModuleDto,
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

// General, ongoing board training — see the schema comment for why
// this is a separate catalog from BoardTrainingModule (onboarding
// Step 4 only). Tenant creates/assigns trainings (optionally with a
// resource file); a director completes them from their portal, either
// by reviewing the attached material or, when none was provided, by
// uploading their own proof of completion.
@Injectable()
export class BoardTrainingService {
  constructor(
    @InjectModel(BoardTraining.name)
    private readonly model: Model<BoardTrainingDocument>,
  ) {}

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string) {
    const training = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!training) throw new NotFoundException('Training not found');
    return training;
  }

  async create(
    tenantId: string,
    dto: CreateBoardTrainingDto,
    file?: Express.Multer.File,
  ) {
    return this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      description: dto.description ?? '',
      category: dto.category,
      provider: dto.provider ?? '',
      format: dto.format,
      cpdHours: dto.cpdHours ?? 0,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      mandatory: dto.mandatory ?? true,
      assignedTo: (dto.assignedTo ?? []).map((id) => new Types.ObjectId(id)),
      resourceUrl: file
        ? `/uploads/grc/trainings/material/${file.filename}`
        : null,
      resourceMimeType: file ? file.mimetype : null,
      resourceName: file ? file.originalname : null,
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateBoardTrainingDto,
    file?: Express.Multer.File,
  ) {
    const training = await this.getById(tenantId, id);
    if (dto.title !== undefined) training.title = dto.title;
    if (dto.description !== undefined) training.description = dto.description;
    if (dto.category !== undefined) training.category = dto.category;
    if (dto.provider !== undefined) training.provider = dto.provider;
    if (dto.format !== undefined) training.format = dto.format;
    if (dto.cpdHours !== undefined) training.cpdHours = dto.cpdHours;
    if (dto.dueDate !== undefined)
      training.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.mandatory !== undefined) training.mandatory = dto.mandatory;
    if (dto.assignedTo !== undefined)
      training.assignedTo = dto.assignedTo.map(
        (id) => new Types.ObjectId(id),
      ) as any;
    if (file) {
      training.resourceUrl = `/uploads/grc/trainings/material/${file.filename}`;
      training.resourceMimeType = file.mimetype;
      training.resourceName = file.originalname;
    }
    await training.save();
    return training;
  }

  async remove(tenantId: string, id: string) {
    const res = await this.model.deleteOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('Training not found');
    return { success: true };
  }

  // ── Board portal, self-service ──────────────────────────────────

  async getForBoardMemberPortal(tenantId: string, boardMemberId: string) {
    const trainings = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();
    const mine = trainings.filter(
      (t: any) =>
        (t.assignedTo ?? []).length === 0 ||
        (t.assignedTo ?? []).some((id: any) => id.toString() === boardMemberId),
    );
    return mine.map((t: any) => ({
      ...t,
      myCompletion:
        (t.completions ?? []).find(
          (c: any) => c.boardMemberId?.toString() === boardMemberId,
        ) ?? null,
    }));
  }

  async completeByBoardMember(
    tenantId: string,
    id: string,
    boardMemberId: string,
    name: string,
    email: string,
    file?: Express.Multer.File,
  ) {
    const training = await this.getById(tenantId, id);
    const isAssigned =
      training.assignedTo.length === 0 ||
      training.assignedTo.some((bm) => bm.toString() === boardMemberId);
    if (!isAssigned) {
      throw new BadRequestException('This training is not assigned to you.');
    }

    const hasMaterial = !!training.resourceUrl;
    if (!hasMaterial && !file) {
      throw new BadRequestException(
        'No training material was provided — upload a certificate or other proof of completion.',
      );
    }

    const entry = {
      boardMemberId: new Types.ObjectId(boardMemberId),
      name,
      email: email.toLowerCase(),
      completedAt: new Date(),
      method: file
        ? TrainingCompletionMethod.PROOF
        : TrainingCompletionMethod.MATERIAL,
      proofFileUrl: file
        ? `/uploads/grc/trainings/proof/${file.filename}`
        : null,
      proofMimeType: file ? file.mimetype : null,
      proofName: file ? file.originalname : null,
    };

    const existingIdx = training.completions.findIndex(
      (c) => c.boardMemberId?.toString() === boardMemberId,
    );
    if (existingIdx >= 0) training.completions[existingIdx] = entry as any;
    else training.completions.push(entry as any);
    training.markModified('completions');
    await training.save();
    return training;
  }
}
