import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ExchangeRateSnapshot, ExchangeRateSnapshotDocument } from '../schemas';

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // refresh once per day — payroll
// doesn't need minute-fresh FX, and this keeps free-tier API usage trivial.

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    @InjectModel(ExchangeRateSnapshot.name)
    private readonly snapshotModel: Model<ExchangeRateSnapshotDocument>,
  ) {}

  // ── Public — get a single conversion rate, using cache when fresh ──

  async getRate(
    fromCurrency: string,
    toCurrency: string,
  ): Promise<{
    rate: number;
    fetchedAt: Date;
    stale: boolean;
  }> {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    if (from === to) {
      return { rate: 1, fetchedAt: new Date(), stale: false };
    }

    const snapshot = await this.getOrRefreshSnapshot(from);
    const rate = snapshot.rates[to];

    if (rate === undefined) {
      throw new BadGatewayException(
        `Exchange rate from ${from} to ${to} is not available. Check the currency code or set the rate manually for this payroll run.`,
      );
    }

    const ageMs = Date.now() - new Date(snapshot.fetchedAt).getTime();
    return {
      rate,
      fetchedAt: snapshot.fetchedAt,
      stale: ageMs > CACHE_MAX_AGE_MS,
    };
  }

  // ── Force a refresh regardless of cache age — used by a manual
  // "refresh rates" button in the payroll UI, or before a payroll run
  // if the tenant wants guaranteed-fresh numbers. ──

  async refreshRates(
    baseCurrency: string,
  ): Promise<ExchangeRateSnapshotDocument> {
    const base = baseCurrency.toUpperCase();
    const apiKey = process.env.EXCHANGE_RATE_API_KEY;

    if (!apiKey) {
      throw new BadGatewayException(
        'Exchange rate API key is not configured. Set EXCHANGE_RATE_API_KEY in the environment.',
      );
    }

    const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${base}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      this.logger.error(`Exchange rate fetch failed: ${err.message}`);
      throw new BadGatewayException(
        'Could not reach the exchange rate provider. Try again shortly, or set rates manually.',
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `Exchange rate provider returned an error (${response.status}). Check the base currency code.`,
      );
    }

    const body = await response.json();
    if (body.result !== 'success' || !body.conversion_rates) {
      throw new BadGatewayException(
        'Exchange rate provider returned an unexpected response.',
      );
    }

    const fetchedAt = new Date();
    const updated = await this.snapshotModel.findOneAndUpdate(
      { baseCurrency: base },
      { baseCurrency: base, rates: body.conversion_rates, fetchedAt },
      { upsert: true, new: true },
    );

    return updated;
  }

  // ── PRIVATE ──────────────────────────────────────────────────

  private async getOrRefreshSnapshot(
    baseCurrency: string,
  ): Promise<ExchangeRateSnapshotDocument> {
    const existing = await this.snapshotModel.findOne({ baseCurrency });

    if (existing) {
      const ageMs = Date.now() - new Date(existing.fetchedAt).getTime();
      if (ageMs < CACHE_MAX_AGE_MS) {
        return existing;
      }
      // Stale — try to refresh, but fall back to the stale snapshot
      // rather than failing outright if the API is temporarily down.
      // Payroll shouldn't be blocked by a third-party FX outage.
      try {
        return await this.refreshRates(baseCurrency);
      } catch (err) {
        this.logger.warn(
          `Using stale exchange rate snapshot for ${baseCurrency} (refresh failed: ${err.message})`,
        );
        return existing;
      }
    }

    // No snapshot at all yet — must fetch.
    return this.refreshRates(baseCurrency);
  }
}