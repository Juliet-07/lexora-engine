import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Project, ProjectDocument, Task, Milestone } from './schemas/project.schema';
import { CreateProjectDto, UpdateProjectDto, CreateTaskDto, UpdateTaskDto, CreateMilestoneDto } from './dto/project.dto';
import { PaginationDto, paginate } from '../../common/pagination.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(Task.name) private taskModel: Model<any>,
    @InjectModel(Milestone.name) private milestoneModel: Model<any>,
  ) {}

  async createProject(dto: CreateProjectDto, organizationId: string, userId: string): Promise<ProjectDocument> {
    return this.projectModel.create({
      ...dto,
      organizationId: new Types.ObjectId(organizationId),
      managerId: dto.managerId ? new Types.ObjectId(dto.managerId) : new Types.ObjectId(userId),
      clientId: dto.clientId ? new Types.ObjectId(dto.clientId) : null,
      teamMembers: (dto.teamMembers || []).map((id) => new Types.ObjectId(id)),
    });
  }

  async findAll(organizationId: string, pagination: PaginationDto) {
    const { skip, limit, page } = pagination;
    const query = { organizationId: new Types.ObjectId(organizationId) };
    const [data, total] = await Promise.all([
      this.projectModel.find(query).skip(skip).limit(limit)
        .populate('managerId', 'firstName lastName')
        .populate('clientId', 'firstName lastName companyName')
        .lean(),
      this.projectModel.countDocuments(query),
    ]);
    return paginate(data, total, page, limit);
  }

  async findById(id: string, organizationId: string): Promise<ProjectDocument> {
    const project = await this.projectModel.findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .populate('managerId', 'firstName lastName email')
      .populate('teamMembers', 'firstName lastName email')
      .populate('clientId', 'firstName lastName companyName email')
      .lean();
    if (!project) throw new NotFoundException('Project not found');
    return project as ProjectDocument;
  }

  async updateProject(id: string, dto: UpdateProjectDto, organizationId: string): Promise<ProjectDocument> {
    const project = await this.projectModel.findOneAndUpdate(
      { _id: id, organizationId: new Types.ObjectId(organizationId) },
      dto,
      { new: true },
    );
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async deleteProject(id: string, organizationId: string): Promise<void> {
    const project = await this.projectModel.findOneAndDelete({ _id: id, organizationId: new Types.ObjectId(organizationId) });
    if (!project) throw new NotFoundException('Project not found');
    await this.taskModel.deleteMany({ projectId: new Types.ObjectId(id) });
    await this.milestoneModel.deleteMany({ projectId: new Types.ObjectId(id) });
  }

  // Tasks
  async assignTask(dto: CreateTaskDto, organizationId: string): Promise<any> {
    return this.taskModel.create({
      ...dto,
      projectId: new Types.ObjectId(dto.projectId),
      organizationId: new Types.ObjectId(organizationId),
      assignedTo: dto.assignedTo ? new Types.ObjectId(dto.assignedTo) : null,
    });
  }

  async getTasksByProject(projectId: string): Promise<any[]> {
    return this.taskModel.find({ projectId: new Types.ObjectId(projectId) })
      .populate('assignedTo', 'firstName lastName email')
      .lean();
  }

  async updateTask(id: string, dto: UpdateTaskDto): Promise<any> {
    const update: any = { ...dto };
    if (dto.status === 'done') update.completedAt = new Date();
    const task = await this.taskModel.findByIdAndUpdate(id, update, { new: true });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async updateProgress(projectId: string, organizationId: string): Promise<ProjectDocument> {
    const tasks = await this.taskModel.find({ projectId: new Types.ObjectId(projectId) });
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;

    const project = await this.projectModel.findOneAndUpdate(
      { _id: projectId, organizationId: new Types.ObjectId(organizationId) },
      { progress },
      { new: true },
    );
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  // Milestones
  async createMilestone(dto: CreateMilestoneDto): Promise<any> {
    return this.milestoneModel.create({
      ...dto,
      projectId: new Types.ObjectId(dto.projectId),
    });
  }

  async getMilestonesByProject(projectId: string): Promise<any[]> {
    return this.milestoneModel.find({ projectId: new Types.ObjectId(projectId) }).lean();
  }

  async completeMilestone(id: string): Promise<any> {
    const milestone = await this.milestoneModel.findByIdAndUpdate(
      id,
      { isCompleted: true, completedAt: new Date() },
      { new: true },
    );
    if (!milestone) throw new NotFoundException('Milestone not found');
    return milestone;
  }
}
