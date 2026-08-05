import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Clause,
  ClauseSchema,
  Deal,
  DealSchema,
  Precedent,
  PrecedentFolder,
  PrecedentFolderSchema,
  PrecedentSchema,
} from './schemas';
import { ClauseService, DealService, PrecedentService } from './services';
import {
  ClauseController,
  DealController,
  PrecedentController,
} from './controllers';
import { User, UserSchema } from 'src/modules/auth/schemas';
import { EmailService } from 'src/common/utils/mailing/email.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Clause.name, schema: ClauseSchema },
      { name: Precedent.name, schema: PrecedentSchema },
      { name: PrecedentFolder.name, schema: PrecedentFolderSchema },
      { name: Deal.name, schema: DealSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [ClauseService, PrecedentService, DealService, EmailService],
  controllers: [ClauseController, PrecedentController, DealController],
  exports: [ClauseService, PrecedentService, DealService],
})
export class DealsModule {}
