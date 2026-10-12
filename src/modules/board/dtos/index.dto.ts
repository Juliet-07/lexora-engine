import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

// ── Board Directory messaging ───────────────────────────────────
export class SendBoardMessageDto {
  @ApiProperty() @IsString() @MinLength(1) body: string;
}

// ── Profile & Settings ───────────────────────────────────────────
// Deliberately NOT reusing AuthController's own UpdateProfileDto —
// that one is firstName/lastName/phone only and explicitly leaves
// email out (see AuthService#updateProfile); a board member's own
// profile form edits phone AND email, and an email change also has
// to keep BoardMember.email in step (see
// BoardMemberService#updateMyProfile), so this gets its own small DTO
// rather than stretching that one's meaning.
export class UpdateMyBoardProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  // Lives on BoardMember, not User (PO, Oct 2026: "let bio be part of
  // the details the board member can update and this will also
  // update the bio in the tenant's end as well") — the same field the
  // tenant's own Board Management > Personal details already reads.
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
}
