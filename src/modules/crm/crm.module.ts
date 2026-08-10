import { Module } from '@nestjs/common';
import { CrmRelationsModule } from './crm/crm.module';

@Module({
  imports: [CrmRelationsModule],
})
export class CrmModule {}
