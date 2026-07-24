import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Resolution,
  ResolutionDocument,
  ResolutionStatus,
  ResolutionOutcome,
  ResolutionType,
  BoardVote,
  WrittenStatus,
} from '../schemas';
import {
  CreateResolutionDto,
  SetBoardVoteDto,
  SetWrittenStatusDto,
  RecordWrittenResponseDto,
  CloseWrittenDto,
  AddProxyDto,
  SaveShareholderPollDto,
} from '../dtos/index.dto';
import { BoardMemberService } from './board-member.service';
import { EmailService } from 'src/common/utils/mailing/email.service';

interface Tally {
  approve: number;
  oppose: number;
  abstain: number;
  awaiting: number;
  total: number;
}

@Injectable()
export class ResolutionService {
  constructor(
    @InjectModel(Resolution.name)
    private readonly resolutionModel: Model<ResolutionDocument>,
    private readonly boardMemberService: BoardMemberService,
    private readonly emailService: EmailService,
  ) {}

  // ── Shared tally/outcome logic — the single source of truth both
  // Board and Written resolutions rely on. Recused directors are
  // excluded entirely, matching the mock's "Excluded from tally" UI.
  private tally(
    rows: {
      recused: boolean;
      vote?: BoardVote | null;
      response?: BoardVote | null;
    }[],
  ): Tally {
    const eligible = rows.filter((r) => !r.recused);
    const value = (r: any) => r.vote ?? r.response ?? null;
    const approve = eligible.filter(
      (r) => value(r) === BoardVote.APPROVE,
    ).length;
    const oppose = eligible.filter((r) => value(r) === BoardVote.OPPOSE).length;
    const abstain = eligible.filter(
      (r) => value(r) === BoardVote.ABSTAIN,
    ).length;
    const awaiting = eligible.filter((r) => value(r) === null).length;
    return { approve, oppose, abstain, awaiting, total: eligible.length };
  }

  private computeOutcome(
    approve: number,
    total: number,
    rule: 'Simple' | 'Special',
  ): ResolutionOutcome {
    if (total === 0) return ResolutionOutcome.FAILED;
    const ratio = approve / total;
    const threshold = rule === 'Special' ? 0.75 : 0.5;
    return ratio > threshold ||
      (rule === 'Simple' && ratio === 0.5 && approve > total - approve)
      ? ResolutionOutcome.PASSED
      : ratio >= threshold && rule === 'Special'
        ? ResolutionOutcome.PASSED
        : ResolutionOutcome.FAILED;
  }

  async getNextReference(tenantId: string): Promise<{ reference: string }> {
    const year = new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    const count = await this.resolutionModel.countDocuments({
      tenantId: new Types.ObjectId(tenantId),
      createdAt: { $gte: start, $lt: end },
    });
    return { reference: `RES-${year}-${String(count + 1).padStart(3, '0')}` };
  }

  async create(
    tenantId: string,
    dto: CreateResolutionDto,
  ): Promise<ResolutionDocument> {
    if (dto.type === ResolutionType.WRITTEN && !dto.deadline) {
      throw new BadRequestException(
        'A response deadline is required for a written resolution.',
      );
    }
    if (dto.type === ResolutionType.SHAREHOLDER && !dto.subType) {
      throw new BadRequestException(
        'A resolution sub-type is required for a shareholder resolution.',
      );
    }

    const reference =
      dto.reference?.trim() ||
      (await this.getNextReference(tenantId)).reference;
    const boardMembers = await this.boardMemberService.getAll(tenantId);

    const base: any = {
      tenantId: new Types.ObjectId(tenantId),
      reference,
      type: dto.type,
      subject: dto.subject.trim(),
      fullText: dto.fullText,
      linkedMeetingId: dto.linkedMeetingId
        ? new Types.ObjectId(dto.linkedMeetingId)
        : null,
      effectiveDate: new Date(dto.effectiveDate),
      status: ResolutionStatus.DRAFT,
      outcome: null,
    };

    if (dto.type === ResolutionType.BOARD) {
      base.proposer = dto.proposer ?? null;
      base.seconder = dto.seconder ?? null;
      base.boardVotes = boardMembers.map((d: any) => ({
        directorId: d._id,
        directorName: d.name,
        directorEmail: d.email,
        recused: (d.conflicts?.length ?? 0) > 0,
        vote: null,
      }));
    } else if (dto.type === ResolutionType.WRITTEN) {
      base.deadline = new Date(dto.deadline!);
      base.majorityRule = 'Simple';
      base.writtenRows = boardMembers.map((d: any) => ({
        directorId: d._id,
        directorName: d.name,
        directorEmail: d.email,
        recused: (d.conflicts?.length ?? 0) > 0,
        status: WrittenStatus.NOT_SENT,
        response: null,
      }));
      base.notifications = [
        {
          at: new Date(),
          kind: 'System',
          message: 'Resolution drafted — awaiting circulation.',
        },
      ];
    } else {
      base.subType = dto.subType;
      base.quorumRequired = 50;
      base.quorumPresent = 0;
      base.proxies = [];
      base.pollFor = 0;
      base.pollAgainst = 0;
      base.pollAbstain = 0;
    }

    return this.resolutionModel.create(base);
  }

