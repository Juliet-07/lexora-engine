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
  PayrollCalculationService,
  PayrollPolicyService,
  EmployeeLoanService,
  ExchangeRateService,
  PayrollRunService,
  PayslipTemplateService,
} from './services';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { EmailService } from '../../common/utils/mailing/email.service';
import {
  HrTenantController,
  HrEmployeeController,
  HrOnboardingController,
  PayrollPolicyController,
  EmployeeLoanController,
  PayrollRunController,
  PayslipTemplateController,
} from './controllers';
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
  OnboardingDocumentSchema,
  EmployeeOnboarding,
  EmployeeOnboardingSchema,
  PayrollPolicy,
  PayrollPolicySchema,
  EmployeeLoan,
  EmployeeLoanSchema,
  PayrollRun,
  PayrollRunSchema,
  Payslip,
  PayslipSchema,
  PayslipTemplate,
  PayslipTemplateSchema,
  ExchangeRateSnapshot,
  ExchangeRateSnapshotSchema,
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
      { name: OnboardingDocument.name, schema: OnboardingDocumentSchema },
      { name: EmployeeOnboarding.name, schema: EmployeeOnboardingSchema },
      { name: PayrollPolicy.name, schema: PayrollPolicySchema },
      { name: EmployeeLoan.name, schema: EmployeeLoanSchema },
      { name: PayrollRun.name, schema: PayrollRunSchema },
      { name: Payslip.name, schema: PayslipSchema },
      { name: PayslipTemplate.name, schema: PayslipTemplateSchema },
      { name: ExchangeRateSnapshot.name, schema: ExchangeRateSnapshotSchema },
    ]),
  ],
  controllers: [
    HrTenantController,
    HrEmployeeController,
    HrOnboardingController,
    PayrollPolicyController,
    EmployeeLoanController,
    PayrollRunController,
    PayslipTemplateController,
  ],
  providers: [
    EmployeeService,
    EmailService,
    LeaveService,
    AttendanceService,
    OnboardingService,
    PayrollCalculationService,
    PayrollPolicyService,
    EmployeeLoanService,
    ExchangeRateService,
    PayrollRunService,
    PayslipTemplateService,
  ],
  exports: [
    EmployeeService,
    LeaveService,
    AttendanceService,
    OnboardingService,
    PayrollRunService,
  ],
})
export class HrModule {}
