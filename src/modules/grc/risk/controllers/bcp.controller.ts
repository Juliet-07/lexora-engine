import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BcpService } from '../services';
import {
  CreateBcpPlanDto,
  CreateBcpTestDto,
  CompleteBcpTestDto,
  CreateRtoRpoDto,
  RecordRtoRpoActualDto,
  CreateCrisisContactDto,
  UpdateCrisisContactDto,
  CreateBiaProcessDto,
  CreateVendorResilienceDto,
  DeclareBcpIncidentDto,
  CreateBcpReportDto,
  CreateBcpTestFindingDto,
} from '../dtos';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

@ApiTags('GRC — Risk')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/risk/bcp')
export class BcpController {
  constructor(private readonly bcpService: BcpService) {}

  @Post('plans')
  createPlan(
    @Body() dto: CreateBcpPlanDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.createPlan(t || u, dto);
  }
  @Get('plans')
  getAllPlans(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.getAllPlans(t || u);
  }

  @Post('tests')
  createTest(
    @Body() dto: CreateBcpTestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.createTest(t || u, dto);
  }
  @Patch('tests/:id/complete')
  completeTest(
    @Param('id') id: string,
    @Body() dto: CompleteBcpTestDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.completeTest(t || u, id, dto);
  }
  @Get('tests')
  getAllTests(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.getAllTests(t || u);
  }

  @Post('findings')
  addFinding(
    @Body() dto: CreateBcpTestFindingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.addFinding(t || u, dto);
  }
  @Patch('findings/:id/resolve')
  resolveFinding(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.resolveFinding(t || u, id);
  }
  @Get('findings')
  getAllFindings(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.getAllFindings(t || u);
  }

  @Post('rto-rpo')
  createRtoRpo(
    @Body() dto: CreateRtoRpoDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.createRtoRpo(t || u, dto);
  }
  @Patch('rto-rpo/:id/actual')
  recordRtoRpoActual(
    @Param('id') id: string,
    @Body() dto: RecordRtoRpoActualDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.recordRtoRpoActual(t || u, id, dto);
  }
  @Get('rto-rpo')
  getAllRtoRpo(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.getAllRtoRpo(t || u);
  }

  @Post('crisis-contacts')
  createContact(
    @Body() dto: CreateCrisisContactDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.createContact(t || u, dto);
  }
  @Patch('crisis-contacts/:id')
  updateContact(
    @Param('id') id: string,
    @Body() dto: UpdateCrisisContactDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.updateContact(t || u, id, dto);
  }
  @Delete('crisis-contacts/:id')
  deleteContact(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.deleteContact(t || u, id);
  }
  @Get('crisis-contacts')
  getAllContacts(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.getAllContacts(t || u);
  }

  @Post('processes')
  createProcess(
    @Body() dto: CreateBiaProcessDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.createProcess(t || u, dto);
  }
  @Get('processes')
  getAllProcesses(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.getAllProcesses(t || u);
  }

  @Post('vendor-resilience')
  createVendorResilience(
    @Body() dto: CreateVendorResilienceDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.createVendorResilience(t || u, dto);
  }
  @Patch('vendor-resilience/:id/attest')
  markVendorResilienceAttested(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.markVendorResilienceAttested(t || u, id);
  }
  @Get('vendor-resilience')
  getAllVendorResilience(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.getAllVendorResilience(t || u);
  }

  @Post('incidents')
  declareIncident(
    @Body() dto: DeclareBcpIncidentDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.declareIncident(t || u, dto);
  }
  @Patch('incidents/:id/resolve')
  resolveIncident(
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.resolveIncident(t || u, id);
  }
  @Get('incidents')
  getAllIncidents(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.getAllIncidents(t || u);
  }

  @Post('reports')
  createReport(
    @Body() dto: CreateBcpReportDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.createReport(t || u, dto);
  }
  @Get('reports')
  getAllReports(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.bcpService.getAllReports(t || u);
  }
}
