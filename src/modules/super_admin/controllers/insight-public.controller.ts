import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorators';
import { InsightService } from '../services';

// Fully unauthenticated — this feeds the public marketing website's
// Insights page and article pages, not an authenticated tenant/admin
// surface. See KnowledgeBaseController for the (different, tenant-
// authenticated) pattern this otherwise mirrors.
@ApiTags('Public — Insights')
@Public()
@Controller('public/insights')
export class InsightPublicController {
  constructor(private readonly service: InsightService) {}

  @Get()
  getPublished() {
    return this.service.getPublished();
  }

  @Get(':slug')
  getOne(@Param('slug') slug: string) {
    return this.service.getPublishedBySlug(slug);
  }
}
