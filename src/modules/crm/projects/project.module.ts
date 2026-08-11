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
  MyProjectsService,
  TaskService,
} from './services';
import {
  MandateController,
  MandateWorkspaceController,
  MyProjectsController,
  TaskController,
} from './controllers';
import { Employee, EmployeeSchema } from 'src/modules/hr/schemas';

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
      { name: Employee.name, schema: EmployeeSchema },
    ]),
  ],
  providers: [
    MandateService,
    MandateWorkspaceService,
    TaskService,
    MyProjectsService,
  ],
  controllers: [
    MandateController,
    MandateWorkspaceController,
    TaskController,
    MyProjectsController,
  ],
  exports: [MandateService, MandateWorkspaceService, TaskService],
})
export class ProjectsModule {}
