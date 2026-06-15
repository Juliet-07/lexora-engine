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

@Schema({ timestamps: true, collection: 'hr_employees' })
export class Employee {
  // ── Ownership ──────────────────────────────────────────────
  // tenantId: the firm managing this employee's HR
  // clientId: the corporate client this employee works for
  // userId:   linked User record for portal login (set on creation)
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'ClientProfileRecord',
    required: true,
    index: true,
  })
  clientId: Types.ObjectId;

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

  // ── Employment Info ────────────────────────────────────────
  @Prop({ required: true, unique: true })
  employeeNumber: string; // e.g. EMP-0001 — auto-generated per tenant+client

  @Prop({ required: true })
  jobTitle: string;

  @Prop({ default: null })
  department: string | null;

  @Prop({ default: null })
  reportsTo: string | null; // manager name or employee number

  @Prop({ enum: EmploymentType, default: EmploymentType.FULL_TIME })
  employmentType: EmploymentType;

  @Prop({ enum: EmploymentStatus, default: EmploymentStatus.ACTIVE })
  employmentStatus: EmploymentStatus;

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
  salaryFrequency: string; // monthly | bi-weekly | weekly

  @Prop({ default: null })
  bankName: string | null;

  @Prop({ default: null })
  bankAccountNumber: string | null;

  @Prop({ default: null })
  taxId: string | null;

  // ── Leave Balance ──────────────────────────────────────────
  @Prop({ default: 21 })
  annualLeaveBalance: number; // days — reset annually

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
        name: { type: String },
        url: { type: String },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  documents: { name: string; url: string; uploadedAt: Date }[];

  // ── Avatar ─────────────────────────────────────────────────
  @Prop({ default: null })
  avatarUrl: string | null;

  // ── Metadata ──────────────────────────────────────────────
  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);

@Schema({ timestamps: true, collection: 'hr_employee_attendance' })
export class EmployeeAttendance {
  // Employee record _id
  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId: Types.ObjectId;

  // The client this employee belongs to
  @Prop({
    type: Types.ObjectId,
    ref: 'ClientProfileRecord',
    required: true,
    index: true,
  })
  clientId: Types.ObjectId;

  // The tenant managing this employee's HR
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // Calendar date (start of day, midnight UTC — for unique index)
  @Prop({ required: true })
  date: Date;

  @Prop({ required: true })
  clockIn: Date;

  @Prop({ default: null })
  clockOut: Date | null;

  // Total break minutes accumulated
  @Prop({ default: 0 })
  breakMinutes: number;

  // Track active break start
  @Prop({ default: null })
  breakStartedAt: Date | null;

  // Calculated on clock-out
  @Prop({ default: null })
  hoursWorked: number | null;

  @Prop({ default: 'Office' })
  location: string;

  @Prop({
    enum: EmployeeAttendanceStatus,
    default: EmployeeAttendanceStatus.PRESENT,
  })
  status: EmployeeAttendanceStatus;

  // Notes added by manager or HR
  @Prop({ default: null })
  note: string | null;
}

export const EmployeeAttendanceSchema =
  SchemaFactory.createForClass(EmployeeAttendance);
