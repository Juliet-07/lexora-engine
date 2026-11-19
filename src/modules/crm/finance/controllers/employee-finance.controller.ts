import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { CurrentUser, UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';
import {
  BillService,
  QuoteService,
  VendorService,
  FinanceApprovalService,
} from '../services';
import { CreateBillDto, CreateQuoteDto } from '../dtos';
import { BillPayeeType } from '../schemas';

const billReceiptStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'finance', 'bills');
    if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

const receiptFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const allowed = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/heic',
    'image/webp',
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only PDF or image receipts are allowed'), false);
};

// The employee workspace's Finance page. Any employee can prepare a bill
// or a quote here; neither takes effect until it is approved by a finance
// manager or the account owner, as set in Finance Settings → Approvals.
// No module access is needed — this is self-service, scoped to what the
// person submitted themselves.
@ApiTags('Employee — Finance')
@ApiBearerAuth()
@UserTypes(UserType.EMPLOYEE, UserType.TENANT)
@Controller('employee/finance')
export class EmployeeFinanceController {
  constructor(
    private readonly bills: BillService,
    private readonly quotes: QuoteService,
    private readonly vendors: VendorService,
    private readonly approvals: FinanceApprovalService,
  ) {}

  @Get('vendors')
  @ApiOperation({
    summary: 'Vendors an employee can pick when capturing a bill',
  })
  async vendorOptions(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    const all: any[] = await this.vendors.getAll(t || u);
    return all.map((v) => ({ _id: String(v._id), name: v.name }));
  }

  @Get('bills')
  @ApiOperation({
    summary: 'The bills I submitted, with where each one stands',
  })
  myBills(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.bills.getSubmittedBy(t || u, u);
  }

  @Post('bills')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: billReceiptStorage,
      fileFilter: receiptFileFilter,
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Submit a bill for approval. The vendor receipt/invoice (image or PDF) is required.',
  })
  async createBill(
    @Body() dto: CreateBillDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    if (dto.payeeType === BillPayeeType.BOARD_MEMBER) {
      throw new BadRequestException(
        'Payments to a board member are captured by the finance team.',
      );
    }
    const tenantId = t || u;
    let vendorName: string | null = null;
    if (dto.vendorId) {
      const all: any[] = await this.vendors.getAll(tenantId);
      vendorName =
        all.find((v) => String(v._id) === dto.vendorId)?.name ?? null;
    }
    if (!vendorName && !dto.vendorName) {
      throw new BadRequestException('Say who this bill is from');
    }
    const actor = await this.approvals.actorFor(u, tenantId, userType);
    return this.bills.create(
      tenantId,
      {
        ...dto,
        poId: undefined,
        payeeType: undefined,
        boardMemberId: undefined,
      },
      vendorName,
      file,
      actor,
    );
  }

  @Get('quotes')
  @ApiOperation({
    summary: 'The quotes I prepared, with where each one stands',
  })
  myQuotes(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.quotes.getSubmittedBy(t || u, u);
  }

  @Post('quotes')
  @ApiOperation({ summary: 'Prepare a quote or proforma for approval' })
  async createQuote(
    @Body() dto: CreateQuoteDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
    @CurrentUser('userType') userType: string,
  ) {
    const tenantId = t || u;
    const actor = await this.approvals.actorFor(u, tenantId, userType);
    return this.quotes.create(tenantId, dto, actor);
  }
}
