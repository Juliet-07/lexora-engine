import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  NewsletterSettings,
  NewsletterSettingsDocument,
  NewsletterUnsubscribe,
  NewsletterUnsubscribeDocument,
  SOCIAL_LINK_KEYS,
  SocialLinkKey,
} from '../schemas';
import { UpdateEmailFooterDto } from '../dtos';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  Contact,
  ContactDocument,
  ActivityType,
} from 'src/modules/crm/crm/schemas/contact.schema';
import {
  BoardMember,
  BoardMemberDocument,
} from 'src/modules/grc/governance/schemas/board-member.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

const LABELS: Record<SocialLinkKey, string> = {
  website: 'Website',
  linkedin: 'LinkedIn',
  x: 'X',
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normEmail = (e: string) =>
  String(e ?? '')
    .trim()
    .toLowerCase();

// What every outgoing tenant email needs from this service: the
// social links + address for the footer, and (for emails to a
// person) their own unsubscribe link.
export interface EmailFooterContext {
  socialLinks: { label: string; url: string }[];
  address: string;
}

// Owns two things that sit at the bottom of every tenant email:
//   1. the tenant's social links / address (NewsletterSettings), and
//   2. the unsubscribe list (NewsletterUnsubscribe) plus the signed
//      per-recipient link that feeds it.
//
// The unsubscribe link is a signed token, not a stored one:
//   base64url(tenantId|email) . HMAC-SHA256(...)
// so it can be generated for any recipient at send time without a
// write, can't be forged or guessed for someone else's address, and
// keeps working forever (an unsubscribe link in an old email must
// never expire).
@Injectable()
export class EmailFooterService {
  constructor(
    @InjectModel(NewsletterSettings.name)
    private readonly settingsModel: Model<NewsletterSettingsDocument>,
    @InjectModel(NewsletterUnsubscribe.name)
    private readonly unsubModel: Model<NewsletterUnsubscribeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMemberDocument>,
  ) {}

  // ── Social links & address ─────────────────────────────────────

  private normaliseUrl(field: string, raw: string): string {
    const v = String(raw ?? '').trim();
    if (!v) return '';
    const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    if (!/^https?:\/\/[^\s/]+\.[^\s/]+(\/\S*)?$/i.test(withScheme)) {
      throw new BadRequestException(
        `${field} must be a valid web address, e.g. https://example.com`,
      );
    }
    return withScheme;
  }

  async getSettings(tenantId: string) {
    const doc = await this.settingsModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .lean();
    const out: Record<string, string> = { address: doc?.address ?? '' };
    for (const k of SOCIAL_LINK_KEYS) out[k] = (doc as any)?.[k] ?? '';
    return out as Record<SocialLinkKey, string> & { address: string };
  }

  async updateSettings(tenantId: string, dto: UpdateEmailFooterDto) {
    const set: Record<string, string> = {};
    for (const k of SOCIAL_LINK_KEYS) {
      if (dto[k] !== undefined) {
        set[k] = this.normaliseUrl(LABELS[k], dto[k] as string);
      }
    }
    if (dto.address !== undefined) set.address = dto.address.trim();
    await this.settingsModel.updateOne(
      { tenantId: new Types.ObjectId(tenantId) },
      { $set: set, $setOnInsert: { tenantId: new Types.ObjectId(tenantId) } },
      { upsert: true },
    );
    return this.getSettings(tenantId);
  }

  // Ordered list the renderers print, with only the links that are set.
  async footerContext(tenantId: string): Promise<EmailFooterContext> {
    const s = await this.getSettings(tenantId);
    return {
      socialLinks: SOCIAL_LINK_KEYS.filter((k) => !!s[k]).map((k) => ({
        label: LABELS[k],
        url: s[k],
      })),
      address: s.address,
    };
  }

  // ── Signed links ───────────────────────────────────────────────

  private secret(): string {
    const s = process.env.JWT_SECRET;
    if (!s) {
      // Never fall back to a guessable key — an unsigned link could
      // be used to unsubscribe (or probe) anyone.
      throw new InternalServerErrorException(
        'Unsubscribe links are unavailable: the server has no signing key configured',
      );
    }
    return s;
  }

  private sig(payload: string): string {
    return createHmac('sha256', this.secret())
      .update(`unsubscribe:${payload}`)
      .digest('base64url')
      .slice(0, 32);
  }

  tokenFor(tenantId: string, email: string): string {
    const payload = Buffer.from(`${tenantId}|${normEmail(email)}`).toString(
      'base64url',
    );
    return `${payload}.${this.sig(payload)}`;
  }

  urlFor(tenantId: string, email: string): string {
    return `${process.env.TENANT_APP_URL}/unsubscribe/${this.tokenFor(tenantId, email)}`;
  }

  // The link shown in composer previews and test sends: it points at
  // the real page but carries no recipient, so clicking it can never
  // unsubscribe anyone by accident.
  previewUrl(): string {
    return `${process.env.TENANT_APP_URL}/unsubscribe/preview`;
  }

  private verify(token: string): { tenantId: string; email: string } {
    const bad = () =>
      new NotFoundException('This unsubscribe link is not valid');
    const [payload, given] = String(token ?? '').split('.');
    if (!payload || !given) throw bad();
    const expected = this.sig(payload);
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw bad();
    const [tenantId, email] = Buffer.from(payload, 'base64url')
      .toString()
      .split('|');
    if (!tenantId || !email || !Types.ObjectId.isValid(tenantId)) throw bad();
    return { tenantId, email };
  }

  // ── The unsubscribe list ───────────────────────────────────────

  // Lower-cased emails the tenant must not send newsletters to. Pass
  // `emails` to check just those; omit for the whole list.
  async suppressedSet(tenantId: string, emails?: string[]) {
    const filter: Record<string, any> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (emails) {
      const list = [...new Set(emails.map(normEmail).filter(Boolean))];
      if (!list.length) return new Set<string>();
      filter.email = { $in: list };
    }
    const rows = await this.unsubModel.find(filter).select('email').lean();
    return new Set(rows.map((r) => r.email));
  }

  async list(tenantId: string) {
    return this.unsubModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ unsubscribedAt: -1 })
      .lean();
  }

  // Best-known identity for an address, so the tenant's list reads
  // "Amina Yusuf — Contact" rather than a bare email.
  private async identify(tenantId: string, email: string) {
    const tId = new Types.ObjectId(tenantId);
    const ci = new RegExp(`^${escapeRegex(email)}$`, 'i');
    const contact = await this.contactModel
      .findOne({ tenantId: tId, email: ci })
      .select('name')
      .lean();
    if (contact) return { name: contact.name, role: 'Contact' };
    const board = await this.boardMemberModel
      .findOne({ tenantId: tId, email: ci })
      .select('name')
      .lean();
    if (board) return { name: (board as any).name, role: 'Board member' };
    const client = await this.userModel
      .findOne({ tenantId: tId, email: ci })
      .select('firstName lastName')
      .lean();
    if (client) {
      return {
        name: [client.firstName, client.lastName].filter(Boolean).join(' '),
        role: 'Client',
      };
    }
    return { name: '', role: '' };
  }

  private async noteOnContacts(tenantId: string, email: string, text: string) {
    await this.contactModel.updateMany(
      {
        tenantId: new Types.ObjectId(tenantId),
        email: new RegExp(`^${escapeRegex(email)}$`, 'i'),
      },
      {
        $push: {
          activity: {
            type: ActivityType.NOTE,
            summary: text,
            by: 'System',
            at: new Date(),
          },
        },
      },
    );
  }

  private maskEmail(email: string) {
    const [u, d] = email.split('@');
    if (!d) return email;
    return `${u.slice(0, 1)}${'•'.repeat(Math.max(1, Math.min(u.length - 1, 5)))}@${d}`;
  }

  // ── Public (token-gated) ───────────────────────────────────────

  async describe(token: string) {
    const { tenantId, email } = this.verify(token);
    const exists = await this.unsubModel.exists({
      tenantId: new Types.ObjectId(tenantId),
      email,
    });
    return {
      businessName: await resolveBusinessName(this.userModel, tenantId),
      email: this.maskEmail(email),
      unsubscribed: !!exists,
    };
  }

  async unsubscribe(token: string, reason?: string) {
    const { tenantId, email } = this.verify(token);
    const tId = new Types.ObjectId(tenantId);
    const existing = await this.unsubModel.findOne({ tenantId: tId, email });
    if (!existing) {
      const who = await this.identify(tenantId, email);
      try {
        await this.unsubModel.create({
          tenantId: tId,
          email,
          name: who.name,
          role: who.role,
          reason: (reason ?? '').trim(),
          unsubscribedAt: new Date(),
        });
      } catch (err: any) {
        // A double-click racing itself: the unique index already
        // holds the row, which is exactly the state we wanted.
        if (err?.code !== 11000) throw err;
      }
      await this.noteOnContacts(
        tenantId,
        email,
        'Unsubscribed from newsletters (used the unsubscribe link)',
      );
    }
    return {
      unsubscribed: true,
      businessName: await resolveBusinessName(this.userModel, tenantId),
    };
  }

  async resubscribe(token: string) {
    const { tenantId, email } = this.verify(token);
    const res = await this.unsubModel.deleteOne({
      tenantId: new Types.ObjectId(tenantId),
      email,
    });
    if (res.deletedCount) {
      await this.noteOnContacts(
        tenantId,
        email,
        'Resubscribed to newsletters (used the resubscribe link)',
      );
    }
    return {
      unsubscribed: false,
      businessName: await resolveBusinessName(this.userModel, tenantId),
    };
  }
}
