import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Ticket, TicketSchema } from '../crm/projects/schemas/ticket.schema';
import { SupportTicket, SupportTicketSchema } from './schemas';
import { SupportTicketService } from './services';
import {
  TenantSupportTicketController,
  AdminSupportTicketController,
} from './controllers';

// Tickets between tenants and the platform team (Super Admin), including a
// tenant's escalation of a client's Portal-access ticket. Separate from the
// CRM service desk, which is tenant ⇄ their own clients.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupportTicket.name, schema: SupportTicketSchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [TenantSupportTicketController, AdminSupportTicketController],
  providers: [SupportTicketService],
  exports: [SupportTicketService],
})
export class SupportModule {}
