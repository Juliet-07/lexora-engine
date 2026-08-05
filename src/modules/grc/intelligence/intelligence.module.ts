import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PortfolioWorkspace,
  PortfolioWorkspaceSchema,
  Valuation,
  ValuationSchema,
} from './schemas';
import { PortfolioService, ValuationService } from './services';
import { PortfolioController, ValuationController } from './controllers';
import { User, UserSchema } from 'src/modules/auth/schemas';
import { Deal, DealSchema } from '../deals/schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Valuation.name, schema: ValuationSchema },
      { name: User.name, schema: UserSchema },
      { name: PortfolioWorkspace.name, schema: PortfolioWorkspaceSchema },
      { name: Deal.name, schema: DealSchema },
    ]),
  ],
  providers: [ValuationService, PortfolioService],
  controllers: [ValuationController, PortfolioController],
  exports: [ValuationService, PortfolioService],
})
export class IntelligenceModule {}
