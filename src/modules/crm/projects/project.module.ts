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
  MandateEmployeeMessage,
  MandateEmployeeMessageSchema,
} from './schemas';
import {
  ClientProjectsService,
  MandateService,
  MandateWorkspaceService,
  MyProjectsService,
  TaskService,
} from './services';
import {
  ClientProjectsController,
  MandateController,
  MandateWorkspaceController,
  MyProjectsController,
  TaskController,
} from './controllers';
import { Employee, EmployeeSchema } from 'src/modules/hr/schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Mandate.name, schema: MandateSchema },
      { name: MandateMessage.name, schema: MandateMessageSchema },
      {
        name: MandateEmployeeMessage.name,
        schema: MandateEmployeeMessageSchema,
      },
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
    ClientProjectsService,
  ],
  controllers: [
    MandateController,
    MandateWorkspaceController,
    TaskController,
    MyProjectsController,
    ClientProjectsController,
  ],
  exports: [
    MandateService,
    MandateWorkspaceService,
    TaskService,
    MyProjectsService,
    ClientProjectsService,
  ],
})
export class ProjectsModule {}
