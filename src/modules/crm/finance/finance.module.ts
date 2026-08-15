import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectsModule } from 'src/modules/crm/projects/project.module';
import { HrModule } from 'src/modules/hr/hr.module';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserSchema } from 'src/modules/auth/schemas/user.schema';
import {
  Invoice,
  InvoiceSchema,
  Payment,
  PaymentSchema,
  CreditNote,
  CreditNoteSchema,
  WriteOff,
  WriteOffSchema,
  Quote,
  QuoteSchema,
  RecurringInvoice,
  RecurringInvoiceSchema,
  PaymentPlan,
  PaymentPlanSchema,
  Vendor,
  VendorSchema,
  PurchaseOrder,
  PurchaseOrderSchema,
  Bill,
  BillSchema,
  ExpenseClaim,
  ExpenseClaimSchema,
  ExpensePolicy,
  ExpensePolicySchema,
  BankAccount,
  BankAccountSchema,
  BankTransaction,
  BankTransactionSchema,
  BankRule,
  BankRuleSchema,
  Transfer,
  TransferSchema,
  Reconciliation,
  ReconciliationSchema,
} from './schemas';
import {
  WriteOffService,
  InvoiceService,
  WipService,
  PaymentService,
  CreditNoteService,
  QuoteService,
  RecurringInvoiceService,
  PaymentPlanService,
  VendorService,
  PurchaseOrderService,
  BillService,
  ExpenseClaimService,
  ExpensePolicyService,
  BankAccountService,
  BankTransactionService,
  BankRuleService,
  TransferService,
  ReconciliationService,
  CashForecastService,
} from './services';
import {
  WriteOffController,
  WipController,
  InvoiceController,
  PaymentController,
  CreditNoteController,
  QuoteController,
  RecurringInvoiceController,
  PaymentPlanController,
  VendorController,
  PurchaseOrderController,
  BillController,
  ExpenseClaimController,
  ExpensePolicyController,
  BankAccountController,
  BankTransactionController,
  BankRuleController,
  TransferController,
  ReconciliationController,
  CashForecastController,
} from './controllers';

/**
 * The "Finance" sidebar section — sibling to CrmRelationsModule
 * ("CRM") and ProjectsModule ("Projects"). Depends on ProjectsModule
 * for MandateService (financial documents resolve client/mandate
 * from the real record, not caller-supplied strings) and
 * TimeEntryService (WIP is a real view over approved, billable,
 * not-yet-invoiced time — not a separate parallel entity). Also
 * depends on HrModule for PayrollRunService — Cash Forecast reads
 * real processed-but-unpaid payroll runs, not a separate number.
 *
 * Internal dependency shape: WriteOffService is the leaf everything
 * else in this module writes to — WipService, InvoiceService and
 * CreditNoteService all create WriteOff records as a side effect of
 * their own real actions, giving one real audit trail across all
 * three checkpoints of the write-off lifecycle instead of three
 * disconnected ones. InvoiceService is the hub the rest (Payment,
 * CreditNote, Quote, RecurringInvoice, PaymentPlan) depend on for
 * invoice totals and stage changes, and also depends on
 * ExpenseClaimService for the disbursement half of WIP. Banking's
 * BankAccountService never stores a balance — it's always computed
 * from real transactions and transfers — and CashForecastService is
 * entirely computed too, pulling real AR from InvoiceService, real
 * AP from BillService, real payroll from HrModule, and real current
 * cash from BankAccountService, with no stored forecast entity at all.
 */
@Module({
  imports: [
    ProjectsModule,
    HrModule,
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: CreditNote.name, schema: CreditNoteSchema },
      { name: WriteOff.name, schema: WriteOffSchema },
      { name: Quote.name, schema: QuoteSchema },
      { name: RecurringInvoice.name, schema: RecurringInvoiceSchema },
      { name: PaymentPlan.name, schema: PaymentPlanSchema },
      { name: Vendor.name, schema: VendorSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: Bill.name, schema: BillSchema },
      { name: ExpenseClaim.name, schema: ExpenseClaimSchema },
      { name: ExpensePolicy.name, schema: ExpensePolicySchema },
      { name: BankAccount.name, schema: BankAccountSchema },
      { name: BankTransaction.name, schema: BankTransactionSchema },
      { name: BankRule.name, schema: BankRuleSchema },
      { name: Transfer.name, schema: TransferSchema },
      { name: Reconciliation.name, schema: ReconciliationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [
    WriteOffService,
    InvoiceService,
    WipService,
    PaymentService,
    CreditNoteService,
    QuoteService,
    RecurringInvoiceService,
    PaymentPlanService,
    VendorService,
    PurchaseOrderService,
    BillService,
    ExpenseClaimService,
    ExpensePolicyService,
    BankAccountService,
    BankTransactionService,
    BankRuleService,
    TransferService,
    ReconciliationService,
    CashForecastService,
    EmailService,
  ],
  controllers: [
    WriteOffController,
    WipController,
    InvoiceController,
    PaymentController,
    CreditNoteController,
    QuoteController,
    RecurringInvoiceController,
    PaymentPlanController,
    VendorController,
    PurchaseOrderController,
    BillController,
    ExpenseClaimController,
    ExpensePolicyController,
    BankAccountController,
    BankTransactionController,
    BankRuleController,
    TransferController,
    ReconciliationController,
    CashForecastController,
  ],
  exports: [InvoiceService, WriteOffService],
})
export class FinanceModule {}
