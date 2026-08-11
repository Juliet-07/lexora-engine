import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Mandate,
  MandateSchema,
  MandateMessage,
  MandateMessageSchema,
  MandateNote,
  MandateNoteSchema,
  MandateDocumentEntry,
  MandateDocumentSchema,
  Task,
  TaskSchema,
} from './schemas';
import {
  MandateService,
  MandateWorkspaceService,
  TaskService,
} from './services';
import {
  MandateController,
  MandateWorkspaceController,
  TaskController,
} from './controllers';

/**
 * The "Projects" sidebar section (Mandates, Tasks, Gantt & Planning,
 * Timesheets, Service Desk, ADR, PMO) — sibling to CrmRelationsModule
 * ("CRM" section). Same flat schemas/dtos/services/controllers
 * pattern; add TaskService/GanttModule-equivalents etc. here as each
 * feature is built, all under this one ProjectsModule.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Mandate.name, schema: MandateSchema },
      { name: MandateMessage.name, schema: MandateMessageSchema },
      { name: MandateNote.name, schema: MandateNoteSchema },
      { name: MandateDocumentEntry.name, schema: MandateDocumentSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  providers: [MandateService, MandateWorkspaceService, TaskService],
  controllers: [MandateController, MandateWorkspaceController, TaskController],
  exports: [MandateService, MandateWorkspaceService, TaskService],
})
export class ProjectsModule {}
