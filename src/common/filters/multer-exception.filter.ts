import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { MulterError } from 'multer';
import { Response } from 'express';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const message =
      exception.code === 'LIMIT_FILE_SIZE'
        ? 'This file is too large. Please upload a smaller file, or use an external URL instead.'
        : exception.message;

    response.status(400).json({
      success: false,
      statusCode: 400,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
