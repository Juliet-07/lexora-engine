import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { BoardTrainingModuleService } from '../services/board-training-module.service';
import {
  CreateBoardTrainingModuleDto,
  UpdateBoardTrainingModuleDto,
} from '../dtos/board-training-module.dto';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';
import {
  UserType,
  PlatformModuleKey,
} from 'src/common/interfaces/user-role.enum';

const trainingResourceStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(
      process.cwd(),
      'uploads',
      'grc',
      'training-modules',
    );
    if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

// Tenant-side CRUD for the mandatory-training catalog behind board
// onboarding's Step 4 — see BoardTrainingModuleService for why this
// is tenant-wide, not scoped under a single board member like
// documentsToSign/inductionPack are.
@ApiTags('GRC — Governance — Board Training Modules')
@ApiBearerAuth()
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@RequiresModule(PlatformModuleKey.GRC)
@Controller('grc/governance/board-training-modules')
export class BoardTrainingModuleController {
  constructor(private readonly service: BoardTrainingModuleService) {}

  @Get()
  getAll(@CurrentUser('tenantId') t: string, @CurrentUser('sub') u: string) {
    return this.service.getAll(t || u);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create a mandatory training module' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: trainingResourceStorage,
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  create(
    @Body() dto: CreateBoardTrainingModuleDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.create(t || u, dto, file);
  }

  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: trainingResourceStorage,
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBoardTrainingModuleDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.update(t || u, id, dto, file);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('sub') u: string,
  ) {
    return this.service.remove(t || u, id);
  }
}
