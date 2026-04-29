import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import {
  Alert, AlertSchema,
  ComplianceCase, ComplianceCaseSchema,
  AuditLog, AuditLogSchema,
} from './schemas/compliance.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Alert.name, schema: AlertSchema },
      { name: ComplianceCase.name, schema: ComplianceCaseSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService, MongooseModule],
})
export class ComplianceModule {}
