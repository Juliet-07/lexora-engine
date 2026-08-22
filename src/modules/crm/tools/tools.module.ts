import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HrModule } from 'src/modules/hr/hr.module';
import { User, UserSchema } from 'src/modules/auth/schemas/user.schema';
import { Comment, CommentSchema, Contract, ContractSchema } from './schemas';
import { CommentService, ContractService } from './services';
import { CommentController, ContractController } from './controllers';

@Module({
  imports: [
    HrModule,
    MongooseModule.forFeature([
      { name: Comment.name, schema: CommentSchema },
      { name: Contract.name, schema: ContractSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [CommentService, ContractService],
  controllers: [CommentController, ContractController],
  exports: [CommentService, ContractService],
})
export class ToolsModule {}
