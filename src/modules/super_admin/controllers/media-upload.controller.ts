import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const mediaUploadConfig = {
  storage: memoryStorage(),
  // GIFs run larger than static images — generous enough for a
  // short reaction/loop gif without letting uploads get out of hand.
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    if (EXT_BY_MIME[file.mimetype]) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException(
          'Only PNG, JPG, GIF, or WEBP images are accepted.',
        ),
        false,
      );
    }
  },
};

// Shared image/gif upload for Super-Admin-authored public content —
// Insights cover images and Newsletter campaign images. Returns an
// absolute URL (prefixed with APP_URL, same convention as
// contract.service.ts/invoice.service.ts's toFileUrl) rather than a
// relative /uploads/... path, because the newsletter use case needs
// a URL that resolves correctly inside an email sent to a stranger's
// inbox, not just inside this app.
@ApiTags('SuperAdmin — Media')
@ApiBearerAuth()
@UserTypes(UserType.SUPER_ADMIN)
@Controller('super-admin/media')
export class MediaUploadController {
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', mediaUploadConfig))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file was uploaded.');

    const dir = join(process.cwd(), 'uploads', 'super-admin', 'media');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const ext = EXT_BY_MIME[file.mimetype] || extname(file.originalname) || '';
    const filename = `${randomUUID()}${ext}`;
    writeFileSync(join(dir, filename), file.buffer);

    const base =
      process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
    const url = `${base}/uploads/super-admin/media/${filename}`;
    return { url };
  }
}
