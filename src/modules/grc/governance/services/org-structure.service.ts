import {
  Injectable,
  BadRequestException,
  NotFoundException,
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
  parentId: string | null;
  order: number;
  children: OrgStructureTreeNode[];
}

// Governance → Organisation Structure (Oct 2026 rework) — see the
// schema comment for why this moved from an HR-Employee-derived,
// read-only chart to a freeform structure the tenant builds and edits
// directly here. No node is ever fabricated or auto-populated from
// another module; every node on the chart is one the tenant explicitly
// created.
@Injectable()
export class OrgStructureService {
  constructor(
    @InjectModel(OrgStructureNode.name)
    private readonly model: Model<OrgStructureNodeDocument>,
  ) {}

  async getTree(tenantId: string) {
    const tId = new Types.ObjectId(tenantId);
    const nodes = await this.model
      .find({ tenantId: tId })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const byParent = new Map<string, typeof nodes>();
    for (const n of nodes) {
      const key = n.parentId ? n.parentId.toString() : 'root';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(n);
    }

    const build = (n: (typeof nodes)[number]): OrgStructureTreeNode => {
      const id = (n._id as any).toString();
      const kids = (byParent.get(id) ?? []).map(build);
      return {
        id,
        type: n.type,
        name: n.name,
        subtitle: n.subtitle ?? null,
        parentId: n.parentId ? n.parentId.toString() : null,
        order: n.order,
        children: kids,
      };
    };

    const roots = (byParent.get('root') ?? []).map(build);
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

    let parentId: Types.ObjectId | null = null;
    if (dto.parentId) {
      const parent = await this.model.findOne({
        _id: dto.parentId,
        tenantId: tId,
      });
      if (!parent) throw new NotFoundException('Parent node not found');
      parentId = parent._id as any;
    }

    const order = await this.model.countDocuments({
      tenantId: tId,
      parentId,
    });

    return this.model.create({
      tenantId: tId,
      type: dto.type,
      name: dto.name,
      subtitle: dto.subtitle ?? null,
      parentId,
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

    if (dto.parentId !== undefined) {
      const newParentId = dto.parentId
        ? new Types.ObjectId(dto.parentId)
        : null;

      if (newParentId) {
        if (newParentId.toString() === id) {
          throw new BadRequestException('A node cannot report to itself.');
        }
        const parent = await this.model.findOne({
          _id: newParentId,
          tenantId: tId,
        });
        if (!parent) throw new NotFoundException('Parent node not found');

        // Cycle guard: walk up from the proposed parent — if we reach
        // this node, the move would nest it under its own descendant.
        let cursor: Types.ObjectId | null = parent.parentId as any;
        while (cursor) {
          if (cursor.toString() === id) {
            throw new BadRequestException(
              "Can't move a node under one of its own descendants.",
            );
          }
          const next: { parentId: Types.ObjectId | null } | null =
            await this.model
              .findOne({ _id: cursor, tenantId: tId })
              .select('parentId')
              .lean();
          cursor = next?.parentId ?? null;
        }
      }

      node.parentId = newParentId as any;
      node.order = await this.model.countDocuments({
        tenantId: tId,
        parentId: newParentId,
        _id: { $ne: node._id },
      });
    }

    await node.save();
    return node;
  }

  async move(tenantId: string, id: string, direction: 'up' | 'down') {
    const tId = new Types.ObjectId(tenantId);
    const node = await this.model.findOne({ _id: id, tenantId: tId });
    if (!node) throw new NotFoundException('Node not found');

    const siblings = await this.model
      .find({ tenantId: tId, parentId: node.parentId })
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
      parentId: node._id,
    });

    if (childCount > 0 && !cascade) {
      throw new BadRequestException(
        `This node has ${childCount} node${childCount === 1 ? '' : 's'} nested under it. Pass cascade to remove them too, or move/delete them first.`,
      );
    }

    if (cascade && childCount > 0) {
      const toDelete: Types.ObjectId[] = [node._id as any];
      let frontier = [node._id as any];
      while (frontier.length) {
        const kids = await this.model
          .find({ tenantId: tId, parentId: { $in: frontier } })
          .select('_id')
          .lean();
        const kidIds = kids.map((k) => k._id as any);
        if (!kidIds.length) break;
        toDelete.push(...kidIds);
        frontier = kidIds;
      }
      await this.model.deleteMany({ _id: { $in: toDelete } });
      return { success: true, deleted: toDelete.length };
    }

    await this.model.deleteOne({ _id: node._id });
    return { success: true, deleted: 1 };
  }
}
