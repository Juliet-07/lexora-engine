import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const appName = configService.get<string>('app.name', 'Lexora Engine');
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');

  // ─── Global Prefix ──────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ─── CORS ───────────────────────────────────────────────────
  app.enableCors({
    origin: nodeEnv === 'production' ? [] : '*',
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ─── Global Validation Pipe ─────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── Swagger Documentation ──────────────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(appName)
      .setDescription('LEXORA API DOCUMENTATION')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          in: 'header',
        },
        'bearerAuth',
      )
      .addTag('Auth', 'Authentication & User Management')
      .addTag(
        'SuperAdmin',
        'Super Admin System | Manages Tenants, Subscriptions, General System Settings',
      )
      .addTag('Tenant', 'Tenant Management System')
      .addTag('Clients', 'Client lifecycle management')
      .addTag('KYC / AML', 'KYC submission, risk scoring, screening')
      .addTag('Documents', 'Document management and e-signatures')
      .addTag('Projects', 'Project, task and milestone management')
      .addTag('Billing', 'Invoices and payment processing')
      .addTag('Communications', 'Messaging and notifications')
      .addTag(
        'Compliance & Alerts',
        'Compliance monitoring and case management',
      )
      .addTag('Reporting', 'Analytics and reporting')
      .addTag('Background Jobs', 'Cron job management')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        docExpansion: 'none',
        // filter: true,
        showExtensions: true,
      },
      customSiteTitle: `${appName} — API Docs`,
      customCss: `
        .swagger-ui .topbar { background-color: #1a1a2e; }
        .swagger-ui .topbar .download-url-wrapper { display: none; }
        .swagger-ui .info .title { color: #1a1a2e; }
      `,
    });

    logger.log(
      `📚 Swagger docs available at: http://localhost:${port}/api/docs`,
    );
  }

  await app.listen(port);
  logger.log(`🚀 ${appName} running on http://localhost:${port}/api`);
  logger.log(`🌍 Environment: ${nodeEnv}`);
}

bootstrap();
