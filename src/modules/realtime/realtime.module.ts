import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';

// @Global() — same convention EventEmitterModule.forRoot() already
// uses in app.module.ts — so RealtimeGateway can be injected directly
// into services living in other feature modules (BoardMessagingService,
// BoardNotificationService, both under src/modules/board) without
// those modules having to import this one explicitly, and without
// creating any module-import cycle back the other way.
//
// Its own JwtModule registration is separate from AuthModule's (which
// is exported, but importing AuthModule here for one service would
// pull in its controllers/schemas for no reason) — same secret, same
// config key, just scoped to what this module actually needs: a
// JwtService to verify a socket's handshake token.
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
