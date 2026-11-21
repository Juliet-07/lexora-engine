import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import { FinanceSettingsService } from '../services/finance-settings.service';
import { FinanceSettingsPreviewService } from '../services/finance-settings-preview.service';
import { SetBaseCurrencyDto } from '../dtos/finance.dto';

const logoUpload = {
  storage: memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
};

// Finance Settings are the account owner's: they change what every
// document looks like and how the finance module behaves.
@ApiTags('CRM — Finance — Settings')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM, PlatformModuleKey.FINANCE)
@Controller('finance/settings')
export class FinanceSettingsController {
  constructor(
    private readonly service: FinanceSettingsService,
    private readonly previews: FinanceSettingsPreviewService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  private async actor(userId: string) {
    const u: any = await this.userModel
      .findById(userId)
      .select('firstName lastName tenantProfile.businessName')
      .lean();
    return {
      id: userId,
      name:
        [u?.firstName, u?.lastName].filter(Boolean).join(' ') ||
        u?.tenantProfile?.businessName ||
        'Account owner',
    };
  }

  @Get()
  @ApiOperation({ summary: 'All finance settings, merged over the defaults' })
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getAll(t || u);
  }

  @Get('log')
  @ApiOperation({ summary: 'The settings change log' })
  log(
    @Query('section') section: string | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.getLog(t || u, section);
  }

  @Post('branding/logo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', logoUpload))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload the logo used on every document' })
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setLogo(t || u, file, await this.actor(u));
  }

  @Delete('branding/logo')
  @ApiOperation({ summary: 'Remove the uploaded logo' })
  async removeLogo(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.removeLogo(t || u, await this.actor(u));
  }

  @Get('branding/preview/:kind')
  @ApiOperation({
    summary:
      'A sample PDF (invoice, receipt, quote, purchase-order, payslip) drawn with the saved branding',
  })
  async preview(
    @Param('kind') kind: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @Res() res: Response,
  ) {
    const buffer = await this.previews.build(t || u, kind);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="sample-${kind}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Post(':section/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset one section to its defaults' })
  async reset(
    @Param('section') section: string,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.resetSection(t || u, section, await this.actor(u));
  }

  // Declared before ':section' so it is not read as a section name.
  @Put('base-currency')
  @ApiOperation({
    summary:
      'Change the account base currency — restates the ledger and budgets into it',
  })
  async setBaseCurrency(
    @Body() body: SetBaseCurrencyDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.setBaseCurrency(
      t || u,
      body.baseCurrency,
      await this.actor(u),
    );
  }

  @Put(':section')
  @ApiOperation({
    summary:
      'Save one section (general, tax, invoicing, approvals, banking, branding) — send only what changed',
  })
  async update(
    @Param('section') section: string,
    @Body() body: Record<string, any>,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    if (!body || typeof body !== 'object')
      throw new BadRequestException(
        'Send the settings to change as an object.',
      );
    return this.service.updateSection(
      t || u,
      section,
      body,
      await this.actor(u),
    );
  }
}
