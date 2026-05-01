import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument, Session, SessionDocument } from './schemas';
import {
  RegisterDto,
  LoginDto,
  ChangePasswordDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import {
  AccountStatus,
  SuperAdminRole,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import {
  ClientProfileDocument,
  ClientProfileRecord,
} from '../tenant/schemas/client-profile.schema';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(ClientProfileRecord.name)
    private clientProfileModel: Model<ClientProfileDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({
      userType: UserType.SUPER_ADMIN,
    });
    if (existing)
      throw new ForbiddenException(
        'Super admin already exists. Contact your system administrator',
      );

    const emailTaken = await this.userModel.findOne({ email: dto.email });
    if (emailTaken) throw new ConflictException('Email already in use');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.userModel.create({
      userType: UserType.SUPER_ADMIN,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      password: hashed,
      adminRole: SuperAdminRole.SUPER_ADMIN,
      status: AccountStatus.ACTIVE,
      isEmailVerified: true,
    });

    return { user: this.sanitize(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .select('+password');

    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.status === AccountStatus.SUSPENDED) {
      throw new UnauthorizedException(
        'Account has been suspended. Contact support',
      );
    }

    if (user.status === AccountStatus.INACTIVE) {
      throw new UnauthorizedException(
        'Account is inactive. Contact your administrator',
      );
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // if (user.status === AccountStatus.PENDING) {
    //   user.status = AccountStatus.ACTIVE;
    // }

    const wasPending = user.status === AccountStatus.PENDING;

    const updatedUser = await this.userModel.findByIdAndUpdate(
      user._id,
      {
        lastLoginAt: new Date(),
        ...(wasPending && {
          status: AccountStatus.ACTIVE,
        }),
      },
      { new: true },
    );

    const tokens = await this.generateAccessToken(updatedUser);
    await this.saveSession(updatedUser, tokens.refreshToken);

    // ── Attach KYC context for client users ──────────────────
    let kycContext: {
      kycStatus: string;
      profileCompletionPercent: number;
      hasDraft: boolean;
    } | null = null;

    if (updatedUser.userType === UserType.CLIENT) {
      const profile = await this.clientProfileModel
        .findOne({ userId: updatedUser._id })
        .select('kycStatus profileCompletionPercent metadata')
        .lean();

      const kycStatus = profile?.kycStatus ?? 'not_started';
      const completionPercent = profile?.profileCompletionPercent ?? 0;
      const hasDraft = completionPercent > 0 && kycStatus === 'not_started';

      kycContext = {
        kycStatus,
        profileCompletionPercent: completionPercent,
        hasDraft,
      };
    }

    return {
      user: this.sanitize(updatedUser),
      tokens,
      ...(kycContext && { kycContext }),
    };
  }

  async getProfile(userId: string): Promise<object> {
    const user = await this.userModel
      .findById(userId)
      .populate('tenantId', 'firstName lastName email tenantProfile')
      .populate('createdBy', 'firstName lastName email')
      .lean();

    if (!user) throw new NotFoundException('User not found');
    return user as UserDocument;
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userModel.findById(userId).select('+password');
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    const hashed = await bcrypt.hash(dto.newPassword, 12);

    await this.userModel.findByIdAndUpdate(user._id, {
      password: hashed,
      mustChangePassword: false,
    });

    await this.sessionModel.updateMany(
      { userId: new Types.ObjectId(userId) },
      { isActive: false },
    );
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────
  private async generateAccessToken(user: UserDocument) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      userType: user.userType,
      roles: user.roles,
      tenantId: user.tenantId?.toString() || null,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('jwt.secret'),
        expiresIn: this.configService.get('jwt.expiresIn'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('jwt.refreshSecret'),
        expiresIn: this.configService.get('jwt.refreshExpiresIn'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async saveSession(
    user: UserDocument,
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.sessionModel.create({
      userId: user._id,
      userType: user.userType,
      tenantId: user.tenantId || null,
      refreshToken,
      expiresAt,
      ipAddress,
      userAgent,
    });
  }

  private sanitize(user: UserDocument) {
    const obj = user.toObject ? user.toObject() : { ...user };
    delete obj.password;
    delete obj.passwordResetToken;
    return obj;
  }
}
