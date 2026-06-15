import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Employee,
  EmployeeAttendance,
  EmployeeAttendanceSchema,
  EmployeeSchema,
} from './schemas/employee.schema';
import { EmployeeService, LeaveService, AttendanceService } from './services';

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
  LeavePolicy,
  LeavePolicySchema,
} from './schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      { name: User.name, schema: UserSchema },
      { name: ClientProfileRecord.name, schema: ClientProfileSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: LeavePolicy.name, schema: LeavePolicySchema },
      { name: EmployeeAttendance.name, schema: EmployeeAttendanceSchema },
    ]),
  ],
  controllers: [HrTenantController, HrEmployeeController, HrClientController],
  providers: [EmployeeService, EmailService, LeaveService, AttendanceService],
  exports: [EmployeeService, LeaveService, AttendanceService],
})
export class HrModule {}
