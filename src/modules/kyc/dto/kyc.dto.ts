import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsArray,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import {
  AlertStatus,
  AlertSeverity,
  AlertType,
} from '../schemas/compliance-alert.schema';
import {
  RuleType,
  RuleCondition,
  RuleAction,
} from '../schemas/risk-rule.schema';
import {
  TransactionType,
  TransactionStatus,
} from '../schemas/transaction.schema';
import { StrStatus } from '../schemas/str.schema';
import {
  WatchlistType,
  WatchlistEntityType,
} from '../schemas/watchlist.schema';

// ── Risk Engine ───────────────────────────────────────────────

export class CreateRiskRuleDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: RuleType }) @IsEnum(RuleType) ruleType: RuleType;
  @ApiProperty() @IsString() field: string;
  @ApiProperty({ enum: RuleCondition })
  @IsEnum(RuleCondition)
  condition: RuleCondition;
  @ApiProperty() @IsString() value: string;
  @ApiProperty({ enum: RuleAction }) @IsEnum(RuleAction) action: RuleAction;
}

export class UpdateRiskRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: RuleCondition })
  @IsOptional()
  @IsEnum(RuleCondition)
  condition?: RuleCondition;
  @ApiPropertyOptional() @IsOptional() @IsString() value?: string;
  @ApiPropertyOptional({ enum: RuleAction })
  @IsOptional()
  @IsEnum(RuleAction)
  action?: RuleAction;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateRiskScenarioDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ type: [String] }) @IsArray() ruleIds: string[];
  @ApiProperty({ enum: ['AND', 'OR'] }) @IsEnum(['AND', 'OR']) logic:
    | 'AND'
    | 'OR';
  @ApiProperty({
    enum: ['flag_high', 'flag_medium', 'flag_low', 'create_alert', 'block'],
  })
  @IsString()
  action: string;
}

export class OverrideRiskLevelDto {
  @ApiProperty({ enum: ['low', 'medium', 'high', 'critical'] })
  @IsEnum(['low', 'medium', 'high', 'critical'])
  riskLevel: string;

  @ApiProperty() @IsString() reason: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
}

export class RiskEngineFilterDto {
  @ApiPropertyOptional({
    enum: ['low', 'medium', 'high', 'critical', 'unrated'],
  })
  @IsOptional()
  @IsString()
  riskLevel?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

// ── Transaction Monitoring ────────────────────────────────────

export class LogTransactionDto {
  @ApiProperty() @IsString() clientId: string;
  @ApiProperty() @IsNumber() amount: number;
  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;
  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  type: TransactionType;
  @ApiProperty() @IsDateString() transactionDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() counterpartyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() counterpartyBank?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() counterpartyCountry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() counterpartyAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class TransactionFilterDto {
  @ApiPropertyOptional({ enum: TransactionStatus })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;
  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
}

export class ReviewTransactionDto {
  @ApiProperty({ description: 'true = clear the flag, false = keep flagged' })
  @IsBoolean()
  clearFlag: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

// ── Compliance Alerts ─────────────────────────────────────────

export class CreateManualAlertDto {
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiProperty({ enum: AlertSeverity })
  @IsEnum(AlertSeverity)
  severity: AlertSeverity;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() description: string;
}

export class UpdateAlertDto {
  @ApiProperty({ enum: AlertStatus }) @IsEnum(AlertStatus) status: AlertStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() reviewNote?: string;
}

export class AlertFilterDto {
  @ApiPropertyOptional({ enum: AlertStatus })
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;
  @ApiPropertyOptional({ enum: AlertSeverity })
  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;
  @ApiPropertyOptional({ enum: AlertType })
  @IsOptional()
  @IsEnum(AlertType)
  type?: AlertType;
}

// ── STR ───────────────────────────────────────────────────────

export class CreateStrDto {
  @ApiProperty() @IsString() clientId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() transactionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() relatedCaseId?: string;
  @ApiProperty() @IsString() customerName: string;
  @ApiProperty() @IsNumber() amount: number;
  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;
  @ApiProperty() @IsDateString() transactionDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiProperty() @IsString() descriptionOfActivity: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  additionalInformation?: string;
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  saveAsDraft?: boolean;
}

export class UpdateStrDto {
  @ApiPropertyOptional() @IsOptional() @IsString() relatedCaseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() transactionDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descriptionOfActivity?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  additionalInformation?: string;
}

export class SubmitStrDto {
  @ApiPropertyOptional() @IsOptional() @IsString() goAmlReference?: string;
}

// ── Watchlist ─────────────────────────────────────────────────

export class AddWatchlistEntryDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() aliases?: string;
  @ApiProperty({ enum: WatchlistEntityType })
  @IsEnum(WatchlistEntityType)
  entityType: WatchlistEntityType;
  @ApiProperty({ enum: WatchlistType })
  @IsEnum(WatchlistType)
  listType: WatchlistType;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class AdHocScreeningDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional({ enum: WatchlistType })
  @IsOptional()
  @IsEnum(WatchlistType)
  listType?: WatchlistType;
  @ApiPropertyOptional({
    description: 'Also check live against OpenSanctions API',
  })
  @IsOptional()
  @IsBoolean()
  checkLive?: boolean;
}

export class WatchlistFilterDto {
  @ApiPropertyOptional({ enum: WatchlistType })
  @IsOptional()
  @IsEnum(WatchlistType)
  listType?: WatchlistType;
  @ApiPropertyOptional({ enum: WatchlistEntityType })
  @IsOptional()
  @IsEnum(WatchlistEntityType)
  entityType?: WatchlistEntityType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
