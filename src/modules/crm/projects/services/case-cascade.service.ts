import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import * as fs from 'fs';
import { join } from 'path';

export type CaseKind = 'adr' | 'litigation';

const CONFIG: Record<
  CaseKind,
  {
    caseCollection: string;
    timeField: 'adrCaseId' | 'litigationCaseId';
    // Collections keyed by `caseId` whose rows exist only because of the case.
    owned: { label: string; collection: string; hasFile?: boolean }[];
    // The other kind of case that can point back at this one.
    escalationLink: {
      collection: string;
      field: string;
      label: string;
      selfField: string;
    };
  }
> = {
  adr: {
    caseCollection: 'crm_adr_cases',
    timeField: 'adrCaseId',
    owned: [
      { label: 'messages', collection: 'adr_case_messages' },
      { label: 'drafts', collection: 'adr_case_drafts' },
      {
        label: 'documents',
        collection: 'adr_case_documents',
        hasFile: true,
      },
      { label: 'deadlineRules', collection: 'adr_deadline_rules' },
      { label: 'outcomes', collection: 'crm_case_outcomes' },
    ],
    escalationLink: {
      collection: 'crm_litigation_cases',
      field: 'adrCaseId',
      label: 'escalatedLitigationCases',
      selfField: 'litigationCaseId',
    },
  },
  litigation: {
    caseCollection: 'crm_litigation_cases',
    timeField: 'litigationCaseId',
    owned: [
      { label: 'messages', collection: 'litigation_case_messages' },
      { label: 'drafts', collection: 'litigation_case_drafts' },
      {
        label: 'documents',
        collection: 'litigation_case_documents',
        hasFile: true,
      },
      { label: 'deadlineRules', collection: 'litigation_deadline_rules' },
      { label: 'outcomes', collection: 'crm_case_outcomes' },
    ],
    escalationLink: {
      collection: 'crm_adr_cases',
      field: 'litigationCaseId',
      label: 'originatingAdrCases',
      selfField: 'adrCaseId',
    },
  },
};

/**
 * Deletes an ADR or litigation case together with everything that hangs off
 * it — its messages, drafts, filed documents (and the files on disk),
 * deadline rules and the time logged against it — so nothing is left
 * pointing at a case that no longer exists.
 *
 * Embedded data (parties, sessions, pleadings, timeline, disbursements,
 * checklist, closure…) lives inside the case document and goes with it.
 *
 * Works on collections by name, like MandateCascadeService, to avoid
 * circular module imports.
 */
@Injectable()
export class CaseCascadeService {
  private readonly logger = new Logger(CaseCascadeService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  private col(name: string) {
    return this.connection.collection(name);
  }

  private async load(kind: CaseKind, tenantId: string, caseId: string) {
    const cfg = CONFIG[kind];
    if (!Types.ObjectId.isValid(caseId)) {
      throw new NotFoundException('Case not found');
    }
    const t = new Types.ObjectId(tenantId);
    const id = new Types.ObjectId(caseId);
    const c = await this.col(cfg.caseCollection).findOne({
      _id: id,
      tenantId: t,
    });
    if (!c) throw new NotFoundException('Case not found');
    return { cfg, t, id, c };
  }

  /** What deleting would remove — shown to the tenant before they confirm. */
  async impact(kind: CaseKind, tenantId: string, caseId: string) {
    const { cfg, t, id, c } = await this.load(kind, tenantId, caseId);
    const scope = { tenantId: t, caseId: id };

    const willDelete: Record<string, number> = {};
    for (const o of cfg.owned) {
      willDelete[o.label] = await this.col(o.collection).countDocuments(scope);
    }
    const timeScope = { tenantId: t, [cfg.timeField]: id };
    const entries = await this.col('crm_time_entries')
      .find(timeScope, { projection: { wipBillingStatus: 1 } })
      .toArray();
    const invoiced = entries.filter((e) => e.wipBillingStatus === 'Invoiced');
    willDelete.timeEntries = entries.length - invoiced.length;
    willDelete.disbursements = Array.isArray(c.disbursements)
      ? c.disbursements.length
      : 0;

    const willDetach: Record<string, number> = {
      invoicedTimeEntries: invoiced.length,
      [cfg.escalationLink.label]: await this.col(
        cfg.escalationLink.collection,
      ).countDocuments({ tenantId: t, [cfg.escalationLink.field]: id }),
    };
    return { ref: c.ref, title: c.title, willDelete, willDetach };
  }

  /** Delete the case and everything tied to it. */
  async purge(kind: CaseKind, tenantId: string, caseId: string) {
    const { cfg, t, id } = await this.load(kind, tenantId, caseId);
    const scope = { tenantId: t, caseId: id };
    const filesToRemove: string[] = [];
    const removed: Record<string, number> = {};

    // Filed documents: collect file paths first, then drop the rows.
    for (const o of cfg.owned) {
      if (o.hasFile) {
        const docs = await this.col(o.collection)
          .find(scope, { projection: { fileUrl: 1 } })
          .toArray();
        docs.forEach((d) => d.fileUrl && filesToRemove.push(String(d.fileUrl)));
      }
    }

    // Time logged on the case. Entries already billed on an issued invoice
    // stay (the invoice's lines still point at them) but are detached.
    const timeScope = { tenantId: t, [cfg.timeField]: id };
    const entries = await this.col('crm_time_entries')
      .find(timeScope, { projection: { wipBillingStatus: 1 } })
      .toArray();
    const deletable = entries
      .filter((e) => e.wipBillingStatus !== 'Invoiced')
      .map((e) => e._id);
    if (deletable.length) {
      await this.col('crm_write_offs').deleteMany({
        tenantId: t,
        reference: { $in: deletable.map(String) },
      });
      removed.timeEntries = (
        await this.col('crm_time_entries').deleteMany({
          _id: { $in: deletable },
        })
      ).deletedCount;
    } else {
      removed.timeEntries = 0;
    }
    const detached: Record<string, number> = {
      invoicedTimeEntries: (
        await this.col('crm_time_entries').updateMany(timeScope, {
          $set: { [cfg.timeField]: null },
        })
      ).modifiedCount,
    };

    for (const o of cfg.owned) {
      removed[o.label] = (
        await this.col(o.collection).deleteMany(scope)
      ).deletedCount;
    }

    // The other side of an ADR → litigation escalation survives, un-linked.
    detached[cfg.escalationLink.label] = (
      await this.col(cfg.escalationLink.collection).updateMany(
        { tenantId: t, [cfg.escalationLink.field]: id },
        { $set: { [cfg.escalationLink.field]: null } },
      )
    ).modifiedCount;

    // The case itself last, so a failed run can simply be retried.
    await this.col(cfg.caseCollection).deleteOne({ _id: id, tenantId: t });

    filesToRemove.forEach((f) => this.removeFile(f));
    this.logger.log(
      `${kind} case ${caseId} deleted for tenant ${tenantId}: ${JSON.stringify(removed)}`,
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
