import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Employee, EmployeeSchema } from './schemas/employee.schema';
import { EmployeeService } from './services/employee.service';

import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileSchema,
} from '../tenant/schemas/client-profile.schema';
import { EmailService } from '../../common/utils/mailing/email.service';
import {
  HrTenantController,
  HrClientController,
  HrEmployeeController,
} from './controllers';
import {
  LeaveRequest,
  LeaveRequestSchema,
} from './schemas/leave-request.schema';
import { LeavePolicy, LeavePolicySchema } from './schemas/leave-policy.schema';
import { LeaveService } from './services';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      { name: User.name, schema: UserSchema },
      { name: ClientProfileRecord.name, schema: ClientProfileSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: LeavePolicy.name, schema: LeavePolicySchema },
    ]),
  ],
  controllers: [HrTenantController, HrEmployeeController, HrClientController],
  providers: [EmployeeService, EmailService, LeaveService],
  exports: [EmployeeService, LeaveService],
})
export class HrModule {}
