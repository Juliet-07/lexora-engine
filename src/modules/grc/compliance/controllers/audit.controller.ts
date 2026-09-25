import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Res,
  UseInterceptors,
  UploadedFiles,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Response } from 'express';
import { AuditService } from '../services';
import {
  CreateAuditDto,
  SetAuditStatusDto,
  AddFolderDto,
  AddRequestDto,
  DisputeRequestDto,
  ResolveRequestDto,
  AddFindingDto,
  UpdateFindingDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  Employee,
  EmployeeDocument,
} from 'src/modules/hr/schemas/employee.schema';

const auditRequestStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const p = join(process.cwd(), 'uploads', 'grc', 'audits');
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

@ApiTags('GRC — Compliance')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/compliance/audits')
export class AuditController {
  constructor(
    private readonly service: AuditService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  private async currentUserName(userId: string): Promise<string> {
    const me = await this.userModel
      .findById(userId)
      .select('firstName lastName')
      .lean();
    return `${me?.firstName ?? ''} ${me?.lastName ?? ''}`.trim();
  }

  /** Resolve the logged-in employee record for the "my requests" portal
   * — same userId lookup convention used everywhere else an
   * employee-facing endpoint needs to know which Employee it's acting
   * as (see leave.service.ts, employee-onboarding.service.ts, etc). */
  private async currentEmployeeId(userId: string): Promise<string> {
    const emp = await this.employeeModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .select('_id')
      .lean();
    if (!emp)
      throw new NotFoundException('No employee record for this account.');
    return emp._id.toString();
  }

  @Post()
  create(
    @Body() dto: CreateAuditDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  // ── Employee-facing document-request portal ──────────────────
  // Registered ahead of the /:id routes below so "my" is never
  // captured as an :id param.
  @Get('my/requests')
  async getMyRequests(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const employeeId = await this.currentEmployeeId(u);
    return this.service.getMyRequests(t || u, employeeId);
  }

  @Post('my/requests/:requestId/files')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: auditRequestStorage,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async submitMyRequestFiles(
    @Param('requestId') requestId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const employeeId = await this.currentEmployeeId(u);
    const name = await this.currentUserName(u);
    return this.service.submitRequestFiles(
      t || u,
      requestId,
      employeeId,
      files,
      name,
    );
  }

  @Post('my/requests/:requestId/dispute')
  async disputeMyRequest(
    @Param('requestId') requestId: string,
    @Body() dto: DisputeRequestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const employeeId = await this.currentEmployeeId(u);
    return this.service.disputeRequest(t || u, requestId, employeeId, dto);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetAuditStatusDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setStatus(t || u, id, dto);
  }

  // ── Document requests — tenant/auditor side ───────────────────
  @Post(':id/folders')
  addFolder(
    @Param('id') id: string,
    @Body() dto: AddFolderDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addFolder(t || u, id, dto);
  }

  @Delete(':id/folders/:folderId')
  removeFolder(
    @Param('id') id: string,
    @Param('folderId') folderId: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.removeFolder(t || u, id, folderId);
  }

  @Post(':id/requests')
  addRequest(
    @Param('id') id: string,
    @Body() dto: AddRequestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addRequest(t || u, id, dto);
  }

  @Patch(':id/requests/:requestId/resolve')
  async resolveRequest(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body() dto: ResolveRequestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const name = await this.currentUserName(u);
    return this.service.resolveRequest(t || u, id, requestId, name, dto);
  }

  @Get(':id/requests/zip')
  async downloadRequestsZip(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.service.buildRequestsZip(
      t || u,
      id,
    );
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Post(':id/findings')
  addFinding(
    @Param('id') id: string,
    @Body() dto: AddFindingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.addFinding(t || u, id, dto);
  }

  @Patch(':id/findings/:index')
  updateFinding(
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() dto: UpdateFindingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateFinding(t || u, id, Number(index), dto);
  }
}
