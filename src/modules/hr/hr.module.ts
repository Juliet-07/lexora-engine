import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Employee, EmployeeSchema } from './schemas/employee.schema';
import { EmployeeService } from './services/employee.service';
import {
  HrTenantController,
  HrEmployeeController,
  HrClientController,
} from './hr.controller';

import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileSchema,
} from '../tenant/schemas/client-profile.schema';
import { EmailService } from '../../common/utils/mailing/email.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      { name: User.name, schema: UserSchema },
      { name: ClientProfileRecord.name, schema: ClientProfileSchema },
    ]),
  ],
  controllers: [HrTenantController, HrEmployeeController, HrClientController],
  providers: [EmployeeService, EmailService],
  exports: [EmployeeService],
})
export class HrModule {}

// ─────────────────────────────────────────────────────────────
// WIRING INSTRUCTIONS
// ─────────────────────────────────────────────────────────────
//
// 1. Place files at src/modules/hr/
//
// 2. Register HrModule in app.module.ts:
//    imports: [..., HrModule]
//
// 3. Add EMPLOYEE to UserType enum in user-role.enum.ts:
//    EMPLOYEE = 'employee'
//
// 4. Add sendEmployeeWelcome to email.service.ts:
//
//    import {
//      employeeWelcomeTemplate,
//      EmployeeWelcomeEmailData,
//    } from './templates/employee-welcome.template';
//
//    async sendEmployeeWelcome(data: EmployeeWelcomeEmailData): Promise<void> {
//      const { subject, html } = employeeWelcomeTemplate(data);
//      await this.transporter.sendMail({
//        from: `"${process.env.FIRM_NAME || 'Lexora'}" <${process.env.SMTP_FROM}>`,
//        to: data.to, subject, html,
//      });
//    }
//
// 5. JWT strategy — ensure EMPLOYEE userType is allowed through auth guards.
//    The existing guards check userType — add EMPLOYEE to any guard that
//    needs to allow employee access to /employee/* routes.
//
// 6. Client portal auth split (client app) — after login, check userType:
//    - 'client'   → existing KYC/onboarding dashboard
//    - 'employee' → new HR employee dashboard (to be built)
//    In AuthContext of the client app, add:
//      isEmployee: user?.userType === 'employee'
//    Then in App.tsx of the client app, route based on userType.
//
// ─────────────────────────────────────────────────────────────
// API ENDPOINTS
// ─────────────────────────────────────────────────────────────
//
// TENANT (JWT required — userType: tenant):
//   GET  /hr/stats                          → dashboard stats
//   POST /hr/employees                      → create employee (sends email)
//   GET  /hr/employees                      → list all employees (filterable)
//   GET  /hr/employees/:id                  → employee full profile
//   PATCH /hr/employees/:id                 → update employee
//   PATCH /hr/employees/:id/terminate       → terminate / resign
//   GET  /hr/clients/:clientId/employees    → employees for one client
//
// EMPLOYEE (JWT required — userType: employee):
//   GET  /employee/me                       → own profile
//
// ─────────────────────────────────────────────────────────────
// NEXT MODULES TO BUILD (in order):
//   Leave         → hr/schemas/leave.schema.ts
//   Attendance    → hr/schemas/attendance.schema.ts
//   Payroll       → hr/schemas/payroll.schema.ts
//   Performance   → hr/schemas/performance.schema.ts
//   Contracts     → hr/schemas/contract.schema.ts
//   Learning      → hr/schemas/learning.schema.ts
//   Requisitions  → hr/schemas/requisition.schema.ts
//   Recruitment   → hr/schemas/recruitment.schema.ts
