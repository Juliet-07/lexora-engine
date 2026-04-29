import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas';
import { AccountStatus } from '../../../common/interfaces/user-role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  userType: string;
  roles: string[];
  tenantId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,

    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    const secret = configService.get<string>('jwt.secret');
    console.log(
      '🔑 JWT secret resolved:',
      secret ? `${secret.slice(0, 6)}...` : 'UNDEFINED ❌',
    );

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
    // Temporarily add to JwtStrategy constructor
    console.log('JWT Secret:', configService.get<string>('jwt.secret'));
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    console.log('🔑 JWT validate called, payload:', payload);

    const user = await this.userModel
      .findById(payload.sub)
      .select('status userType')
      .lean();

    console.log('👤 User found:', user);

    if (!user) throw new UnauthorizedException('User not found');
    if (user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // Return the full payload — attached to request.user
    return payload;
  }
}
