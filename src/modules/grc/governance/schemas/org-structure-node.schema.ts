import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrgStructureNodeDocument = OrgStructureNode & Document;

export enum OrgStructureNodeType {
  SHAREHOLDER = 'Shareholder',
  BOARD = 'Board',
  DEPARTMENT = 'Department',
  ROLE = 'Role',
}

// Organisation Structure (Oct 2026 rework) — previously this chart was
// derived read-only from HR's own Employee records
// (reportsToManagerId/jobTitle/teamId), with no direct editing surface:
// the tenant had to go change individual employee records under HR to
// move anything, which the PO found unclear ("doesn't point the user
// to what to do"). Replaced with a freeform structure the tenant
// builds and arranges directly, node by node — shareholders, the
// board, departments, and roles, nested however the tenant's real
// structure actually works, not constrained to HR's reporting-line
// data or even to employees who exist as real records. `name` is
// always tenant-typed free text (not resolved from an Employee
// record), so the chart never depends on HR data existing or staying
// in sync, and a tenant can represent shareholders/board seats that
// have no HR employee record at all.
@Schema({ timestamps: true, collection: 'grc_org_structure_nodes' })
export class OrgStructureNode {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ enum: OrgStructureNodeType, required: true })
  type: OrgStructureNodeType;

  // A person's name, a department name, "Board of Directors", a
  // shareholder's name — whatever the tenant wants this box to say.
  @Prop({ required: true, trim: true })
  name: string;

  // Optional second line under the name — a role/title ("Chief
  // Marketing Officer"), an ownership stake ("35%"), or any other
  // freeform detail the tenant wants shown on the node.
  @Prop({ default: null })
  subtitle: string | null;

  // Self-referencing — null means a root of the chart (e.g.
  // "Shareholders" or "Board of Directors" with nothing above them).
  @Prop({
    type: Types.ObjectId,
    ref: 'OrgStructureNode',
    default: null,
    index: true,
  })
  parentId: Types.ObjectId | null;

  // Sibling display order under the same parent — set automatically on
  // create (appended last) and adjusted via the builder's move
  // up/down actions.
  @Prop({ default: 0 })
  order: number;
}

export const OrgStructureNodeSchema =
  SchemaFactory.createForClass(OrgStructureNode);
