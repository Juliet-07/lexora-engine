import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Mandate,
  MandateSchema,
  MandateMessage,
  MandateMessageSchema,
  MandateEmployeeMessage,
  MandateEmployeeMessageSchema,
  MandateNote,
  MandateNoteSchema,
  MandateDocumentEntry,
  MandateDocumentSchema,
  Task,
  TaskSchema,
  TimeEntry,
  TimeEntrySchema,
  RateCard,
  RateCardSchema,
  Ticket,
  TicketSchema,
  KbArticle,
  KbArticleSchema,
  AdrCase,
  AdrCaseSchema,
  PortfolioRisk,
  PortfolioRiskSchema,
} from './schemas';
import {
  MandateService,
  MandateWorkspaceService,
  MyProjectsService,
  ClientProjectsService,
  TaskService,
  TimeEntryService,
  RateCardService,
  TicketService,
  MyTicketsService,
  ClientTicketsService,
  KbArticleService,
  MyKbService,
  ClientKbService,
  AdrCaseService,
  PortfolioRiskService,
} from './services';
import {
  MandateController,
  MandateWorkspaceController,
  MyProjectsController,
  ClientProjectsController,
  TaskController,
  TimeEntryController,
  RateCardController,
  TicketController,
  MyTicketsController,
  ClientTicketsController,
  KbArticleController,
  MyKbController,
  ClientKbController,
  AdrCaseController,
  PortfolioRiskController,
} from './controllers';
import { Employee, EmployeeSchema } from 'src/modules/hr/schemas';

/**
 * The "Projects" sidebar section (Mandates, Tasks, Gantt & Planning,
 * Timesheets, Service Desk, ADR, PMO) — sibling to CrmRelationsModule
 * ("CRM" section). Same flat schemas/dtos/services/controllers
 * pattern; add the rest as each feature is built, all under this one
 * ProjectsModule.
 *
 * Dependency direction worth remembering: TimeEntryService, TicketService
 * and KbArticleService are all leaves — none of them look up Mandate/
 * Task/each other, they accept denormalized names from the caller
 * instead (same pattern as Mandate.clientName). TaskService and
 * MandateService depend on TimeEntryService for computed loggedHrs/wip;
 * MyTicketsService/ClientTicketsService delegate to TicketService;
 * MyKbService/ClientKbService delegate to KbArticleService. All
 * one-directional — the reverse would be circular.
 */
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
      { name: TimeEntry.name, schema: TimeEntrySchema },
      { name: RateCard.name, schema: RateCardSchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: KbArticle.name, schema: KbArticleSchema },
      { name: AdrCase.name, schema: AdrCaseSchema },
      { name: PortfolioRisk.name, schema: PortfolioRiskSchema },
      { name: Employee.name, schema: EmployeeSchema },
    ]),
  ],
  providers: [
    RateCardService,
    TimeEntryService,
    TicketService,
    MyTicketsService,
    ClientTicketsService,
    KbArticleService,
    MyKbService,
    ClientKbService,
    AdrCaseService,
    PortfolioRiskService,
    MandateService,
    MandateWorkspaceService,
    TaskService,
    MyProjectsService,
    ClientProjectsService,
  ],
  controllers: [
    TimeEntryController,
    RateCardController,
    TicketController,
    MyTicketsController,
    ClientTicketsController,
    KbArticleController,
    MyKbController,
    ClientKbController,
    AdrCaseController,
    PortfolioRiskController,
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
    TimeEntryService,
    TicketService,
    KbArticleService,
  ],
})
export class ProjectsModule {}
