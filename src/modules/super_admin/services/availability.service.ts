import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SuperAdminAvailability,
  SuperAdminAvailabilityDocument,
  WEEKDAYS,
} from '../schemas/availability.schema';
import { SetAvailabilityDto } from '../dtos/demo-request.dto';
import { DemoRequest, DemoRequestDocument } from '../schemas/demo-request.schema';
import { DemoRequestStatus } from '../schemas/demo-request.schema';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectModel(SuperAdminAvailability.name)
    private readonly model: Model<SuperAdminAvailabilityDocument>,
    @InjectModel(DemoRequest.name)
    private readonly demoRequestModel: Model<DemoRequestDocument>,
  ) {}

  // Single global document — created with every weekday disabled the
  // first time anyone asks, rather than needing a seed/migration.
  async getOrCreate(): Promise<SuperAdminAvailabilityDocument> {
    let doc = await this.model.findOne();
    if (!doc) {
      doc = await this.model.create({
        days: WEEKDAYS.map((day) => ({ day, enabled: false, slots: [] })),
        timezone: 'CAT',
        durationMinutes: 30,
      });
    }
    return doc;
  }

  async set(dto: SetAvailabilityDto): Promise<SuperAdminAvailabilityDocument> {
    const doc = await this.getOrCreate();
    doc.days = dto.days as any;
    doc.timezone = dto.timezone;
    doc.durationMinutes = dto.durationMinutes;
    await doc.save();
    return doc;
  }

  // What the public contact form actually renders: the next 14
  // calendar days, each carrying the slots the Super Admin published
  // for that weekday, minus whichever of those slots is already taken
  // by a request that's still live (not Cancelled). Today's past
  // slots are dropped too, so a prospect can never pick a time that
  // has already gone by.
  async getPublicWeek(): Promise<{
    timezone: string;
    durationMinutes: number;
    days: { date: string; day: string; label: string; slots: string[] }[];
  }> {
    const doc = await this.getOrCreate();
    const byDay = new Map(doc.days.map((d) => [d.day, d]));

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const horizonEnd = new Date(startOfToday.getTime() + 14 * DAY_MS);

    const taken = await this.demoRequestModel
      .find({
        status: { $ne: DemoRequestStatus.CANCELLED },
        requestedDate: { $gte: startOfToday, $lt: horizonEnd },
      })
      .select('requestedDate requestedTime')
      .lean();
    const takenKeys = new Set(
      taken.map(
        (t) => `${new Date(t.requestedDate).toDateString()}|${t.requestedTime}`,
      ),
    );

    const out: { date: string; day: string; label: string; slots: string[] }[] =
      [];
    for (let i = 0; i < 14; i++) {
      const date = new Date(startOfToday.getTime() + i * DAY_MS);
      const dayName = WEEKDAYS[(date.getDay() + 6) % 7]; // JS Sun=0 → our Mon-first index
      const config = byDay.get(dayName);
      if (!config || !config.enabled || config.slots.length === 0) continue;

      let slots = [...config.slots].sort();
      if (i === 0) {
        const nowHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(
          now.getMinutes(),
        ).padStart(2, '0')}`;
        slots = slots.filter((s) => s > nowHHmm);
      }
      slots = slots.filter(
        (s) => !takenKeys.has(`${date.toDateString()}|${s}`),
      );
      if (slots.length === 0) continue;

      out.push({
        date: date.toISOString().slice(0, 10),
        day: dayName,
        label: date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }),
        slots,
      });
    }

    return {
      timezone: doc.timezone,
      durationMinutes: doc.durationMinutes,
      days: out,
    };
  }
}
