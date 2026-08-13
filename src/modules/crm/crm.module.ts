import { Module } from '@nestjs/common';
import { CrmRelationsModule } from './crm/crm.module';
import { ProjectsModule } from './projects/project.module';
import { FinanceModule } from './finance/finance.module';

@Module({
  imports: [CrmRelationsModule, ProjectsModule, FinanceModule],
})
export class CrmModule {}
