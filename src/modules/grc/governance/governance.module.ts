import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  GovernanceMeeting,
  GovernanceMeetingSchema,
  Committee,
  CommitteeSchema,
  BoardMember,
  BoardMemberSchema,
  GovernanceCode,
  GovernanceCodeSchema,
} from './schemas';
import {
  MeetingService,
  CommitteeService,
  BoardMemberService,
  GovernanceCodeService,
  MeetingAckReminderService,
} from './services';
import {
  MeetingController,
  CommitteeController,
  BoardMemberController,
  GovernanceCodeController,
} from './controllers';
import { User, UserSchema } from 'src/modules/auth/schemas';
import { EmailService } from 'src/common/utils/mailing/email.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GovernanceMeeting.name, schema: GovernanceMeetingSchema },
      { name: Committee.name, schema: CommitteeSchema },
      { name: BoardMember.name, schema: BoardMemberSchema },
      { name: GovernanceCode.name, schema: GovernanceCodeSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [
    MeetingService,
    CommitteeService,
    BoardMemberService,
    GovernanceCodeService,
    EmailService,
    MeetingAckReminderService,
  ],
  controllers: [
    MeetingController,
    CommitteeController,
    BoardMemberController,
    GovernanceCodeController,
  ],
  exports: [
    MeetingService,
    CommitteeService,
    BoardMemberService,
    GovernanceCodeService,
  ],
})
export class GovernanceModule {}
