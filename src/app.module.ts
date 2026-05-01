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
import { ClientsModule } from './modules/clients/clients.module';
import { KycModule } from './modules/kyc/kyc.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { BillingModule } from './modules/billing/billing.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { JobsModule } from './modules/jobs/jobs.module';

// Guards, Filters, Interceptors
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig],
      envFilePath: '.env',
    }),

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
    ClientsModule,
    KycModule,
    DocumentsModule,
    ProjectsModule,
    BillingModule,
    CommunicationsModule,
    ComplianceModule,
    ReportingModule,
    JobsModule,
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
