import { Module } from '@nestjs/common';
import { CrmRelationsModule } from './crm/crm.module';
import { ProjectsModule } from './projects/project.module';

@Module({
  imports: [CrmRelationsModule, ProjectsModule],
})
export class CrmModule {}
