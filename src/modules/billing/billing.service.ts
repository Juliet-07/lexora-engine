import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Invoice, InvoiceDocument, InvoiceStatus,
  Transaction, TransactionDocument,
} from './schemas/billing.schema';
import {
  CreateInvoiceDto, UpdateInvoiceDto, UpdateInvoiceStatusDto, ProcessPaymentDto,
} from './dto/billing.dto';
import { PaginationDto, paginate } from '../../common/pagination.dto';

@Injectable()
export class BillingService {
  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
  ) {}

  private generateInvoiceNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `INV-${timestamp}-${random}`;
  }

  private calculateTotals(lineItems: any[], taxRate = 0, discountAmount = 0) {
    const subtotal = lineItems.reduce((sum, item) => {
      item.total = item.quantity * item.unitPrice;
      return sum + item.total;
    }, 0);
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = (afterDiscount * taxRate) / 100;
    const totalAmount = afterDiscount + taxAmount;
    return { subtotal, taxAmount, totalAmount };
  }

  async createInvoice(dto: CreateInvoiceDto, organizationId: string): Promise<InvoiceDocument> {
    const { subtotal, taxAmount, totalAmount } = this.calculateTotals(
      dto.lineItems,
      dto.taxRate || 0,
      dto.discountAmount || 0,
    );

    return this.invoiceModel.create({
      ...dto,
      invoiceNumber: this.generateInvoiceNumber(),
      organizationId: new Types.ObjectId(organizationId),
      clientId: new Types.ObjectId(dto.clientId),
      projectId: dto.projectId ? new Types.ObjectId(dto.projectId) : null,
      subtotal,
      taxAmount,
      totalAmount,
      taxRate: dto.taxRate || 0,
      discountAmount: dto.discountAmount || 0,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
    });
  }

  async findAll(organizationId: string, pagination: PaginationDto, status?: InvoiceStatus) {
    const query: any = { organizationId: new Types.ObjectId(organizationId) };
    if (status) query.status = status;

    const { skip, limit, page } = pagination;
    const [data, total] = await Promise.all([
      this.invoiceModel.find(query).skip(skip).limit(limit)
        .populate('clientId', 'firstName lastName companyName email')
        .populate('projectId', 'name')
        .sort({ createdAt: -1 })
        .lean(),
      this.invoiceModel.countDocuments(query),
    ]);
    return paginate(data, total, page, limit);
  }

  async findById(id: string, organizationId: string): Promise<InvoiceDocument> {
    const invoice = await this.invoiceModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .populate('clientId', 'firstName lastName companyName email')
      .populate('projectId', 'name')
      .lean();
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice as InvoiceDocument;
  }

  async findByClient(clientId: string, organizationId: string, pagination: PaginationDto) {
    const query = {
      clientId: new Types.ObjectId(clientId),
      organizationId: new Types.ObjectId(organizationId),
    };
    const { skip, limit, page } = pagination;
    const [data, total] = await Promise.all([
      this.invoiceModel.find(query).skip(skip).limit(limit).sort({ createdAt: -1 }).lean(),
      this.invoiceModel.countDocuments(query),
    ]);
    return paginate(data, total, page, limit);
  }

  async updateInvoice(id: string, dto: UpdateInvoiceDto, organizationId: string): Promise<InvoiceDocument> {
    const existing = await this.invoiceModel.findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) });
    if (!existing) throw new NotFoundException('Invoice not found');
    if (existing.status === InvoiceStatus.PAID) throw new BadRequestException('Cannot edit a paid invoice');

    const updates: any = { ...dto };
    if (dto.lineItems) {
      const { subtotal, taxAmount, totalAmount } = this.calculateTotals(
        dto.lineItems,
        dto.taxRate ?? existing.taxRate,
        dto.discountAmount ?? existing.discountAmount,
      );
      Object.assign(updates, { subtotal, taxAmount, totalAmount });
    }

    const updated = await this.invoiceModel.findByIdAndUpdate(id, updates, { new: true });
    return updated;
  }

  async updateInvoiceStatus(id: string, dto: UpdateInvoiceStatusDto, organizationId: string): Promise<InvoiceDocument> {
    const update: any = { status: dto.status };
    if (dto.status === InvoiceStatus.SENT) update.sentAt = new Date();
    if (dto.status === InvoiceStatus.PAID) update.paidAt = new Date();

    const invoice = await this.invoiceModel.findOneAndUpdate(
      { _id: id, organizationId: new Types.ObjectId(organizationId) },
      update,
      { new: true },
    );
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async processPayment(dto: ProcessPaymentDto, organizationId: string): Promise<TransactionDocument> {
    const invoice = await this.invoiceModel.findOne({
      _id: dto.invoiceId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) throw new BadRequestException('Invoice already fully paid');
    if (dto.amount > invoice.totalAmount - invoice.paidAmount) {
      throw new BadRequestException('Payment amount exceeds outstanding balance');
    }

    const transaction = await this.transactionModel.create({
      invoiceId: new Types.ObjectId(dto.invoiceId),
      organizationId: new Types.ObjectId(organizationId),
      clientId: invoice.clientId,
      amount: dto.amount,
      currency: invoice.currency,
      paymentMethod: dto.paymentMethod,
      reference: dto.reference,
      notes: dto.notes,
    });

    const newPaidAmount = invoice.paidAmount + dto.amount;
    const newStatus = newPaidAmount >= invoice.totalAmount
      ? InvoiceStatus.PAID
      : InvoiceStatus.PARTIALLY_PAID;

    await this.invoiceModel.findByIdAndUpdate(invoice._id, {
      paidAmount: newPaidAmount,
      status: newStatus,
      paidAt: newStatus === InvoiceStatus.PAID ? new Date() : null,
    });

    return transaction;
  }

  async getTransactionsByInvoice(invoiceId: string): Promise<TransactionDocument[]> {
    return this.transactionModel
      .find({ invoiceId: new Types.ObjectId(invoiceId) })
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  async getBillingStats(organizationId: string) {
    const stats = await this.invoiceModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId) } },
      {
        $group: {
          _id: null,
          totalInvoiced: { $sum: '$totalAmount' },
          totalPaid: { $sum: '$paidAmount' },
          totalOutstanding: {
            $sum: {
              $cond: [
                { $in: ['$status', ['sent', 'overdue', 'partially_paid']] },
                { $subtract: ['$totalAmount', '$paidAmount'] },
                0,
              ],
            },
          },
          countDraft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
          countSent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          countPaid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
          countOverdue: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } },
        },
      },
    ]);
    return stats[0] || {};
  }

  async markOverdueInvoices(): Promise<number> {
    const result = await this.invoiceModel.updateMany(
      {
        status: { $in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
        dueDate: { $lt: new Date() },
      },
      { $set: { status: InvoiceStatus.OVERDUE } },
    );
    return result.modifiedCount;
  }
}
