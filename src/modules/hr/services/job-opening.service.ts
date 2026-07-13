import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  JobOpening,
  JobOpeningDocument,
  JobOpeningStatus,
  Employee,
  EmployeeDocument,
  EmploymentStatus,
} from '../schemas';
import { CreateJobOpeningDto, UpdateJobOpeningDto } from '../dtos';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

@Injectable()
export class JobOpeningService {
  constructor(
    @InjectModel(JobOpening.name)
    private readonly jobOpeningModel: Model<JobOpeningDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}

  async create(
    tenantId: string,
    dto: CreateJobOpeningDto,
  ): Promise<JobOpeningDocument> {
    const opening = await this.jobOpeningModel.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title,
      teamId: dto.teamId ? new Types.ObjectId(dto.teamId) : null,
      locationId: dto.locationId ? new Types.ObjectId(dto.locationId) : null,
      type: dto.type,
      description: dto.description ?? null,
      status: JobOpeningStatus.OPEN,
      postedDate: new Date(),
    });

    this.notifyAllEmployeesOfNewOpening(tenantId, opening).catch(() => {});

    return opening;
  }

  async getAll(tenantId: string): Promise<JobOpeningDocument[]> {
    return this.jobOpeningModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .populate('teamId', 'name')
      .populate('locationId', 'name country city')
      .sort({ postedDate: -1 })
      .lean() as any;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateJobOpeningDto,
  ): Promise<JobOpeningDocument> {
    const opening = await this.jobOpeningModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!opening) throw new NotFoundException('Job opening not found');

    const wasFilled = opening.status === JobOpeningStatus.FILLED;

    if (dto.title !== undefined) opening.title = dto.title;
    if (dto.teamId !== undefined)
      opening.teamId = dto.teamId ? new Types.ObjectId(dto.teamId) : null;
    if (dto.locationId !== undefined)
      opening.locationId = dto.locationId
        ? new Types.ObjectId(dto.locationId)
        : null;
    if (dto.type !== undefined) opening.type = dto.type;
    if (dto.description !== undefined) opening.description = dto.description;
    if (dto.status !== undefined) opening.status = dto.status;

    await opening.save();

    const justFilled = !wasFilled && opening.status === JobOpeningStatus.FILLED;
    if (justFilled) {
      opening.filledAt = new Date();
      await opening.save();
      this.notifyAllEmployeesOfFilledOpening(tenantId, opening).catch(() => {});
    }

    return opening;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.jobOpeningModel.findOneAndDelete({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!deleted) throw new NotFoundException('Job opening not found');
  }

  private async getActiveEmployeeEmails(
    tenantId: string,
  ): Promise<{ email: string; firstName: string }[]> {
    const employees = await this.employeeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        employmentStatus: {
          $nin: [
            EmploymentStatus.TERMINATED,
            EmploymentStatus.RESIGNED,
            EmploymentStatus.SUSPENDED,
          ],
        },
      })
      .select('email firstName')
      .lean();

    return employees
      .filter((e) => !!e.email)
      .map((e) => ({ email: e.email as string, firstName: e.firstName }));
  }

  private async notifyAllEmployeesOfNewOpening(
    tenantId: string,
    opening: JobOpeningDocument,
  ): Promise<void> {
    const recipients = await this.getActiveEmployeeEmails(tenantId);
    if (recipients.length === 0) return;

    const businessName = await resolveBusinessName(this.userModel, tenantId);

    await Promise.all(
      recipients.map((r) =>
        this.emailService
          .sendNewJobOpeningNotice({
            to: r.email,
            recipientName: r.firstName,
            jobTitle: opening.title,
            businessName,
          })
          .catch(() => {}),
      ),
    );

    opening.vacancyNoticeSentAt = new Date();
    await opening.save();
  }

  private async notifyAllEmployeesOfFilledOpening(
    tenantId: string,
    opening: JobOpeningDocument,
  ): Promise<void> {
    const recipients = await this.getActiveEmployeeEmails(tenantId);
    if (recipients.length === 0) return;

    const businessName = await resolveBusinessName(this.userModel, tenantId);

    await Promise.all(
      recipients.map((r) =>
        this.emailService
          .sendJobOpeningFilledNotice({
            to: r.email,
            recipientName: r.firstName,
            jobTitle: opening.title,
            businessName,
          })
          .catch(() => {}),
      ),
    );
  }
}
