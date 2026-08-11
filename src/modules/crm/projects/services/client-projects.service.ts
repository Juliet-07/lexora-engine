import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Mandate, MandateDocument_, MessageDirection } from '../schemas';
import { MandateWorkspaceService } from './mandate-workspace.service';
import { CreateMessageDto } from '../dtos';

// Simpler than the employee case: Mandate.clientUserId already IS
// the client's own real User id directly (that's exactly what
// ClientSelect captures at mandate creation) — no Employee-style
// indirection to resolve first.
@Injectable()
export class ClientProjectsService {
  constructor(
    @InjectModel(Mandate.name)
    private readonly mandateModel: Model<MandateDocument_>,
    private readonly workspaceService: MandateWorkspaceService,
  ) {}

  private normalizeMandate(m: any) {
    return {
      ...m,
      description: m.description ?? '',
      milestones: m.milestones ?? [],
    };
  }

  async getMyProjects(tenantId: string, clientUserId: string) {
    const rows = await this.mandateModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        clientUserId: new Types.ObjectId(clientUserId),
      })
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((m) => this.normalizeMandate(m));
  }

  // The authorization check here is simply "is this mandate's client
  // genuinely you" — matched directly, no team/task ambiguity like
  // the employee side has.
  private async getAuthorizedMandate(
    tenantId: string,
    clientUserId: string,
    mandateId: string,
  ) {
    const mandate = await this.mandateModel
      .findOne({
        _id: mandateId,
        tenantId: new Types.ObjectId(tenantId),
        clientUserId: new Types.ObjectId(clientUserId),
      })
      .lean();
    if (!mandate) throw new NotFoundException('Project not found');
    return mandate;
  }

  async getProjectDetail(
    tenantId: string,
    clientUserId: string,
    mandateId: string,
  ) {
    const mandate = await this.getAuthorizedMandate(
      tenantId,
      clientUserId,
      mandateId,
    );
    return this.normalizeMandate(mandate);
  }

  // Reuses the exact same thread the tenant's Communications tab
  // reads — this is the other end of that same conversation, not a
  // separate one.
  async getMessages(tenantId: string, clientUserId: string, mandateId: string) {
    await this.getAuthorizedMandate(tenantId, clientUserId, mandateId);
    return this.workspaceService.getMessages(tenantId, mandateId);
  }

  async sendMessage(
    tenantId: string,
    clientUserId: string,
    mandateId: string,
    dto: CreateMessageDto,
  ) {
    await this.getAuthorizedMandate(tenantId, clientUserId, mandateId);
    return this.workspaceService.addMessage(
      tenantId,
      mandateId,
      MessageDirection.CLIENT,
      dto,
    );
  }

  // Same documents the tenant sees — a client-uploaded file is
  // exactly what shows up in the tenant's "received from client"
  // inbox, not a separate store.
  async getDocuments(
    tenantId: string,
    clientUserId: string,
    mandateId: string,
  ) {
    await this.getAuthorizedMandate(tenantId, clientUserId, mandateId);
    return this.workspaceService.getDocuments(tenantId, mandateId);
  }

  async uploadDocument(
    tenantId: string,
    clientUserId: string,
    mandateId: string,
    folder: string,
    uploadedBy: string,
    file: Express.Multer.File,
  ) {
    await this.getAuthorizedMandate(tenantId, clientUserId, mandateId);
    return this.workspaceService.uploadDocument(
      tenantId,
      mandateId,
      folder,
      uploadedBy,
      file,
      true,
    );
  }
}