  async getAll(tenantId: string) {
    return this.resolutionModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string): Promise<ResolutionDocument> {
    const r = await this.resolutionModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!r) throw new NotFoundException('Resolution not found');
    return r;
  }

  private assertNotClosed(r: ResolutionDocument) {
    if (r.status === ResolutionStatus.CLOSED) {
      throw new BadRequestException('This resolution is closed and read-only.');
    }
  }

  // ── Board ──────────────────────────────────────────────────

  async setBoardVote(tenantId: string, id: string, dto: SetBoardVoteDto) {
    const r = await this.getById(tenantId, id);
    this.assertNotClosed(r);
    const row = r.boardVotes[dto.rowIndex];
    if (!row) throw new NotFoundException('Director row not found');
    if (row.recused)
      throw new BadRequestException('A recused director cannot vote.');
    row.vote = dto.vote;
    if (r.status === ResolutionStatus.DRAFT)
      r.status = ResolutionStatus.VOTING_OPEN;
    r.markModified('boardVotes');
    await r.save();
    return r;
  }

  async closeBoardVote(tenantId: string, id: string) {
    const r = await this.getById(tenantId, id);
    this.assertNotClosed(r);
    const t = this.tally(r.boardVotes);
    if (t.total === 0 || t.awaiting > 0) {
      throw new BadRequestException(
        'All eligible directors must vote before closing.',
      );
    }
    r.outcome = this.computeOutcome(t.approve, t.total, 'Simple');
    r.status = ResolutionStatus.CLOSED;
    r.closedAt = new Date();
    await r.save();
    return r;
  }

  // ── Written ────────────────────────────────────────────────

  async setWrittenStatus(
    tenantId: string,
    id: string,
    dto: SetWrittenStatusDto,
    businessName: string,
  ) {
    const r = await this.getById(tenantId, id);
    this.assertNotClosed(r);
    const row = r.writtenRows[dto.rowIndex];
    if (!row) throw new NotFoundException('Director row not found');
    row.status = dto.status;
    if (r.status === ResolutionStatus.DRAFT)
      r.status = ResolutionStatus.CIRCULATING;
    r.notifications.push({
      at: new Date(),
      kind: dto.status === WrittenStatus.REMINDED ? 'Reminder' : 'Sent',
      message: `${dto.status} — ${row.directorName}`,
    } as any);
    r.markModified('writtenRows');
    r.markModified('notifications');
    await r.save();

    if (row.directorEmail) {
      this.emailService
        .sendResolutionCirculated({
          to: row.directorEmail,
          directorName: row.directorName,
          subject: r.subject,
          reference: r.reference,
          deadline: r.deadline!,
          isReminder: dto.status === WrittenStatus.REMINDED,
          businessName,
        })
        .catch(() => {});
    }
    return r;
  }

  async recordWrittenResponse(
    tenantId: string,
    id: string,
    dto: RecordWrittenResponseDto,
  ) {
    const r = await this.getById(tenantId, id);
    this.assertNotClosed(r);
    const row = r.writtenRows[dto.rowIndex];
    if (!row) throw new NotFoundException('Director row not found');
    if (row.recused)
      throw new BadRequestException('A recused director cannot respond.');
    row.response = dto.response;
    row.status = WrittenStatus.RESPONDED;
    row.respondedAt = new Date();
    row.manualEntry = true;
    r.notifications.push({
      at: new Date(),
      kind: 'Response',
      message: `${row.directorName} responded: ${dto.response} (logged manually)`,
    } as any);
    r.markModified('writtenRows');
    r.markModified('notifications');
    await r.save();
    return r;
  }

  async closeWritten(tenantId: string, id: string, dto: CloseWrittenDto) {
    const r = await this.getById(tenantId, id);
    this.assertNotClosed(r);
    const t = this.tally(
      r.writtenRows.map((row) => ({
        recused: row.recused,
        response: row.response,
      })),
    );
    const passedDeadline = r.deadline
      ? Date.now() >= r.deadline.getTime()
      : false;
    if (!dto.forced && t.total > 0 && t.awaiting > 0 && !passedDeadline) {
      throw new BadRequestException(
        'Not all directors have responded and the deadline has not passed. Use force close to override.',
      );
    }
    r.outcome = this.computeOutcome(t.approve, t.total, 'Simple');
    r.status = ResolutionStatus.CLOSED;
    r.closedAt = new Date();
    if (dto.forced) {
      r.forceClosedBy = 'Admin';
      r.forceClosedAt = new Date();
    }
    r.notifications.push({
      at: new Date(),
      kind: 'System',
      message: dto.forced ? 'Force-closed by Admin' : 'Circulation closed',
    } as any);
    r.markModified('notifications');
    await r.save();
    return r;
  }

  // ── Shareholder ────────────────────────────────────────────

  async addProxy(tenantId: string, id: string, dto: AddProxyDto) {
    const r = await this.getById(tenantId, id);
    this.assertNotClosed(r);
    r.proxies.push({
      proxyName: dto.proxyName,
      representing: dto.representing,
      shares: dto.shares,
      vote: null,
    } as any);
    r.markModified('proxies');
    await r.save();
    return r;
  }

  async saveShareholderPoll(
    tenantId: string,
    id: string,
    dto: SaveShareholderPollDto,
  ) {
    const r = await this.getById(tenantId, id);
    this.assertNotClosed(r);
    r.pollFor = dto.pollFor;
    r.pollAgainst = dto.pollAgainst;
    r.pollAbstain = dto.pollAbstain;
    r.quorumPresent = dto.quorumPresent;
    if (r.status === ResolutionStatus.DRAFT)
      r.status = ResolutionStatus.VOTING_OPEN;
    await r.save();
    return r;
  }

  async closeShareholder(tenantId: string, id: string) {
    const r = await this.getById(tenantId, id);
    this.assertNotClosed(r);
    if (r.quorumPresent < r.quorumRequired) {
      throw new BadRequestException('Quorum has not been met.');
    }
    const total = r.pollFor + r.pollAgainst + r.pollAbstain;
    r.outcome = this.computeOutcome(
      r.pollFor,
      total,
      r.subType === 'Special' ? 'Special' : 'Simple',
    );
    r.status = ResolutionStatus.CLOSED;
    r.closedAt = new Date();
    await r.save();
    return r;
  }
}
