import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EmployeeRecord,
  EmployeeRecordDocument,
  EmployeeRecordType,
  Employee,
  EmployeeDocument,
  EmploymentStatus,
} from '../schemas';
import { AddEmployeeRecordDto } from '../dtos';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { EmployeeService } from './employee.service';
import { DisputeLetterPdfService } from './dispute-letter-pdf.service';

@Injectable()
export class EmployeeRecordService {
  constructor(
    @InjectModel(EmployeeRecord.name)
    private readonly recordModel: Model<EmployeeRecordDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly emailService: EmailService,
    private readonly employeeService: EmployeeService,
    private readonly letterPdfService: DisputeLetterPdfService,
  ) {}

  async addRecord(
    tenantId: string,
    employeeId: string,
    recordedByUserId: string,
    dto: AddEmployeeRecordDto,
  ): Promise<EmployeeRecordDocument> {
    const employee = await this.employeeModel.findOne({
      _id: new Types.ObjectId(employeeId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!employee) throw new NotFoundException('Employee not found.');

    const record = await this.recordModel.create({
      tenantId: new Types.ObjectId(tenantId),
      employeeId: employee._id,
      type: dto.type,
      description: dto.description,
      recordedBy: new Types.ObjectId(recordedByUserId),
      recordedAt: new Date(),
    });

    await this.actOnRecord(tenantId, record, employee).catch(() => {});

    return record;
  }

  async getRecordsForEmployee(
    tenantId: string,
    employeeId: string,
  ): Promise<EmployeeRecordDocument[]> {
    return this.recordModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        employeeId: new Types.ObjectId(employeeId),
      })
      .sort({ recordedAt: -1 });
  }

  private async actOnRecord(
    tenantId: string,
    record: EmployeeRecordDocument,
    employee: EmployeeDocument,
  ): Promise<void> {
    if (!employee.email) return;

    // A readable reference for the letter/email — this isn't a
    // dispute case, so it has no case number of its own.
    const reference = `HR-${(record._id as Types.ObjectId)
      .toString()
      .slice(-6)
      .toUpperCase()}`;

    if (record.type === EmployeeRecordType.SUSPENSION) {
      const businessName = process.env.FIRM_NAME || 'Your Organization';
      const letterPdf = await this.letterPdfService.buildSuspensionLetterPdf({
        employeeName: `${employee.firstName} ${employee.lastName}`,
        jobTitle: employee.jobTitle,
        caseNumber: reference,
        businessName,
        notes: record.description,
        issuedDate: record.recordedAt,
      });
      await this.emailService.sendDisputeSuspensionLetter(
        {
          to: employee.email,
          recipientName: `${employee.firstName} ${employee.lastName}`,
          caseNumber: reference,
          dashboardUrl: `${process.env.TENANT_APP_URL}`,
        },
        letterPdf,
      );
      record.emailSentAt = new Date();
      await record.save();
      return;
    }

    if (record.type === EmployeeRecordType.TERMINATION) {
      try {
        await this.employeeService.terminateEmployee(
          tenantId,
          (employee._id as Types.ObjectId).toString(),
          {
            status: EmploymentStatus.TERMINATED,
            endDate: new Date().toISOString(),
            reason: record.description,
          } as any,
        );
        record.emailSentAt = new Date();
      } catch (e: any) {
        record.terminationTriggerError = e?.message ?? 'termination failed';
      }
      await record.save();
      return;
    }

    // note, first/second/final warning — a plain notification, not a
    // case and not a legal letter.
    await this.emailService.sendEmployeeRecordAdded({
      to: employee.email,
      recipientName: `${employee.firstName} ${employee.lastName}`,
      recordType: record.type,
      description: record.description,
      dashboardUrl: `${process.env.TENANT_APP_URL}`,
    });
    record.emailSentAt = new Date();
    await record.save();
  }
}
