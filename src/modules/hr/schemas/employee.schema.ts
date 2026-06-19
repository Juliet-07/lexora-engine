import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmployeeDocument = Employee & Document;
export type EmployeeAttendanceDocument = EmployeeAttendance & Document;

export enum EmploymentType {
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  CONTRACT = 'contract',
  INTERN = 'intern',
  CONSULTANT = 'consultant',
}

export enum EmploymentStatus {
  ACTIVE = 'active',
  ON_LEAVE = 'on_leave',
  SUSPENDED = 'suspended',
  TERMINATED = 'terminated',
  RESIGNED = 'resigned',
  PROBATION = 'probation',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export enum EmployeeAttendanceStatus {
  PRESENT = 'present',
  LATE = 'late',
  REMOTE = 'remote',
  ABSENT = 'absent',
  ON_LEAVE = 'on_leave',
}

@Schema({ _id: false })
export class NextOfKin {
  @Prop({ default: null }) name: string | null;
  @Prop({ default: null }) relationship: string | null;
  @Prop({ default: null }) phone: string | null;
}
export const NextOfKinSchema = SchemaFactory.createForClass(NextOfKin);

@Schema({ _id: false })
export class MedicalInfo {
  @Prop({ default: null }) bloodGroup: string | null;
  @Prop({ default: null }) allergies: string | null;
  @Prop({ default: null }) conditions: string | null;
  @Prop({ default: null }) medications: string | null;
  @Prop({ default: null }) doctorName: string | null;
  @Prop({ default: null }) doctorPhone: string | null;
}
export const MedicalInfoSchema = SchemaFactory.createForClass(MedicalInfo);

@Schema({ _id: false })
export class EmployeeReference {
  @Prop({ required: true }) name: string;
  @Prop({ default: null }) relationship: string | null;
  @Prop({ default: null }) email: string | null;
  @Prop({ default: null }) phone: string | null;
}
export const EmployeeReferenceSchema =
  SchemaFactory.createForClass(EmployeeReference);

@Schema({ _id: false })
export class EmployeeCertificate {
  @Prop({ required: true }) name: string; // display name, e.g. "AML Certification"
  @Prop({ required: true }) fileUrl: string;
  @Prop({ required: true }) originalFileName: string;
  @Prop({ default: () => new Date() }) uploadedAt: Date;
}
export const EmployeeCertificateSchema =
  SchemaFactory.createForClass(EmployeeCertificate);

@Schema({ _id: false })
export class EmployeeAllowance {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: null })
  currency: string | null;
}
export const EmployeeAllowanceSchema =
  SchemaFactory.createForClass(EmployeeAllowance);

