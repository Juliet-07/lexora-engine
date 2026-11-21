import { ConflictException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
// The service only needs its user model here; the health-score module drags
// in ESM-only packages (uuid) that Jest does not transform.
jest.mock('../../grc/health-score/health-score.service', () => ({
  HealthScoreService: class {},
}));
import { TenantService } from './tenant.service';

// Builds the service without Nest DI, with just the user model and the
// ledger collection the currency rules touch.
function make(opts: { baseCurrency?: string; ledgerEntries: number }) {
  const id = new Types.ObjectId();
  const updates: any[] = [];
  const userModel: any = {
    findById: () => ({
      select: () => ({
        lean: async () => ({
          tenantProfile: { baseCurrency: opts.baseCurrency },
        }),
      }),
    }),
    findByIdAndUpdate: (_id: any, u: any) => {
      updates.push(u);
      return { select: async () => ({ ok: true }) };
    },
    db: {
      collection: () => ({ countDocuments: async () => opts.ledgerEntries }),
    },
  };
  const svc: any = Object.create(TenantService.prototype);
  svc.userModel = userModel;
  return { svc: svc as TenantService, id: String(id), updates };
}

describe('base currency', () => {
  it('defaults to USD and is open to change while the ledger is empty', async () => {
    const { svc, id } = make({ ledgerEntries: 0 });
    expect(await svc.getBaseCurrencyState(id)).toEqual({
      baseCurrency: 'USD',
      locked: false,
      lockedReason: null,
    });
  });

  it('saves a new currency (upper-cased) while the ledger is empty', async () => {
    const { svc, id, updates } = make({ ledgerEntries: 0 });
    await svc.updateMyProfile(id, { baseCurrency: 'rwf' } as any);
    expect(updates[0].$set['tenantProfile.baseCurrency']).toBe('RWF');
  });

  it('refuses to change currency once the ledger has entries', async () => {
    const { svc, id, updates } = make({
      baseCurrency: 'USD',
      ledgerEntries: 4,
    });
    expect((await svc.getBaseCurrencyState(id)).locked).toBe(true);
    await expect(
      svc.updateMyProfile(id, { baseCurrency: 'RWF' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updates).toHaveLength(0);
  });

  it('still saves the profile when the currency is unchanged but locked', async () => {
    const { svc, id, updates } = make({
      baseCurrency: 'USD',
      ledgerEntries: 4,
    });
    await svc.updateMyProfile(id, {
      baseCurrency: 'usd',
      businessName: 'Adzana',
    } as any);
    expect(updates).toHaveLength(1);
  });

  it('rejects a malformed currency code', async () => {
    const { svc, id } = make({ ledgerEntries: 0 });
    await expect(
      svc.updateMyProfile(id, { baseCurrency: 'DOLLARS' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
