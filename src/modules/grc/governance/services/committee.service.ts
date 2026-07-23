import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Committee, CommitteeDocument, CommitteeMemberRole } from '../schemas';
import {
  CreateCommitteeDto,
  AddCommitteeMemberDto,
  AddCommitteeTaskDto,
  UpdateTaskStatusDto,
} from '../dtos/index.dto';
import { EmailService } from 'src/common/utils/mailing/email.service';

@Injectable()
export class CommitteeService {
  constructor(
    @InjectModel(Committee.name)
    private readonly committeeModel: Model<CommitteeDocument>,
    private readonly emailService: EmailService,
  ) {}

  async create(tenantId: string, dto: CreateCommitteeDto) {
    const created = await this.committeeModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      purpose: dto.purpose ?? '',
      members: [],
      tasks: [],
    });
    return { ...created.toObject(), chair: null };
  }

  async getAll(tenantId: string) {
    const committees = await this.committeeModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ name: 1 })
      .lean();
    return committees.map((c) => ({
      ...c,
      chair: this.deriveChair(c.members),
    }));
  }

  async getById(tenantId: string, id: string): Promise<CommitteeDocument> {
    const committee = await this.committeeModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!committee) throw new NotFoundException('Committee not found');
    return committee;
  }

  async addMember(
    tenantId: string,
    id: string,
    dto: AddCommitteeMemberDto,
    businessName: string,
  ) {
    const committee = await this.getById(tenantId, id);
    const role = dto.role ?? CommitteeMemberRole.MEMBER;

    if (role === CommitteeMemberRole.CHAIR) {
      committee.members.forEach((m) => {
        if (m.role === CommitteeMemberRole.CHAIR) {
          m.role = CommitteeMemberRole.MEMBER;
        }
      });
    }

    committee.members.push({ name: dto.name, email: dto.email, role } as any);
    committee.markModified('members');
    await committee.save();

    const currentChair = this.deriveChair(committee.members as any);

    // The chair added to their own committee just sees the on-screen
    // confirmation — everyone else gets an email naming the chair.
    if (role === CommitteeMemberRole.CHAIR) {
      this.emailService
        .sendCommitteeChairAssigned({
          to: dto.email,
          memberName: dto.name,
          committeeName: committee.name,
          businessName,
        })
        .catch(() => {});
    } else {
      this.emailService
        .sendCommitteeMemberAdded({
          to: dto.email,
          memberName: dto.name,
          committeeName: committee.name,
          chairName: currentChair,
          businessName,
        })
        .catch(() => {});
    }

    return { ...committee.toObject(), chair: currentChair };
  }

  async removeMember(tenantId: string, id: string, memberIndex: number) {
    const committee = await this.getById(tenantId, id);
    committee.members.splice(memberIndex, 1);
    committee.markModified('members');
    await committee.save();
    return committee;
  }

  async addTask(
    tenantId: string,
    id: string,
    dto: AddCommitteeTaskDto,
    businessName: string,
  ) {
    const committee = await this.getById(tenantId, id);
    committee.tasks.push({
      title: dto.title,
      owner: dto.owner,
      dueDate: new Date(dto.dueDate),
    } as any);
    committee.markModified('tasks');
    await committee.save();

    // All current committee members notified of the new task.
    const recipients = committee.members.map((m) => m.email);
    if (recipients.length > 0) {
      await this.emailService
        .sendCommitteeTaskAdded({
          to: recipients,
          committeeName: committee.name,
          taskTitle: dto.title,
          owner: dto.owner,
          dueDate: new Date(dto.dueDate),
          businessName,
        })
        .catch(() => {});
    }

    return committee;
  }

  async updateTaskStatus(
    tenantId: string,
    id: string,
    taskIndex: number,
    dto: UpdateTaskStatusDto,
  ) {
    const committee = await this.getById(tenantId, id);
    if (!committee.tasks[taskIndex]) {
      throw new NotFoundException('Task not found');
    }
    committee.tasks[taskIndex].status = dto.status;
    committee.markModified('tasks');
    await committee.save();
    return committee;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.committeeModel.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Committee not found');
  }

  // PRIVATE HELPERS
  private deriveChair(
    members: { name: string; role: CommitteeMemberRole }[],
  ): string | null {
    return (
      members.find((m) => m.role === CommitteeMemberRole.CHAIR)?.name ?? null
    );
  }
}
