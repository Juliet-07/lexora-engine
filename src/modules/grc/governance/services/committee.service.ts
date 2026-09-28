import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Committee,
  CommitteeDocument,
  CommitteeMemberRole,
  BoardMember,
  BoardMemberDocument,
} from '../schemas';
import {
  CreateCommitteeDto,
  AddCommitteeMemberDto,
  AddCommitteeTaskDto,
  UpdateTaskStatusDto,
  UpdateCommitteeDetailsDto,
} from '../dtos/index.dto';
import { EmailService } from 'src/common/utils/mailing/email.service';

@Injectable()
export class CommitteeService {
  constructor(
    @InjectModel(Committee.name)
    private readonly committeeModel: Model<CommitteeDocument>,
    // Direct model injection (not BoardMemberService) — mirrors the
    // convention used elsewhere in this codebase (PolicyService →
    // Employee/HrTeam, AuditService → HrTeam/Employee) to avoid a DI
    // cycle: BoardMemberService itself injects the real CommitteeService
    // (to compute a director's own committee memberships), so the
    // reverse direction here has to stop at the model.
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMemberDocument>,
    private readonly emailService: EmailService,
  ) {}

  async create(tenantId: string, dto: CreateCommitteeDto) {
    // Members are always board members now (see addMember), so a
    // committee with no board roster to draw from can't meaningfully
    // exist yet — per the PO's explicit "a committee cannot be
    // created if no board member exists on the tenant's account."
    const boardMemberCount = await this.boardMemberModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
    });
    if (boardMemberCount === 0) {
      throw new BadRequestException(
        'Add at least one board member before creating a committee — committee members are chosen from your board roster.',
      );
    }
    const created = await this.committeeModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      purpose: dto.purpose ?? '',
      members: [],
      tasks: [],
      cadence: dto.cadence ?? 'Quarterly',
      quorum: dto.quorum ?? 'Majority of voting members',
      charter: dto.charter ?? '',
      nextMeeting: dto.nextMeeting ? new Date(dto.nextMeeting) : null,
    });
    return { ...created.toObject(), chair: null };
  }

  async getAll(tenantId: string) {
    const committees = await this.committeeModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ name: 1 })
      .lean();
    // Pre-existing committees created before cadence/quorum/charter/
    // nextMeeting existed on the schema won't have them hydrated by a
    // .lean() read, so backfill the same defaults the schema declares.
    return committees.map((c) => ({
      ...c,
      cadence: c.cadence ?? 'Quarterly',
      quorum: c.quorum ?? 'Majority of voting members',
      charter: c.charter ?? '',
      nextMeeting: c.nextMeeting ?? null,
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
    const boardMember = await this.boardMemberModel.findOne({
      _id: dto.boardMemberId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!boardMember) throw new NotFoundException('Board member not found');
    if (
      committee.members.some(
        (m) => m.boardMemberId?.toString() === dto.boardMemberId,
      )
    ) {
      throw new BadRequestException(
        'This director is already on the committee.',
      );
    }

    const role = dto.role ?? CommitteeMemberRole.MEMBER;

    if (role === CommitteeMemberRole.CHAIR) {
      committee.members.forEach((m) => {
        if (m.role === CommitteeMemberRole.CHAIR) {
          m.role = CommitteeMemberRole.MEMBER;
        }
      });
    }

    committee.members.push({
      boardMemberId: boardMember._id,
      name: boardMember.name,
      email: boardMember.email,
      role,
    } as any);
    committee.markModified('members');
    await committee.save();

    const currentChair = this.deriveChair(committee.members as any);

    // The chair added to their own committee just sees the on-screen
    // confirmation — everyone else gets an email naming the chair.
    if (role === CommitteeMemberRole.CHAIR) {
      this.emailService
        .sendCommitteeChairAssigned({
          to: boardMember.email,
          memberName: boardMember.name,
          committeeName: committee.name,
          businessName,
        })
        .catch(() => {});
    } else {
      this.emailService
        .sendCommitteeMemberAdded({
          to: boardMember.email,
          memberName: boardMember.name,
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

  // Same removal, addressed by board member id rather than array
  // index — used by the board member's own "Committees" page, which
  // has no reason to know a committee's internal member ordering.
  async removeMemberByBoardMember(
    tenantId: string,
    id: string,
    boardMemberId: string,
  ) {
    const committee = await this.getById(tenantId, id);
    const index = committee.members.findIndex(
      (m) => m.boardMemberId?.toString() === boardMemberId,
    );
    if (index === -1) {
      throw new NotFoundException('This director is not on the committee.');
    }
    committee.members.splice(index, 1);
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
    const owner = committee.members.find(
      (m) => m.boardMemberId?.toString() === dto.ownerBoardMemberId,
    );
    if (!owner) {
      throw new BadRequestException(
        'Task owner must be a current committee member.',
      );
    }
    committee.tasks.push({
      title: dto.title,
      owner: owner.name,
      ownerBoardMemberId: owner.boardMemberId,
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
          owner: owner.name,
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

  async updateDetails(
    tenantId: string,
    id: string,
    dto: UpdateCommitteeDetailsDto,
  ) {
    const committee = await this.getById(tenantId, id);
    if (dto.name !== undefined) committee.name = dto.name;
    if (dto.purpose !== undefined) committee.purpose = dto.purpose;
    if (dto.cadence !== undefined) committee.cadence = dto.cadence;
    if (dto.quorum !== undefined) committee.quorum = dto.quorum;
    if (dto.charter !== undefined) committee.charter = dto.charter;
    if (dto.nextMeeting !== undefined) {
      committee.nextMeeting = dto.nextMeeting
        ? new Date(dto.nextMeeting)
        : null;
    }
    await committee.save();
    const chair = this.deriveChair(committee.members as any);
    return { ...committee.toObject(), chair };
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.committeeModel.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Committee not found');
  }

  // ── Board member ⇄ committee — the read side of the link ────────
  // Committee.members is the single source of truth for who's on
  // what; these two just query it from the board-member's point of
  // view, batched so BoardMemberService#getAll doesn't run one query
  // per director.

  async getMembershipsMap(
    tenantId: string,
    boardMemberIds: string[],
  ): Promise<
    Map<string, { committeeId: string; name: string; isChair: boolean }[]>
  > {
    const map = new Map<
      string,
      { committeeId: string; name: string; isChair: boolean }[]
    >();
    if (!boardMemberIds.length) return map;
    const wanted = new Set(boardMemberIds);
    const committees = await this.committeeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        'members.boardMemberId': {
          $in: boardMemberIds.map((id) => new Types.ObjectId(id)),
        },
      })
      .lean();
    for (const c of committees) {
      for (const m of c.members) {
        const key = m.boardMemberId?.toString();
        if (!key || !wanted.has(key)) continue;
        const list = map.get(key) ?? [];
        list.push({
          committeeId: c._id.toString(),
          name: c.name,
          isChair: m.role === CommitteeMemberRole.CHAIR,
        });
        map.set(key, list);
      }
    }
    return map;
  }

  async getMembershipsForBoardMember(tenantId: string, boardMemberId: string) {
    const map = await this.getMembershipsMap(tenantId, [boardMemberId]);
    return map.get(boardMemberId) ?? [];
  }

  // The board portal's own "My Committees" view — everything real
  // about each committee this director belongs to (mandate, cadence,
  // quorum, next meeting, fellow members' count, chair, and the
  // committee's own tasks), per the PO's "receive everything
  // pertaining to that committee... on their board portal."
  async getForBoardMemberPortal(tenantId: string, boardMemberId: string) {
    const committees = await this.committeeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        'members.boardMemberId': new Types.ObjectId(boardMemberId),
      })
      .sort({ name: 1 })
      .lean();
    return committees.map((c) => {
      const mine = c.members.find(
        (m) => m.boardMemberId?.toString() === boardMemberId,
      );
      return {
        _id: c._id,
        name: c.name,
        purpose: c.purpose,
        cadence: c.cadence ?? 'Quarterly',
        quorum: c.quorum ?? 'Majority of voting members',
        charter: c.charter ?? '',
        nextMeeting: c.nextMeeting ?? null,
        chair: this.deriveChair(c.members),
        membersCount: c.members.length,
        myRole: mine?.role ?? CommitteeMemberRole.MEMBER,
        tasks: c.tasks ?? [],
      };
    });
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
