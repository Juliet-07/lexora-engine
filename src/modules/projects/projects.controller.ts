import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto, CreateTaskDto, UpdateTaskDto, CreateMilestoneDto } from './dto/project.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/index';
import { PaginationDto } from '../../common/pagination.dto';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.createProject(dto, orgId, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List all projects' })
  findAll(@CurrentUser('organizationId') orgId: string, @Query() pagination: PaginationDto) {
    return this.service.findAll(orgId, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  findOne(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return this.service.findById(id, orgId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.updateProject(id, dto, orgId);
  }

  @Patch(':id/progress')
  @ApiOperation({ summary: 'Recalculate project progress from tasks' })
  updateProgress(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return this.service.updateProgress(id, orgId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete project and its tasks/milestones' })
  delete(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return this.service.deleteProject(id, orgId);
  }

  // Tasks
  @Post('tasks')
  @ApiOperation({ summary: 'Create and assign a task' })
  createTask(@Body() dto: CreateTaskDto, @CurrentUser('organizationId') orgId: string) {
    return this.service.assignTask(dto, orgId);
  }

  @Get(':id/tasks')
  @ApiOperation({ summary: 'Get all tasks for a project' })
  getTasks(@Param('id') projectId: string) {
    return this.service.getTasksByProject(projectId);
  }

  @Patch('tasks/:id')
  @ApiOperation({ summary: 'Update task status/details' })
  updateTask(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.service.updateTask(id, dto);
  }

  // Milestones
  @Post('milestones')
  @ApiOperation({ summary: 'Create a milestone' })
  createMilestone(@Body() dto: CreateMilestoneDto) {
    return this.service.createMilestone(dto);
  }

  @Get(':id/milestones')
  @ApiOperation({ summary: 'Get milestones for a project' })
  getMilestones(@Param('id') projectId: string) {
    return this.service.getMilestonesByProject(projectId);
  }

  @Patch('milestones/:id/complete')
  @ApiOperation({ summary: 'Mark milestone as completed' })
  completeMilestone(@Param('id') id: string) {
    return this.service.completeMilestone(id);
  }
}
