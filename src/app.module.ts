import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import {
  APP_GUARD,
  APP_FILTER,
  APP_INTERCEPTOR,
  Reflector,
} from '@nestjs/core';

import { appConfig, databaseConfig, jwtConfig } from './config';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { SuperAdminModule } from './modules/super_admin/super_admin.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { ClientModule } from './modules/clients/client.module';
import { KycModule } from './modules/kyc/kyc.module';

// Guards, Filters, Interceptors
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from 'src/common/interceptors/transform.interceptor';
import { LoggingInterceptor } from 'src/common/interceptors/logging.interceptor';
import { PaymentModule } from './modules/payment/payment.module';
import { HrModule } from './modules/hr/hr.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CrmModule } from './modules/crm/crm.module';
import { GrcModule } from './modules/grc/grc.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig],
      envFilePath: '.env',
    }),
    EventEmitterModule.forRoot(),
    // Database
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('database.uri'),
        connectionFactory: (connection) => {
          connection.on('connected', () => {
            console.log('✅ MongoDB connected');
          });
          connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
          });
          return connection;
        },
      }),
      inject: [ConfigService],
    }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('THROTTLE_TTL', 60),
            limit: configService.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
      inject: [ConfigService],
    }),

    // Scheduled Jobs
    ScheduleModule.forRoot(),

    // Feature Modules
    AuthModule,
    SuperAdminModule,
    TenantModule,
    ClientModule,
    KycModule,
    HrModule,
    CrmModule,
    GrcModule,
    PaymentModule,
    KnowledgeBaseModule,
  ],
  providers: [
    Reflector,
    // Global JWT guard — all routes protected unless @Public()
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global roles guard
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    // Global response transformer
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    // Global request logger
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