@Schema({ timestamps: true, collection: 'hr_employees' })
export class Employee {
  // ── Ownership ──────────────────────────────────────────────
  // tenantId: the organization this employee belongs to
  // teamId:   the department/team
  // locationId: the branch/office
  // userId:   linked User record for portal login
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'HrTeam', default: null, index: true })
  teamId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'HrLocation', default: null, index: true })
  locationId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId: Types.ObjectId | null;

  // ── Personal Info ──────────────────────────────────────────
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ default: null })
  phone: string | null;

  @Prop({ enum: Gender, default: null })
  gender: Gender | null;

  @Prop({ default: null })
  dateOfBirth: Date | null;

  @Prop({ default: null })
  nationality: string | null;

  @Prop({ default: null })
  nationalId: string | null;

  @Prop({ type: Object, default: null })
  address: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
  } | null;

  @Prop({ default: null })
  emergencyContactName: string | null;

  @Prop({ default: null })
  emergencyContactPhone: string | null;

  @Prop({ type: NextOfKinSchema, default: null })
  nextOfKin: NextOfKin | null;

  @Prop({ type: MedicalInfoSchema, default: null })
  medicalInfo: MedicalInfo | null;

  @Prop({ type: [EmployeeReferenceSchema], default: [] })
  references: EmployeeReference[];

  @Prop({ type: [EmployeeCertificateSchema], default: [] })
  certificates: EmployeeCertificate[];

  // ── Employment Info ────────────────────────────────────────
  @Prop({ required: true, unique: true })
  employeeNumber: string;

  @Prop({ required: true })
  jobTitle: string;

  @Prop({ default: null })
  reportsTo: string | null;

  @Prop({ enum: EmploymentType, default: EmploymentType.FULL_TIME })
  employmentType: EmploymentType;

  @Prop({ enum: EmploymentStatus, default: EmploymentStatus.ACTIVE })
  employmentStatus: EmploymentStatus;

  @Prop({ default: 0 })
  onboardingStep: number;

  @Prop({ default: false })
  onboardingCompleted: boolean;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ default: null })
  endDate: Date | null;

  @Prop({ default: null })
  probationEndDate: Date | null;

  // ── Compensation ───────────────────────────────────────────
  @Prop({ default: null })
  salary: number | null;

  @Prop({ default: 'RWF' })
  salaryCurrency: string;

  @Prop({ default: 'monthly' })
  salaryFrequency: string;

  @Prop({ default: null })
  bankName: string | null;

  @Prop({ default: null })
  bankAccountNumber: string | null;

  @Prop({ default: null })
  taxId: string | null;

  @Prop({ type: [EmployeeAllowanceSchema], default: [] })
  allowances: EmployeeAllowance[];

  // ── Leave Balance ──────────────────────────────────────────
  @Prop({ default: 21 })
  annualLeaveBalance: number;

  @Prop({ default: 0 })
  annualLeaveUsed: number;

  @Prop({ default: 10 })
  sickLeaveBalance: number;

  @Prop({ default: 0 })
  sickLeaveUsed: number;

  // ── Documents ─────────────────────────────────────────────
  @Prop({
    type: [
      {
        name: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  documents: { name: string; url: string; uploadedAt: Date }[];

  @Prop({ default: null })
  avatarUrl: string | null;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);

// ── Attendance — clientId removed ─────────────────────────────

@Schema({ timestamps: true, collection: 'hr_employee_attendance' })
export class EmployeeAttendance {
  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true })
  clockIn: Date;

  @Prop({ default: null })
  clockOut: Date | null;

  @Prop({ default: 0 })
  breakMinutes: number;

  @Prop({ default: null })
  breakStartedAt: Date | null;

  @Prop({ default: null })
  hoursWorked: number | null;

  @Prop({ default: 'Office' })
  location: string;

  @Prop({
    enum: EmployeeAttendanceStatus,
    default: EmployeeAttendanceStatus.PRESENT,
  })
  status: EmployeeAttendanceStatus;

  @Prop({ default: null })
  note: string | null;
}

export const EmployeeAttendanceSchema =
  SchemaFactory.createForClass(EmployeeAttendance);

export type EmployeeLoanDocument = EmployeeLoan & Document;

export enum LoanStatus {
  ACTIVE = 'active',
  PAID_OFF = 'paid_off',
  CANCELLED = 'cancelled',
  PAUSED = 'paused', // tenant can pause a deduction without cancelling the loan
}

@Schema({ timestamps: true, collection: 'hr_employee_loans' })
export class EmployeeLoan {
  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  label: string; // e.g. "Salary Advance — June 2026", "Emergency Loan"

  @Prop({ required: true })
  principalAmount: number;

  @Prop({ required: true })
  currency: string;

  @Prop({ required: true })
  monthlyInstallment: number;

  // Decremented by monthlyInstallment (or the remainder, if smaller)
  // each time a payroll run successfully deducts this loan.
  @Prop({ required: true })
  outstandingBalance: number;

  @Prop({ enum: LoanStatus, default: LoanStatus.ACTIVE })
  status: LoanStatus;

  @Prop({ default: () => new Date() })
  startDate: Date;

  @Prop({ default: null })
  note: string | null;

  // Audit trail of which payroll runs deducted from this loan
  @Prop({
    type: [
      {
        payrollRunId: { type: Types.ObjectId, ref: 'PayrollRun' },
        amount: Number,
        deductedAt: Date,
      },
    ],
    default: [],
  })
  deductionHistory: {
    payrollRunId: Types.ObjectId;
    amount: number;
    deductedAt: Date;
  }[];
}

export const EmployeeLoanSchema = SchemaFactory.createForClass(EmployeeLoan);
