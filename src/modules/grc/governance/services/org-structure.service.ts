import {
  Injectable,
  BadRequestException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OrgStructureNode,
  OrgStructureNodeDocument,
} from '../schemas/org-structure-node.schema';
import {
  CreateOrgStructureNodeDto,
  UpdateOrgStructureNodeDto,
} from '../dtos/org-structure.dto';

export interface OrgStructureTreeNode {
  id: string;
  type: string;
  name: string;
  subtitle: string | null;
  parentIds: string[];
  // Which parent this particular occurrence in the chart is rendered
  // under — null at the top level. A node connected to more than one
  // parent (Oct 2026: "one thing can be connected to 2 things")
  // appears once per parent, each with its own contextParentId, so
  // the builder's move left/right action can act on the right
  // sibling group for that occurrence.
  contextParentId: string | null;
  order: number;
  children: OrgStructureTreeNode[];
}

// Governance → Organisation Structure (Oct 2026 rework) — see the
// schema comment for why this moved from an HR-Employee-derived,
// read-only chart to a freeform structure the tenant builds and edits
// directly here. No node is ever fabricated or auto-populated from
// another module; every node on the chart is one the tenant explicitly
// created.
//
// Oct 2026: the "reports to / sits under" field was extended from a
// single parent to a set of parents, so one node can connect to more
// than one thing on the chart at once. A "tree" is therefore really a
// DAG now; getTree renders a node once under each of its parents
// rather than trying to force it into one position.
@Injectable()
export class OrgStructureService implements OnModuleInit {
  constructor(
    @InjectModel(OrgStructureNode.name)
    private readonly model: Model<OrgStructureNodeDocument>,
  ) {}

  // One-time, idempotent backfill from the old single-parent field
  // (parentId) to the new parentIds array — safe to run on every
  // boot, since the $exists guard means it only ever touches
  // documents that haven't been migrated yet. Plain per-document
  // updates rather than an aggregation-pipeline update (`updateMany`
  // with a `[...]` update) — that form needs `{ updatePipeline: true
  // }` on some Mongoose versions and throws without it, so this is
  // the version-safe way to do a conditional field rename.
  async onModuleInit() {
    const legacyNodes = await this.model
      .find({ parentIds: { $exists: false } })
      .select('parentId')
      .lean();
    if (!legacyNodes.length) return;

    await Promise.all(
      legacyNodes.map((n) =>
        this.model.updateOne(
          { _id: n._id },
          {
            $set: {
              parentIds: (n as any).parentId ? [(n as any).parentId] : [],
            },
          },
        ),
      ),
    );
  }

  async getTree(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const nodes = await this.model
      .find({ tenantId: tId })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const byParent = new Map<string, typeof nodes>();
    for (const n of nodes) {
      const keys = n.parentIds?.length
        ? n.parentIds.map((p) => p.toString())
        : ['root'];
      for (const key of keys) {
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(n);
      }
    }

    const build = (
      n: (typeof nodes)[number],
      contextParentId: string | null,
      ancestry: Set<string>,
    ): OrgStructureTreeNode => {
      const id = (n._id as any).toString();
      // Cycle guard for rendering only — create/update already refuse
      // to form one; this just stops a runaway recursion if a cycle
      // ever slips through some other way (e.g. data edited directly
      // in the database).
      const nextAncestry = new Set(ancestry).add(id);
      const kids = ancestry.has(id)
        ? []
        : (byParent.get(id) ?? []).map((k) => build(k, id, nextAncestry));
      return {
        id,
        type: n.type,
        name: n.name,
        subtitle: n.subtitle ?? null,
        parentIds: (n.parentIds ?? []).map((p) => p.toString()),
        contextParentId,
        order: n.order,
        children: kids,
      };
    };

    const roots = (byParent.get('root') ?? []).map((n) =>
      build(n, null, new Set()),
    );
    const typeCounts: Record<string, number> = {};
    for (const n of nodes) {
      typeCounts[n.type] = (typeCounts[n.type] ?? 0) + 1;
    }

    return {
      stats: {
        totalNodes: nodes.length,
        ...typeCounts,
      },
      roots,
    };
  }

