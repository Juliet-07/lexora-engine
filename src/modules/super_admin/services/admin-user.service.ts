import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../../auth/schemas';
import {
  AccountStatus,
  SuperAdminRole,
  UserType,
} from '../../../common/interfaces/user-role.enum';
import { EmailService } from '../../../common/utils/mailing/email.service';
import { CreateAdminUserDto, UpdateAdminUserDto } from '../dtos/admin-user.dto';

// People with access to the Super Admin app. The platform owner is the one
// account created at registration (adminRole = super_admin); only the owner
// adds, edits and removes everyone else (adminRole = admin). Team members get
// the same app access but cannot manage the team.
@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly mailService: EmailService,
  ) {}

  // Re-read from the database rather than trusting the token: the JWT carries
  // no adminRole, and a role change should take effect immediately.
  private async assertOwner(actorId: string): Promise<void> {
    const actor = await this.userModel
      .findOne({ _id: actorId, userType: UserType.SUPER_ADMIN })
      .select('adminRole')
      .lean();
    if (!actor || actor.adminRole !== SuperAdminRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the platform owner can manage Super Admin app users.',
      );
    }
  }

  private async getMember(id: string): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('User not found');
    const user = await this.userModel.findOne({
      _id: id,
      userType: UserType.SUPER_ADMIN,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // Owner can't be edited/removed through this API — it is the root account.
  private assertNotOwner(user: UserDocument, action: string): void {
    if (user.adminRole === SuperAdminRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        `The platform owner account can't be ${action} here.`,
      );
    }
  }

  private shape(user: any) {
    return {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? null,
      status: user.status,
      adminRole: user.adminRole ?? SuperAdminRole.ADMIN,
      isOwner: user.adminRole === SuperAdminRole.SUPER_ADMIN,
      lastLoginAt: user.lastLoginAt ?? null,
      createdAt: user.createdAt,
    };
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const special = '@#$!';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    pass += special.charAt(Math.floor(Math.random() * special.length));
    pass += Math.floor(Math.random() * 9);
    return pass;
  }

  private async emailCredentials(
    user: { email: string; firstName: string },
    tempPassword: string,
  ): Promise<boolean> {
    try {
      await this.mailService.sendTeamMemberWelcome({
        to: user.email,
        firstName: user.firstName,
        businessName: 'Lexora Platform',
        role: 'Super Admin console user',
        tempPassword,
        loginUrl:
          process.env.SUPER_ADMIN_APP_URL ||
          process.env.ADMIN_APP_URL ||
          process.env.TENANT_APP_URL ||
          '',
      });
      return true;
    } catch (err: any) {
      this.logger.error(
        `Failed to email credentials to ${user.email}: ${err?.message}`,
      );
      return false;
    }
  }

  async list(actorId: string) {
    await this.assertOwner(actorId);
    const users = await this.userModel
      .find({ userType: UserType.SUPER_ADMIN })
      .select('-password -passwordResetToken')
      .sort({ createdAt: 1 })
      .lean();
    return users.map((u) => this.shape(u));
  }

  async create(actorId: string, dto: CreateAdminUserDto) {
    await this.assertOwner(actorId);

    const email = dto.email.toLowerCase().trim();
    if (await this.userModel.findOne({ email })) {
      throw new ConflictException('Email already in use');
    }

    const tempPassword = this.generateTempPassword();
    const user = await this.userModel.create({
      userType: UserType.SUPER_ADMIN,
      adminRole: SuperAdminRole.ADMIN,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email,
      phone: dto.phone?.trim() || undefined,
      password: await bcrypt.hash(tempPassword, 12),
      status: AccountStatus.ACTIVE,
      isEmailVerified: true,
      mustChangePassword: true,
      createdBy: new Types.ObjectId(actorId),
    });

    const emailSent = await this.emailCredentials(user, tempPassword);
    return { user: this.shape(user), emailSent };
  }

  async update(actorId: string, id: string, dto: UpdateAdminUserDto) {
    await this.assertOwner(actorId);
    const user = await this.getMember(id);
    this.assertNotOwner(user, 'edited');

    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      if (email !== user.email) {
        const taken = await this.userModel.findOne({
          email,
          _id: { $ne: user._id },
        });
        if (taken) throw new ConflictException('Email already in use');
        user.email = email;
      }
    }
    if (dto.firstName !== undefined) user.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) user.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) user.phone = dto.phone.trim();
    if (dto.status !== undefined) user.status = dto.status;
    await user.save();

    return this.shape(user);
  }

  // A fresh temporary password, emailed to the user — for someone who lost
  // theirs, or whose welcome email never arrived.
  async resetPassword(actorId: string, id: string) {
    await this.assertOwner(actorId);
    const user = await this.getMember(id);
    this.assertNotOwner(user, 'reset here');

    const tempPassword = this.generateTempPassword();
    user.password = await bcrypt.hash(tempPassword, 12);
    user.mustChangePassword = true;
    await user.save();

    const emailSent = await this.emailCredentials(user, tempPassword);
    return { emailSent };
  }

  async remove(actorId: string, id: string): Promise<void> {
    await this.assertOwner(actorId);
    if (actorId === id) {
      throw new BadRequestException("You can't delete your own account.");
    }
    const user = await this.getMember(id);
    this.assertNotOwner(user, 'deleted');
    await this.userModel.deleteOne({ _id: user._id });
  }
}
