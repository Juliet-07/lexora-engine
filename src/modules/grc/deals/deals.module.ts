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
import {
  ClauseService,
  DealContractService,
  DealService,
  PrecedentService,
} from './services';
import {
  ClauseController,
  DealContractController,
  DealController,
  PrecedentController,
} from './controllers';
import { User, UserSchema } from 'src/modules/auth/schemas';
import { EmailService } from 'src/common/utils/mailing/email.service';
// Deal contracts are generated through Contract Management's own service,
// so a deal contract is a real CRM contract. One-way dependency: ToolsModule
// never imports DealsModule (it reads the clause library through a directly
// registered model instead — see ToolsModule).
import { ToolsModule } from 'src/modules/crm/tools/tools.module';

@Module({
  imports: [
    ToolsModule,
    MongooseModule.forFeature([
      { name: Clause.name, schema: ClauseSchema },
      { name: Precedent.name, schema: PrecedentSchema },
      { name: PrecedentFolder.name, schema: PrecedentFolderSchema },
      { name: Deal.name, schema: DealSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [
    ClauseService,
    PrecedentService,
    DealService,
    DealContractService,
    EmailService,
  ],
  controllers: [
    ClauseController,
    PrecedentController,
    DealController,
    DealContractController,
  ],
  exports: [ClauseService, PrecedentService, DealService],
})
export class DealsModule {}
