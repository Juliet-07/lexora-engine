import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Employee,
  EmployeeAttendance,
  EmployeeAttendanceSchema,
  EmployeeSchema,
} from './schemas/employee.schema';
import {
  EmployeeService,
  LeaveService,
  AttendanceService,
  OnboardingService,
} from './services';
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
  OnboardingDocument,
  EmployeeOnboarding,
  OnboardingDocumentSchema,
  EmployeeOnboardingSchema,
} from './schemas';
import { HrOnboardingController } from './controllers/employee-onboarding.controller';

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
      { name: OnboardingDocument.name, schema: OnboardingDocumentSchema },
      { name: EmployeeOnboarding.name, schema: EmployeeOnboardingSchema },
    ]),
  ],
  controllers: [
    HrTenantController,
    HrEmployeeController,
    HrOnboardingController,
  ],
  providers: [
    EmployeeService,
    EmailService,
    LeaveService,
    AttendanceService,
    OnboardingService,
  ],
  exports: [
    EmployeeService,
    LeaveService,
    AttendanceService,
    OnboardingService,
  ],
})
export class HrModule {}
