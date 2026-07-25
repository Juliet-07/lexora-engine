import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { VendorService } from '../services';
import {
  CreateVendorDto,
  UpdateVendorRatingDto,
  TerminateVendorDto,
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
@Controller('grc/risk/vendors')
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  @Post()
  create(
    @Body() dto: CreateVendorDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.vendorService.create(t || u, dto);
  }

  @Get()
  getAll(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.vendorService.getAll(t || u);
  }

  @Patch(':id/rating')
  updateRating(
    @Param('id') id: string,
    @Body() dto: UpdateVendorRatingDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.vendorService.updateRating(t || u, id, dto);
  }

  @Post(':id/terminate')
  terminate(
    @Param('id') id: string,
    @Body() dto: TerminateVendorDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.vendorService.terminate(t || u, id, dto);
  }
}
