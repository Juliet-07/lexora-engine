import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentFile, DocumentFileSchema } from './schemas/document.schema';
import { DocumentTemplate, DocumentTemplateSchema } from './schemas/document-template.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentFile.name, schema: DocumentFileSchema },
      { name: DocumentTemplate.name, schema: DocumentTemplateSchema },
    ]),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService, MongooseModule],
})
export class DocumentsModule {}
