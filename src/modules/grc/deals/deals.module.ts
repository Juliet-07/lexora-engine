import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Clause,
  ClauseSchema,
  Deal,
  DealSchema,
  Precedent,
  PrecedentSchema,
} from './schemas';
import { ClauseService, DealService, PrecedentService } from './services';
import {
  ClauseController,
  DealController,
  PrecedentController,
} from './controllers';
import { User, UserSchema } from 'src/modules/auth/schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Clause.name, schema: ClauseSchema },
      { name: Precedent.name, schema: PrecedentSchema },
      { name: Deal.name, schema: DealSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [ClauseService, PrecedentService, DealService],
  controllers: [ClauseController, PrecedentController, DealController],
  exports: [ClauseService, PrecedentService, DealService],
})
export class DealsModule {}
