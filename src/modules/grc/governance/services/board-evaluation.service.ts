import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BoardEvaluationCycle,
  BoardEvaluationCycleDocument,
  BoardEvaluationCycleStatus,
  BoardEvaluationSubmission,
  BoardEvaluationSubmissionDocument,
  BoardEvaluationType,
  BoardMember,
  BoardMemberDocument,
  BoardMemberLifecycleStatus,
} from '../schemas';
import {
  CreateEvaluationCycleDto,
  SubmitEvaluationDto,
} from '../dtos/index.dto';
import { BoardMemberService } from './board-member.service';
import { CommitteeService } from './committee.service';

// Board Evaluations — genuinely new, full-stack (PO, Oct 2026):
// "Make board evaluations functional. Peer review means the board
// member is able to evaluate the peer according to each board member
// so that should be factored in. Same thing as when doing committee
// eval. When the board member is a chair, the tab for chair
// evaluation should be hidden. The chair can only do self assessment,
// peer review and committee eval."
//
// One BoardEvaluationCycle per evaluation round (title + due date),
// launched by the tenant; one BoardEvaluationSubmission per
// (cycle, reviewer, type, target) — upserted so a director can revise
// their own answers until the cycle closes. Self is one submission;
// Peer and Committee are one submission *per target* (every other
// active director / every committee the reviewer sits on) — never one
// flat form, per the PO's explicit "according to each board member"
// and "same thing... committee eval." Chair is one submission per
// reviewer about the single current Board Chair, and is never offered
// to the Chair themself (see getMyContext below).
@Injectable()
export class BoardEvaluationService {
  constructor(
    @InjectModel(BoardEvaluationCycle.name)
    private readonly cycleModel: Model<BoardEvaluationCycleDocument>,
    @InjectModel(BoardEvaluationSubmission.name)
    private readonly submissionModel: Model<BoardEvaluationSubmissionDocument>,
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMemberDocument>,
    private readonly boardMemberService: BoardMemberService,
    private readonly committeeService: CommitteeService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // TENANT SIDE — launching a cycle and viewing results. The PO's
  // wording is entirely board-portal-facing, but there has to be a
  // minimal way for the tenant to start a round and see how it went.
  // ═══════════════════════════════════════════════════════════

  async createCycle(tenantId: string, dto: CreateEvaluationCycleDto) {
    const existingOpen = await this.cycleModel.exists({
      tenantId: new Types.ObjectId(tenantId),
      status: BoardEvaluationCycleStatus.OPEN,
    });
    if (existingOpen) {
      throw new BadRequestException(
        'An evaluation cycle is already open. Close it before starting a new one.',
      );
    }
    return this.cycleModel.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      dueDate: new Date(dto.dueDate),
      status: BoardEvaluationCycleStatus.OPEN,
    });
  }

  async listCycles(tenantId: string) {
    return this.cycleModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  private async getCycleOrThrow(tenantId: string, cycleId: string) {
    const cycle = await this.cycleModel.findOne({
      _id: cycleId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!cycle) throw new NotFoundException('Evaluation cycle not found');
    return cycle;
  }

  async closeCycle(tenantId: string, cycleId: string) {
    const cycle = await this.getCycleOrThrow(tenantId, cycleId);
    cycle.status = BoardEvaluationCycleStatus.CLOSED;
    cycle.closedAt = new Date();
    await cycle.save();
    return cycle;
  }

  // Per-director completion (expected vs submitted, by type) plus the
  // overall average score — the tenant's view of how the round went.
  async getCycleResults(tenantId: string, cycleId: string) {
    const cycle = await this.getCycleOrThrow(tenantId, cycleId);
    const members = await this.boardMemberModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        lifecycleStatus: { $ne: BoardMemberLifecycleStatus.OFFBOARDED },
      })
      .select('name role')
      .lean();
    const chair = members.find((m) => m.role === 'Chair') ?? null;

    const submissions = await this.submissionModel
      .find({ cycleId: cycle._id })
      .lean();
    const byReviewer = new Map<string, typeof submissions>();
    for (const s of submissions) {
      const key = s.reviewerId.toString();
      const list = byReviewer.get(key) ?? [];
      list.push(s);
      byReviewer.set(key, list);
    }

    const membershipMap = await this.committeeService.getMembershipsMap(
      tenantId,
      members.map((m) => m._id.toString()),
    );

    const rows = members.map((m) => {
      const id = m._id.toString();
      const mine = byReviewer.get(id) ?? [];
      const isChair = m.role === 'Chair';
      const committeeCount = (membershipMap.get(id) ?? []).length;
      const expected =
        1 + // self
        (members.length - 1) + // peer — every other director
        (isChair ? 0 : 1) + // chair — skipped for the chair themself
        committeeCount;
      const submitted = mine.length;
      return {
        boardMemberId: id,
        name: m.name,
        role: m.role,
        expected,
        submitted,
        complete: submitted >= expected,
        self: mine.some((s) => s.type === BoardEvaluationType.SELF),
        peerSubmitted: mine.filter((s) => s.type === BoardEvaluationType.PEER)
          .length,
        peerExpected: members.length - 1,
        committeeSubmitted: mine.filter(
          (s) => s.type === BoardEvaluationType.COMMITTEE,
        ).length,
        committeeExpected: committeeCount,
        chairSubmitted: isChair
          ? null
          : mine.some((s) => s.type === BoardEvaluationType.CHAIR),
      };
    });

    const allScores = submissions.flatMap((s) => s.ratings.map((r) => r.score));
    const averageScore = allScores.length
      ? Math.round(
          (allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10,
        ) / 10
      : null;

    return {
      cycle,
      chairName: chair?.name ?? null,
      totalDirectors: members.length,
      totalSubmissions: submissions.length,
      averageScore,
      directors: rows.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // BOARD PORTAL — self-service
  // ═══════════════════════════════════════════════════════════

  // Everything the board portal's Evaluations page needs in one call:
  // the current open cycle (or null — nothing to do), whether the
  // caller is the Chair (hides the Chair tab), every peer and
  // committee to evaluate, who the current Chair is (the Chair tab's
  // single target), and the caller's own submissions so far so the
  // UI can show "submitted" vs "pending" per target.
  async getMyContext(userId: string) {
    const { boardMemberId, tenantId, name } =
      await this.boardMemberService.resolveBoardMember(userId);
    const isChair = await this.boardMemberService.isChairForPortal(userId);

    const cycle = await this.cycleModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        status: BoardEvaluationCycleStatus.OPEN,
      })
      .sort({ createdAt: -1 })
      .lean();

    const directory =
      await this.boardMemberService.getDirectoryForPortal(userId);
    const peers = directory
      .filter((d: any) => !d.isYou)
      .map((d: any) => ({ id: d.id.toString(), name: d.name, role: d.role }));

    const chairMember = await this.boardMemberService.getCurrentChair(tenantId);
    const chair =
      !isChair && chairMember && chairMember._id.toString() !== boardMemberId
        ? { id: chairMember._id.toString(), name: chairMember.name }
        : null;

    const committees = await this.committeeService.getMembershipsForBoardMember(
      tenantId,
      boardMemberId,
    );

    let submissions: {
      self: any | null;
      peer: Record<string, any>;
      chair: any | null;
      committee: Record<string, any>;
    } = { self: null, peer: {}, chair: null, committee: {} };

    if (cycle) {
      const mine = await this.submissionModel
        .find({
          cycleId: cycle._id,
          reviewerId: new Types.ObjectId(boardMemberId),
        })
        .lean();
      for (const s of mine) {
        if (s.type === BoardEvaluationType.SELF) submissions.self = s;
        else if (s.type === BoardEvaluationType.PEER && s.targetId)
          submissions.peer[s.targetId.toString()] = s;
        else if (s.type === BoardEvaluationType.CHAIR) submissions.chair = s;
        else if (s.type === BoardEvaluationType.COMMITTEE && s.committeeId)
          submissions.committee[s.committeeId.toString()] = s;
      }
    }

    return {
      cycle,
      isChair,
      reviewerName: name,
      peers,
      chair,
      committees: committees.map((c) => ({
        id: c.committeeId,
        name: c.name,
        isChair: c.isChair,
      })),
      submissions,
    };
  }

  private async getOpenCycleOrThrow(tenantId: string, cycleId: string) {
    const cycle = await this.cycleModel.findOne({
      _id: cycleId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!cycle) throw new NotFoundException('Evaluation cycle not found');
    if (cycle.status !== BoardEvaluationCycleStatus.OPEN) {
      throw new BadRequestException('This evaluation cycle is closed.');
    }
    return cycle;
  }

  private async upsert(
    tenantId: string,
    cycleId: string,
    reviewerId: string,
    reviewerName: string,
    type: BoardEvaluationType,
    targetId: string | null,
    targetName: string,
    committeeId: string | null,
    committeeName: string,
    dto: SubmitEvaluationDto,
  ) {
    return this.submissionModel.findOneAndUpdate(
      {
        cycleId: new Types.ObjectId(cycleId),
        reviewerId: new Types.ObjectId(reviewerId),
        type,
        targetId: targetId ? new Types.ObjectId(targetId) : null,
        committeeId: committeeId ? new Types.ObjectId(committeeId) : null,
      },
      {
        tenantId: new Types.ObjectId(tenantId),
        reviewerName,
        targetName,
        committeeName,
        ratings: dto.ratings,
        comment: dto.comment ?? '',
        submittedAt: new Date(),
      },
      { upsert: true, new: true },
    );
  }

  async submitSelf(userId: string, cycleId: string, dto: SubmitEvaluationDto) {
    const { boardMemberId, tenantId, name } =
      await this.boardMemberService.resolveBoardMember(userId);
    await this.getOpenCycleOrThrow(tenantId, cycleId);
    return this.upsert(
      tenantId,
      cycleId,
      boardMemberId,
      name,
      BoardEvaluationType.SELF,
      null,
      '',
      null,
      '',
      dto,
    );
  }

  async submitPeer(
    userId: string,
    cycleId: string,
    targetId: string,
    dto: SubmitEvaluationDto,
  ) {
    const { boardMemberId, tenantId, name } =
      await this.boardMemberService.resolveBoardMember(userId);
    await this.getOpenCycleOrThrow(tenantId, cycleId);
    if (targetId === boardMemberId) {
      throw new BadRequestException(
        'Use self assessment to evaluate yourself.',
      );
    }
    const target = await this.boardMemberModel.findOne({
      _id: targetId,
      tenantId: new Types.ObjectId(tenantId),
      lifecycleStatus: { $ne: BoardMemberLifecycleStatus.OFFBOARDED },
    });
    if (!target) throw new NotFoundException('Board member not found');
    return this.upsert(
      tenantId,
      cycleId,
      boardMemberId,
      name,
      BoardEvaluationType.PEER,
      targetId,
      target.name,
      null,
      '',
      dto,
    );
  }

  async submitChair(userId: string, cycleId: string, dto: SubmitEvaluationDto) {
    const { boardMemberId, tenantId, name } =
      await this.boardMemberService.resolveBoardMember(userId);
    const isChair = await this.boardMemberService.isChairForPortal(userId);
    if (isChair) {
      throw new ForbiddenException(
        'The Board Chair does not submit a Chair evaluation.',
      );
    }
    await this.getOpenCycleOrThrow(tenantId, cycleId);
    const chair = await this.boardMemberService.getCurrentChair(tenantId);
    if (!chair) throw new NotFoundException('No current Board Chair set');
    return this.upsert(
      tenantId,
      cycleId,
      boardMemberId,
      name,
      BoardEvaluationType.CHAIR,
      chair._id.toString(),
      chair.name,
      null,
      '',
      dto,
    );
  }

  async submitCommittee(
    userId: string,
    cycleId: string,
    committeeId: string,
    dto: SubmitEvaluationDto,
  ) {
    const { boardMemberId, tenantId, name } =
      await this.boardMemberService.resolveBoardMember(userId);
    await this.getOpenCycleOrThrow(tenantId, cycleId);
    const memberships =
      await this.committeeService.getMembershipsForBoardMember(
        tenantId,
        boardMemberId,
      );
    const committee = memberships.find((c) => c.committeeId === committeeId);
    if (!committee) {
      throw new BadRequestException(
        'You can only evaluate committees you belong to.',
      );
    }
    return this.upsert(
      tenantId,
      cycleId,
      boardMemberId,
      name,
      BoardEvaluationType.COMMITTEE,
      null,
      '',
      committeeId,
      committee.name,
      dto,
    );
  }

  // Board portal — the Evaluations page's "Past evaluations" table:
  // every closed cycle plus the caller's own completion summary.
  async getMyHistory(userId: string) {
    const { boardMemberId, tenantId } =
      await this.boardMemberService.resolveBoardMember(userId);
    const cycles = await this.cycleModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        status: BoardEvaluationCycleStatus.CLOSED,
      })
      .sort({ closedAt: -1 })
      .lean();
    const results = [];
    for (const cycle of cycles) {
      const mine = await this.submissionModel
        .find({
          cycleId: cycle._id,
          reviewerId: new Types.ObjectId(boardMemberId),
        })
        .select('type')
        .lean();
      results.push({
        cycleId: cycle._id,
        title: cycle.title,
        dueDate: cycle.dueDate,
        closedAt: cycle.closedAt,
        mySubmissionCount: mine.length,
        myTypes: [...new Set(mine.map((m) => m.type))],
      });
    }
    return results;
  }
}
