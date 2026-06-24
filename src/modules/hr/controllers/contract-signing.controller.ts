import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { ContractService } from '../services/contract.service';
import {
  SubmitCommentDto,
  SubmitSignatureDto,
  DeclineContractDto,
} from '../dtos/contract.dto';
import { Public } from 'src/common/decorators';

// ═══════════════════════════════════════════════════════════════
// PUBLIC, TOKEN-GATED — deliberately NOT decorated with @UserTypes
// or any auth guard. The signer is frequently a brand-new
// candidate with no platform account at all. Identity/authorization
// here comes ENTIRELY from possessing the opaque token in their
// signing-link email, not from a logged-in session.
// ═══════════════════════════════════════════════════════════════

@ApiTags('Contracts — Public Signing (no auth)')
@Public()
@Controller('contracts/sign')
export class ContractSigningController {
  constructor(private readonly contractService: ContractService) {}

  @Get(':token')
  @ApiOperation({
    summary:
      'View a contract via its signing token; also records a "viewed" interaction',
  })
  async getByToken(@Param('token') token: string) {
    const contract = await this.contractService.getContractByToken(token);
    // Fire-and-forget the view record — a failure here should never
    // block the signer from actually seeing the document.
    this.contractService.recordView(token).catch((err) => {
      console.error(`Failed to record view for token ${token}:`, err);
    });
    return contract;
  }

  @Post(':token/comment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit a comment or requested change before signing',
  })
  submitComment(@Param('token') token: string, @Body() dto: SubmitCommentDto) {
    return this.contractService.submitComment(token, dto.message);
  }

  @Post(':token/sign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign the contract — consumes the token' })
  sign(
    @Param('token') token: string,
    @Body() dto: SubmitSignatureDto,
    @Req() req: Request,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      null;
    const userAgent = req.headers['user-agent'] || null;
    return this.contractService.sign(
      token,
      dto.signerName,
      dto.signatureImageData ?? null,
      ipAddress,
      userAgent,
    );
  }

  @Post(':token/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline the contract' })
  decline(@Param('token') token: string, @Body() dto: DeclineContractDto) {
    return this.contractService.decline(token, dto.reason);
  }
}