  async create(tenantId: string, dto: CreateOrgStructureNodeDto) {
    const tId = new Types.ObjectId(tenantId);

    let parentIds: Types.ObjectId[] = [];
    if (dto.parentIds?.length) {
      const uniqueIds = [...new Set(dto.parentIds)];
      const parents = await this.model
        .find({ _id: { $in: uniqueIds }, tenantId: tId })
        .select('_id')
        .lean();
      if (parents.length !== uniqueIds.length) {
        throw new NotFoundException('One or more parent nodes were not found');
      }
      parentIds = parents.map((p) => p._id as any);
    }

    // Order is scoped to the first parent group (or root) — the
    // common case of a single parent keeps exactly the old ordering
    // behaviour; a node created under multiple parents at once just
    // inherits that same position in every group it's shown in.
    const order = await this.model.countDocuments({
      tenantId: tId,
      parentIds: parentIds[0] ?? { $size: 0 },
    });

    return this.model.create({
      tenantId: tId,
      type: dto.type,
      name: dto.name,
      subtitle: dto.subtitle ?? null,
      parentIds,
      order,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateOrgStructureNodeDto) {
    const tId = new Types.ObjectId(tenantId);
    const node = await this.model.findOne({ _id: id, tenantId: tId });
    if (!node) throw new NotFoundException('Node not found');

    if (dto.type !== undefined) node.type = dto.type as any;
    if (dto.name !== undefined) node.name = dto.name;
    if (dto.subtitle !== undefined) node.subtitle = dto.subtitle;

    if (dto.parentIds !== undefined) {
      const newParentIds = [...new Set(dto.parentIds ?? [])];

      if (newParentIds.includes(id)) {
        throw new BadRequestException('A node cannot report to itself.');
      }

      if (newParentIds.length) {
        const parents = await this.model
          .find({ _id: { $in: newParentIds }, tenantId: tId })
          .select('parentIds')
          .lean();
        if (parents.length !== newParentIds.length) {
          throw new NotFoundException(
            'One or more parent nodes were not found',
          );
        }

        // Cycle guard: walk up through every ancestor chain of every
        // proposed parent — if this node turns up anywhere above
        // itself, the move would nest it under its own descendant.
        // More than one proposed parent means more than one chain to
        // walk, so this is a breadth-first walk over the whole
        // ancestor set rather than a single linear walk up one chain.
        const toVisit = parents.flatMap((p) =>
          (p.parentIds ?? []).map((pid) => pid.toString()),
        );
        const visited = new Set<string>();
        while (toVisit.length) {
          const cursor = toVisit.pop()!;
          if (cursor === id) {
            throw new BadRequestException(
              "Can't move a node under one of its own descendants.",
            );
          }
          if (visited.has(cursor)) continue;
          visited.add(cursor);
          const next = await this.model
            .findOne({ _id: cursor, tenantId: tId })
            .select('parentIds')
            .lean();
          for (const pid of next?.parentIds ?? []) {
            toVisit.push(pid.toString());
          }
        }
      }

      node.parentIds = newParentIds.map((p) => new Types.ObjectId(p)) as any;
      node.order = await this.model.countDocuments({
        tenantId: tId,
        parentIds: newParentIds.length
          ? new Types.ObjectId(newParentIds[0])
          : { $size: 0 },
        _id: { $ne: node._id },
      });
    }

    await node.save();
    return node;
  }

  async move(
    tenantId: string,
    id: string,
    direction: 'up' | 'down',
    contextParentId?: string | null,
  ) {
    const tId = new Types.ObjectId(tenantId);
    const node = await this.model.findOne({ _id: id, tenantId: tId });
    if (!node) throw new NotFoundException('Node not found');

    // Which occurrence's sibling group to reorder within — defaults
    // to the node's own first parent (or root) when the caller
    // doesn't say, which keeps single-parent nodes working exactly as
    // before.
    const groupParentId =
      contextParentId !== undefined
        ? contextParentId
        : (node.parentIds?.[0]?.toString() ?? null);

    const siblings = await this.model
      .find({
        tenantId: tId,
        parentIds: groupParentId
          ? new Types.ObjectId(groupParentId)
          : { $size: 0 },
      })
      .sort({ order: 1, createdAt: 1 });
    const idx = siblings.findIndex((s) => (s._id as any).toString() === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= siblings.length) {
      return node; // already at that end — nothing to do
    }

    const other = siblings[swapIdx];
    const tmp = node.order;
    node.order = other.order;
    other.order = tmp;
    await Promise.all([node.save(), other.save()]);
    return node;
  }

  async remove(tenantId: string, id: string, cascade: boolean) {
    const tId = new Types.ObjectId(tenantId);
    const node = await this.model.findOne({ _id: id, tenantId: tId });
    if (!node) throw new NotFoundException('Node not found');

    const childCount = await this.model.countDocuments({
      tenantId: tId,
      parentIds: node._id,
    });

    if (childCount > 0 && !cascade) {
      throw new BadRequestException(
        `This node has ${childCount} node${childCount === 1 ? '' : 's'} nested under it. Pass cascade to remove them too, or move/delete them first.`,
      );
    }

    // Detach this node as a parent everywhere — a child that still
    // has another, surviving parent (sits under 2+ things, Oct 2026)
    // stays on the chart under that other parent rather than being
    // removed along with this one.
    await this.model.updateMany(
      { tenantId: tId, parentIds: node._id },
      { $pull: { parentIds: node._id } },
    );

    let deletedCount = 1;
    if (cascade && childCount > 0) {
      // Repeatedly delete whichever nodes are left with zero parents
      // and weren't already a root before this removal started — i.e.
      // nodes that were only reachable through the node(s) just
      // removed. Re-reads the database each pass rather than
      // reasoning about it from a stale snapshot, since detaching one
      // newly-orphaned node can itself orphan another one level down.
      const preexistingRoots = await this.model
        .find({ tenantId: tId, parentIds: { $size: 0 } })
        .select('_id')
        .lean();
      const originalRootIds = new Set(
        preexistingRoots.map((r) => (r._id as any).toString()),
      );

      for (;;) {
        const candidates = await this.model
          .find({ tenantId: tId, parentIds: { $size: 0 } })
          .select('_id')
          .lean();
        const newlyOrphaned = candidates.filter(
          (c) => !originalRootIds.has((c._id as any).toString()),
        );
        if (!newlyOrphaned.length) break;

        const ids = newlyOrphaned.map((o) => o._id as any);
        // Detach these before deleting them too, so whatever they
        // were parents of is correctly re-evaluated next pass.
        await this.model.updateMany(
          { tenantId: tId, parentIds: { $in: ids } },
          { $pullAll: { parentIds: ids } },
        );
        await this.model.deleteMany({ _id: { $in: ids } });
        deletedCount += ids.length;
      }
    }

    await this.model.deleteOne({ _id: node._id });
    return { success: true, deleted: deletedCount };
  }
}
