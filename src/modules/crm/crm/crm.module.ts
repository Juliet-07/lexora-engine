import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Lead,
  LeadSchema,
  ClientPipelineRecord,
  ClientPipelineSchema,
  ContactSchema,
  Contact,
} from './schemas';
import { LeadService, ClientPipelineService, ContactService } from './services';
import {
  LeadController,
  ClientPipelineController,
  ContactController,
} from './controllers';
import { User, UserSchema } from 'src/modules/auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileSchema,
} from 'src/modules/tenant/schemas/client-profile.schema';
import { TenantModule } from 'src/modules/tenant/tenant.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: ClientPipelineRecord.name, schema: ClientPipelineSchema },
      { name: User.name, schema: UserSchema },
      { name: ClientProfileRecord.name, schema: ClientProfileSchema },
      { name: Contact.name, schema: ContactSchema },
    ]),
    TenantModule,
  ],
  providers: [LeadService, ClientPipelineService, ContactService],
  controllers: [LeadController, ClientPipelineController, ContactController],
  exports: [LeadService, ClientPipelineService, ContactService],
})
export class CrmRelationsModule {}
