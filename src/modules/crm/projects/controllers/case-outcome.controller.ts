import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CaseOutcomeService } from '../services';
import {
  OutcomeShareDto,
  SaveCaseOutcomeDto,
  SetOutcomePaymentPaidDto,
} from '../dtos';
import { OutcomeCaseKind } from '../schemas';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

// The same endpoints serve both kinds of case. ADR cases record a
// settlement or an award; litigation cases a consent judgment or a
// judgment. The case kind comes from the URL.
const kindOf = (req: Request): OutcomeCaseKind =>
  req.path.includes('/litigation-cases/') ? 'litigation' : 'adr';

const adr = (p = '') => `crm/adr-cases/:id/outcomes${p}`;
const lit = (p = '') => `crm/litigation-cases/:id/outcomes${p}`;
const both = (p = '') => [adr(p), lit(p)];

@ApiTags('CRM — Projects — Case outcomes (Tenant)')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller()
export class CaseOutcomeController {
  constructor(private readonly service: CaseOutcomeService) {}

  @Get(both())
  @ApiOperation({
    summary:
      'Every settlement / award / consent judgment / judgment recorded on a case, with sharing options',
  })
  list(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.list(kindOf(req), t || u, id);
  }

  @Put(both('/:slug'))
  @ApiOperation({ summary: 'Save a draft or record the outcome' })
  save(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('slug') slug: string,
    @Body() dto: SaveCaseOutcomeDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.save(kindOf(req), t || u, u, id, slug, dto);
  }

  @Delete(both('/:slug'))
  @ApiOperation({ summary: 'Discard a draft' })
  deleteDraft(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('slug') slug: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.deleteDraft(kindOf(req), t || u, id, slug);
  }

  @Patch(both('/:slug/payments/:index'))
  @ApiOperation({ summary: 'Mark one payment of the schedule paid or pending' })
  setPaymentPaid(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('slug') slug: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() dto: SetOutcomePaymentPaidDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setPaymentPaid(
      kindOf(req),
      t || u,
      id,
      slug,
      index,
      dto.paid,
    );
  }

  @Post(both('/:slug/generate-document'))
  @ApiOperation({
    summary:
      'Generate the draft settlement agreement / consent order from the form and file it in Documents',
  })
  generateDocument(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('slug') slug: string,
    @Body() body: { form: Record<string, any> },
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.generateDocument(
      kindOf(req),
      t || u,
      u,
      id,
      slug,
      body?.form ?? {},
    );
  }

  @Post(both('/:slug/share'))
  @ApiOperation({
    summary: 'Email, publish to the client portal or log filing',
  })
  share(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('slug') slug: string,
    @Body() dto: OutcomeShareDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.share(kindOf(req), t || u, u, id, slug, dto);
  }

  @Get(both('/:slug/pdf'))
  @ApiOperation({ summary: 'The recorded outcome as a PDF' })
  async pdf(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('slug') slug: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.service.recordPdf(
      kindOf(req),
      t || u,
      id,
      slug,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }
}
