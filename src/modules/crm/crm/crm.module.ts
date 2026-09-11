import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Lead,
  LeadSchema,
  ClientPipelineRecord,
  ClientPipelineSchema,
  ContactSchema,
  Contact,
  SlaProfile,
  SlaProfileSchema,
  ClientCommercial,
  ClientCommercialSchema,
  Vendor,
  VendorSchema,
} from './schemas';
import {
  LeadService,
  ClientPipelineService,
  ContactService,
  SlaProfileService,
  ClientCommercialService,
  VendorService,
} from './services';
import {
  LeadController,
  ClientPipelineController,
  ContactController,
  SlaProfileController,
  ClientCommercialController,
  VendorController,
} from './controllers';
import { User, UserSchema } from 'src/modules/auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileSchema,
} from 'src/modules/tenant/schemas/client-profile.schema';
import { TenantModule } from 'src/modules/tenant/tenant.module';
import {
  Employee,
  EmployeeSchema,
} from 'src/modules/hr/schemas/employee.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: ClientPipelineRecord.name, schema: ClientPipelineSchema },
      { name: User.name, schema: UserSchema },
      { name: ClientProfileRecord.name, schema: ClientProfileSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: ClientCommercial.name, schema: ClientCommercialSchema },
      { name: SlaProfile.name, schema: SlaProfileSchema },
      { name: Vendor.name, schema: VendorSchema },
      { name: Employee.name, schema: EmployeeSchema },
    ]),
    TenantModule,
  ],
  providers: [
    LeadService,
    ClientPipelineService,
    ContactService,
    SlaProfileService,
    ClientCommercialService,
    VendorService,
  ],
  controllers: [
    LeadController,
    ClientPipelineController,
    ContactController,
    SlaProfileController,
    ClientCommercialController,
    VendorController,
  ],
  exports: [
    LeadService,
    ClientPipelineService,
    ContactService,
    SlaProfileService,
    ClientCommercialService,
    VendorService,
  ],
})
export class CrmRelationsModule {}
