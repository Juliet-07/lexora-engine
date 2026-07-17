import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Lead,
  LeadSchema,
  ClientPipelineRecord,
  ClientPipelineSchema,
} from './schemas';
import { LeadService, ClientPipelineService } from './services';
import { LeadController, ClientPipelineController } from './controllers';
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
    ]),
    TenantModule,
  ],
  providers: [LeadService, ClientPipelineService],
  controllers: [LeadController, ClientPipelineController],
  exports: [LeadService, ClientPipelineService],
})
export class CrmModule {}
