import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import * as fs from 'fs';
import { join } from 'path';

type Scope = { tenantId: Types.ObjectId; mandateId: Types.ObjectId };

// Collections whose rows exist ONLY because of the mandate. Deleting the
// mandate deletes these rows.
const OWNED_BY_MANDATE: { label: string; collection: string }[] = [
  { label: 'tasks', collection: 'crm_tasks' },
  { label: 'timeEntries', collection: 'crm_time_entries' },
  { label: 'clientMessages', collection: 'crm_mandate_messages' },
  {
    label: 'employeeMessages',
    collection: 'crm_mandate_employee_messages',
  },
  { label: 'notes', collection: 'crm_mandate_notes' },
  { label: 'documents', collection: 'crm_mandate_documents' },
  {
    label: 'threadReads',
    collection: 'crm_mandate_employee_thread_reads',
  },
  { label: 'portfolioRisks', collection: 'crm_portfolio_risks' },
  { label: 'quotes', collection: 'crm_quotes' },
  { label: 'recurringInvoices', collection: 'crm_recurring_invoices' },
];

// Records that can legitimately exist without a mandate (legal matters,
// client money, expense claims, contracts, tickets). They are detached,
// never erased.
const UNLINK_FROM_MANDATE: {
  label: string;
  collection: string;
  set: Record<string, unknown>;
}[] = [
  {
    label: 'trustLedgers',
    collection: 'crm_trust_ledgers',
    set: { mandateId: null, mandateName: '' },
  },
  {
    label: 'expenseClaims',
    collection: 'crm_expense_claims',
    set: { mandateId: null, mandateName: null },
  },
  {
    label: 'contracts',
    collection: 'crm_tools_contracts',
    set: { mandateId: null },
  },
  {
    label: 'adrCases',
    collection: 'crm_adr_cases',
    set: { mandateId: null },
  },
  {
    label: 'litigationCases',
    collection: 'crm_litigation_cases',
    set: { mandateId: null },
  },
];

/**
 * Removes a mandate together with everything that hangs off it, so
 * nothing is left pointing at a mandate that no longer exists.
 *
 * Works on the collections directly (by name) instead of importing every
 * module's models — those modules already depend on projects, so wiring
 * them back in would create circular module imports.
 */
