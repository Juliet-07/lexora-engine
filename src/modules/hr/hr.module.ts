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
import { EmailService } from '../../common/utils/mailing/email.service';
import { HrEmployeeController, HrTenantController } from './controllers';
import {
  LeaveRequest,
  LeaveRequestSchema,
  LeavePolicy,
  LeavePolicySchema,
  HrTeam,
  HrLocation,
  HrTeamSchema,
  HrLocationSchema,
} from './schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      { name: User.name, schema: UserSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: LeavePolicy.name, schema: LeavePolicySchema },
      { name: EmployeeAttendance.name, schema: EmployeeAttendanceSchema },
      { name: HrTeam.name, schema: HrTeamSchema },
      { name: HrLocation.name, schema: HrLocationSchema },
    ]),
  ],
  controllers: [HrTenantController, HrEmployeeController],
  providers: [EmployeeService, EmailService, LeaveService, AttendanceService],
  exports: [EmployeeService, LeaveService, AttendanceService],
})
export class HrModule {}
