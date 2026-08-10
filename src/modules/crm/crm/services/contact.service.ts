import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Contact, ContactDocument } from '../schemas';
import { UpsertContactDto, BulkTagDto, LogActivityDto } from '../dtos';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class ContactService {
  constructor(
    @InjectModel(Contact.name)
    private readonly model: Model<ContactDocument>,
  ) {}

  // Flags against the earliest existing contact sharing this email
  // or phone (matching the confirmed prototype's own example: a
  // later, misspelled duplicate points at the original). Excludes
  // the contact itself so edits don't self-flag.
  private async findEarlierMatch(
    tenantId: Types.ObjectId,
    email: string | undefined,
    phone: string | undefined,
    excludeId?: string,
  ) {
    const or: any[] = [];
    if (email?.trim()) {
      or.push({ email: new RegExp(`^${escapeRegex(email.trim())}$`, 'i') });
    }
    if (phone?.trim()) {
      or.push({ phone: phone.trim() });
    }
    if (!or.length) return null;

    const query: any = { tenantId, $or: or };
    if (excludeId) query._id = { $ne: excludeId };

    return this.model.findOne(query).sort({ createdAt: 1 }).lean();
  }

  async getAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(tenantId: string, id: string) {
    const c = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .lean();
    if (!c) throw new NotFoundException('Contact not found');
    return c;
  }

  async create(tenantId: string, dto: UpsertContactDto) {
    const tId = new Types.ObjectId(tenantId);
    const match = await this.findEarlierMatch(tId, dto.email, dto.phone);

    const created = await this.model.create({
      ...dto,
      tenantId: tId,
      lastContact: new Date(),
      duplicateOf: match?._id ?? null,
    });
    return created.toObject();
  }

  async update(tenantId: string, id: string, dto: UpsertContactDto) {
    const tId = new Types.ObjectId(tenantId);
    const c = await this.model.findOne({ _id: id, tenantId: tId });
    if (!c) throw new NotFoundException('Contact not found');

    // lastContact is deliberately untouched here — editing details
    // isn't the same as making contact, matching the prototype.
    Object.assign(c, dto);

    // Re-check for a duplicate match if contact details changed —
    // a previously-clean contact can become a duplicate on edit, or
    // vice versa if the clashing detail was corrected.
    const match = await this.findEarlierMatch(tId, c.email, c.phone, id);
    c.duplicateOf = match?._id ?? null;
    if (!match) c.duplicateDismissed = false;

    await c.save();
    return c.toObject();
  }

  async delete(tenantId: string, id: string) {
    const res = await this.model.deleteOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!res.deletedCount) throw new NotFoundException('Contact not found');
    return { deleted: true };
  }

  // Merges `id` into its flagged original: tags/roleTags combined,
  // activity reassigned, then the duplicate is removed.
  async merge(tenantId: string, id: string) {
    const tId = new Types.ObjectId(tenantId);
    const dup = await this.model.findOne({ _id: id, tenantId: tId });
    if (!dup) throw new NotFoundException('Contact not found');
    if (!dup.duplicateOf) {
      throw new BadRequestException(
        'This contact is not flagged as a duplicate',
      );
    }
    const original = await this.model.findOne({
      _id: dup.duplicateOf,
      tenantId: tId,
    });
    if (!original) throw new NotFoundException('Original contact not found');

    original.tags = Array.from(new Set([...original.tags, ...dup.tags]));
    original.roleTags = Array.from(
      new Set([...original.roleTags, ...dup.roleTags]),
    );
    for (const entry of dup.activity) {
      original.activity.push({
        type: entry.type,
        summary: entry.summary,
        by: entry.by,
        at: entry.at,
      } as any);
    }
    await original.save();
    await dup.deleteOne();
    return original.toObject();
  }

  async dismissDuplicate(tenantId: string, id: string) {
    const c = await this.model.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { $set: { duplicateDismissed: true } },
      { new: true },
    );
    if (!c) throw new NotFoundException('Contact not found');
    return c.toObject();
  }

  async bulkTag(tenantId: string, dto: BulkTagDto) {
    const tId = new Types.ObjectId(tenantId);
    await this.model.updateMany(
      { _id: { $in: dto.contactIds }, tenantId: tId },
      { $addToSet: { tags: dto.tag } },
    );
    return this.getAll(tenantId);
  }

  async logActivity(tenantId: string, id: string, dto: LogActivityDto) {
    const c = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!c) throw new NotFoundException('Contact not found');
    c.activity.push({
      type: dto.type,
      summary: dto.summary,
      by: dto.by ?? '',
      at: new Date(),
    } as any);
    await c.save();
    return c.toObject();
  }
}
