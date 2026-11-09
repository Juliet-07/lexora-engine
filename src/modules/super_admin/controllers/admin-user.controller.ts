import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';
import { AdminUserService } from '../services/admin-user.service';
import { CreateAdminUserDto, UpdateAdminUserDto } from '../dtos/admin-user.dto';

// Users with access to the Super Admin app. Route access is super-admin only
// (UserTypes); the service additionally requires the caller to be the
// platform owner.
@ApiTags('SuperAdmin Users')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.SUPER_ADMIN)
@Controller('super-admin/admin-users')
export class AdminUserController {
  constructor(private readonly service: AdminUserService) {}

  @Get()
  @ApiOperation({ summary: 'List everyone with Super Admin app access' })
  list(@CurrentUser('sub') actorId: string) {
    return this.service.list(actorId);
  }

  @Post()
  @ApiOperation({
    summary: 'Add a user to the Super Admin app',
    description:
      'Creates the user with a temporary password and emails it to them.',
  })
  create(@CurrentUser('sub') actorId: string, @Body() dto: CreateAdminUserDto) {
    return this.service.create(actorId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Update a user's details or enable/disable them" })
  update(
    @CurrentUser('sub') actorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.service.update(actorId, id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email the user a new temporary password' })
  resetPassword(@CurrentUser('sub') actorId: string, @Param('id') id: string) {
    return this.service.resetPassword(actorId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a Super Admin app user' })
  remove(@CurrentUser('sub') actorId: string, @Param('id') id: string) {
    return this.service.remove(actorId, id);
  }
}
