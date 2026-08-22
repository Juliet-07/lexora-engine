import { Module } from '@nestjs/common';
import { CrmRelationsModule } from './crm/crm.module';
import { ProjectsModule } from './projects/project.module';
import { FinanceModule } from './finance/finance.module';
import { ToolsModule } from './tools/tools.module';

@Module({
  imports: [CrmRelationsModule, ProjectsModule, FinanceModule, ToolsModule],
})
export class CrmModule {}
