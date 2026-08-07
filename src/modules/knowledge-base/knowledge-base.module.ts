import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KnowledgeEntry, KnowledgeEntrySchema } from './knowledge-entry.schema';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseAdminController } from './knowledge-base-admin.controller';
import { KnowledgeBaseController } from './knowledge-base.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeEntry.name, schema: KnowledgeEntrySchema },
    ]),
  ],
  controllers: [KnowledgeBaseAdminController, KnowledgeBaseController],
  providers: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
