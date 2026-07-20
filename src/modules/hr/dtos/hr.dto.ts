import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsNumber,
  IsDateString,
  Min,
  IsMongoId,
  MinLength,
  IsArray,
} from 'class-validator';
import {
  EmploymentType,
  EmploymentStatus,
  Gender,
  WorkerCategory,
  EmployeeHierarchyRole,
  EmployeeRecordType,
} from '../schemas';
import { StaffRole } from 'src/common/interfaces/user-role.enum';

// ─────────────────────────────────────────────────────────────
// EMPLOYEE DTOs
// ─────────────────────────────────────────────────────────────

export class CreateEmployeeDto {
  // ── Required ───────────────────────────────────────────────
  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'john.doe@company.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Software Engineer' })
  @IsString()
  jobTitle: string;

  @ApiProperty({ example: '2024-01-15' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ enum: WorkerCategory, default: 'employee' })
  @IsOptional()
  @IsEnum(WorkerCategory)
  workerCategory?: WorkerCategory;

  // ── Optional personal ─────────────────────────────────────
  @ApiPropertyOptional({ example: '+250700000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '1990-05-20' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'Rwandan' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ example: '1199900100123456' })
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
  };

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional({ example: '+250788000000' })
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  // ── Optional employment ───────────────────────────────────
  @ApiPropertyOptional({
    enum: EmployeeHierarchyRole,
    default: EmployeeHierarchyRole.REGULAR,
  })
  @IsOptional()
  @IsEnum(EmployeeHierarchyRole)
  hierarchyRole?: EmployeeHierarchyRole;

  @ApiPropertyOptional({
    description:
      'Required when hierarchyRole is regular or manager — the Employee this person reports to',
  })
  @IsOptional()
  @IsMongoId()
  reportsToManagerId?: string;

  @ApiPropertyOptional({
    enum: EmploymentType,
    default: EmploymentType.FULL_TIME,
  })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ example: '2024-04-15' })
  @IsOptional()
  @IsDateString()
  probationEndDate?: string;

  // ── Optional compensation ─────────────────────────────────
  @ApiPropertyOptional({ example: 500000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salary?: number;

  @ApiPropertyOptional({ example: 'RWF', default: 'RWF' })
  @IsOptional()
  @IsString()
  salaryCurrency?: string;

  @ApiPropertyOptional({ example: 'monthly' })
  @IsOptional()
  @IsString()
  salaryFrequency?: string;

  @ApiPropertyOptional({ example: 'Bank of Kigali' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ example: '00123456789' })
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string;

  // ── Leave entitlements ────────────────────────────────────
  @ApiPropertyOptional({ example: 21, default: 21 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  annualLeaveBalance?: number;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sickLeaveBalance?: number;

  // ── Platform access ────────────────────────────────────────
  @ApiPropertyOptional({
    enum: StaffRole,
    isArray: true,
    description:
      'Module-scoped platform roles to grant (e.g. risk_officer for GRC access). Leave empty for a regular employee with no elevated access.',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(StaffRole, { each: true })
  staffRoles?: StaffRole[];
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  @ApiPropertyOptional({ enum: EmploymentStatus })
  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateEmployeeStaffRolesDto {
  @ApiProperty({
    enum: StaffRole,
    isArray: true,
    description: 'Full replacement list of staff roles for this employee.',
  })
  @IsArray()
  @IsEnum(StaffRole, { each: true })
  staffRoles: StaffRole[];
}

export class EmployeeFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ enum: EmploymentStatus })
  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;
}

export class TerminateEmployeeDto {
  @ApiProperty({ example: '2024-12-31' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: 'Resignation' })
  @IsString()
  reason: string;

  @ApiProperty({ enum: EmploymentStatus, example: EmploymentStatus.TERMINATED })
  @IsEnum(EmploymentStatus)
  status: EmploymentStatus;

  @ApiPropertyOptional({
    description:
      'Required if this employee has direct reports: either the ID of who should take them over, or the literal string "clear" to explicitly leave them unassigned.',
  })
  @IsOptional()
  @IsString()
  reassignDirectReportsTo?: string;
}

export class PromoteToHeadOfDepartmentDto {
  @ApiProperty() @IsMongoId() teamId: string;
  @ApiProperty() @IsMongoId() promotedManagerId: string;
  @ApiPropertyOptional({
    description:
      'Required only if the promoted Manager currently has Regular employees reporting to them.',
  })
  @IsOptional()
  @IsMongoId()
  regularsReassignToManagerId?: string;
}

export class AddEmployeeRecordDto {
  @ApiProperty({ enum: EmployeeRecordType })
  @IsEnum(EmployeeRecordType)
  type: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  description: string;
}

export class SuspendEmployeeDto {
  @ApiProperty({ example: 'Breach of company policy — under investigation' })
  @IsString()
  @MinLength(10)
  reason: string;

  @ApiProperty({
    example: '2026-08-15',
    description:
      'When the suspension ends — reactivation is automatic at this date',
  })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    description:
      'The Contract document ID if a suspension letter was generated and issued via the Contracts system',
  })
  @IsOptional()
  @IsMongoId()
  contractId?: string;
}