@Injectable()
export class MandateCascadeService {
  private readonly logger = new Logger(MandateCascadeService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  private col(name: string) {
    return this.connection.collection(name);
  }

  private scope(tenantId: string, mandateId: string): Scope {
    return {
      tenantId: new Types.ObjectId(tenantId),
      mandateId: new Types.ObjectId(mandateId),
    };
  }

  private async assertExists(s: Scope) {
    const exists = await this.col('crm_mandates').findOne(
      { _id: s.mandateId, tenantId: s.tenantId },
      { projection: { _id: 1 } },
    );
    if (!exists) throw new NotFoundException('Mandate not found');
  }

  // Everything billing-related that belongs to the mandate's invoices.
  private async billingIds(s: Scope) {
    const invoices = await this.col('crm_invoices')
      .find(s, {
        projection: { _id: 1, ref: 1, paidAmount: 1, currency: 1 },
      })
      .toArray();
    const invoiceIds = invoices.map((i) => i._id);
    const invoiceRefs = invoices.map((i) => String(i.ref));
    return { invoices, invoiceIds, invoiceRefs };
  }

  /** What deleting would remove — shown to the tenant before they confirm. */
  async impact(tenantId: string, mandateId: string) {
    const s = this.scope(tenantId, mandateId);
    await this.assertExists(s);

    const counts: Record<string, number> = {};
    for (const o of OWNED_BY_MANDATE) {
      counts[o.label] = await this.col(o.collection).countDocuments(s);
    }
    const { invoices, invoiceIds } = await this.billingIds(s);
    counts.invoices = invoices.length;
    counts.payments = invoiceIds.length
      ? await this.col('crm_payments').countDocuments({
          tenantId: s.tenantId,
          invoiceId: { $in: invoiceIds },
        })
      : 0;
    counts.creditNotes = invoiceIds.length
      ? await this.col('crm_credit_notes').countDocuments({
          tenantId: s.tenantId,
          invoiceId: { $in: invoiceIds },
        })
      : 0;
    const paidInvoices = invoices.filter((i) => (i.paidAmount ?? 0) > 0);

    const detached: Record<string, number> = {};
    for (const u of UNLINK_FROM_MANDATE) {
      detached[u.label] = await this.col(u.collection).countDocuments(s);
    }
    return {
      willDelete: counts,
      willDetach: detached,
      paidInvoiceCount: paidInvoices.length,
    };
  }

  /** Delete the mandate and everything tied to it. */
  async purge(tenantId: string, mandateId: string) {
    const s = this.scope(tenantId, mandateId);
    await this.assertExists(s);

    const removed: Record<string, number> = {};
    const filesToRemove: string[] = [];

    // 1. Billing: invoices and everything that points at them.
    const { invoices, invoiceIds, invoiceRefs } = await this.billingIds(s);
    if (invoiceIds.length) {
      const fullInvoices = await this.col('crm_invoices')
        .find({ _id: { $in: invoiceIds } })
        .toArray();
      for (const inv of fullInvoices) {
        for (const [k, v] of Object.entries(inv)) {
          if (/FilePath$/.test(k) && typeof v === 'string' && v) {
            filesToRemove.push(v);
          }
        }
      }

      const creditNotes = await this.col('crm_credit_notes')
        .find(
          { tenantId: s.tenantId, invoiceId: { $in: invoiceIds } },
          { projection: { _id: 1, ref: 1 } },
        )
        .toArray();
      const bankTx = await this.col('crm_bank_transactions')
        .find(
          {
            tenantId: s.tenantId,
            linkType: 'Invoice',
            linkId: { $in: invoiceIds },
          },
          { projection: { _id: 1 } },
        )
        .toArray();
      const bankTxIds = bankTx.map((b) => b._id);
      const creditNoteIds = creditNotes.map((c) => c._id);
      const creditNoteRefs = creditNotes.map((c) => String(c.ref));

      removed.glEntries = (
        await this.col('crm_gl_entries').deleteMany({
          tenantId: s.tenantId,
          sourceId: { $in: [...invoiceIds, ...bankTxIds, ...creditNoteIds] },
        })
      ).deletedCount;
      removed.bankTransactions = (
        await this.col('crm_bank_transactions').deleteMany({
          _id: { $in: bankTxIds },
        })
      ).deletedCount;
      removed.whtCertificates = (
        await this.col('crm_wht_certificates').deleteMany({
          tenantId: s.tenantId,
          sourceId: { $in: invoiceIds },
        })
      ).deletedCount;
      removed.payments = (
        await this.col('crm_payments').deleteMany({
          tenantId: s.tenantId,
          invoiceId: { $in: invoiceIds },
        })
      ).deletedCount;
      removed.creditNotes = (
        await this.col('crm_credit_notes').deleteMany({
          tenantId: s.tenantId,
          invoiceId: { $in: invoiceIds },
        })
      ).deletedCount;
      removed.paymentPlans = (
        await this.col('crm_payment_plans').deleteMany({
          tenantId: s.tenantId,
          invoiceId: { $in: invoiceIds },
        })
      ).deletedCount;

      // Time entries are deleted below; write-offs are matched on the
      // reference string they carry (invoice ref, credit-note ref or a
      // time-entry id).
      const timeEntryIds = (
        await this.col('crm_time_entries')
          .find(s, { projection: { _id: 1 } })
          .toArray()
      ).map((t) => String(t._id));
      removed.writeOffs = (
        await this.col('crm_write_offs').deleteMany({
          tenantId: s.tenantId,
          reference: {
            $in: [...invoiceRefs, ...creditNoteRefs, ...timeEntryIds],
          },
        })
      ).deletedCount;

      // Expense claims that were billed on these invoices keep existing
      // (they're real company costs) but no longer point at them.
      await this.col('crm_expense_claims').updateMany(
        { tenantId: s.tenantId, invoiceId: { $in: invoiceIds } },
        { $set: { invoiceId: null } },
      );

      removed.invoices = (
        await this.col('crm_invoices').deleteMany({
          _id: { $in: invoiceIds },
        })
      ).deletedCount;
    } else {
      removed.invoices = 0;
    }

    // 2. Documents' files on disk, then the rows.
    const docs = await this.col('crm_mandate_documents')
      .find(s, { projection: { fileUrl: 1 } })
      .toArray();
    docs.forEach((d) => d.fileUrl && filesToRemove.push(String(d.fileUrl)));

    // 3. Everything else that belongs to the mandate.
    for (const o of OWNED_BY_MANDATE) {
      removed[o.label] = (
        await this.col(o.collection).deleteMany(s)
      ).deletedCount;
    }

    // 4. Detach records that must survive the mandate.
    const detached: Record<string, number> = {};
    for (const u of UNLINK_FROM_MANDATE) {
      detached[u.label] = (
        await this.col(u.collection).updateMany(s, { $set: u.set })
      ).modifiedCount;
    }
    await this.col('crm_tickets').updateMany(
      { tenantId: s.tenantId, convertedToMandateId: s.mandateId },
      { $set: { convertedToMandateId: null } },
    );

    // 5. The mandate itself.
    await this.col('crm_mandates').deleteOne({
      _id: s.mandateId,
      tenantId: s.tenantId,
    });

    filesToRemove.forEach((f) => this.removeFile(f));
    this.logger.log(
      `Mandate ${mandateId} deleted for tenant ${tenantId}: ${JSON.stringify(removed)}`,
    );
    return { deleted: true, removed, detached };
  }

  private removeFile(stored: string) {
    try {
      let rel = stored;
      const i = rel.indexOf('/uploads/');
      if (i >= 0) rel = rel.slice(i + '/uploads/'.length);
      const full = fs.existsSync(rel)
        ? rel
        : join(process.cwd(), 'uploads', rel);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch (err) {
      this.logger.warn(`Could not remove file ${stored}: ${String(err)}`);
    }
  }
}
