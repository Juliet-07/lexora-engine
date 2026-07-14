import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import {
  Course,
  CourseDocument,
  CourseEnrollment,
  CourseEnrollmentDocument,
  CourseKind,
  EnrollmentStatus,
  Employee,
  EmployeeDocument,
  EmploymentStatus,
} from '../schemas';
import { CreateCourseDto, UpdateCourseDto, SubmitAssessmentDto } from '../dtos';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { CertificatePdfService } from './certificate-pdf.service';

@Injectable()
export class LearningService {
  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(CourseEnrollment.name)
    private readonly enrollmentModel: Model<CourseEnrollmentDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly emailService: EmailService,
    private readonly certificatePdfService: CertificatePdfService,
  ) {}

  // ── Tenant: create / update / delete ────────────────────────

  async createCourse(
    tenantId: string,
    dto: CreateCourseDto,
    file: Express.Multer.File | undefined,
    businessName: string,
  ): Promise<CourseDocument> {
    const mandatory = dto.mandatory === true || dto.mandatory === 'true';
    const durationMinutes = Number(dto.durationMinutes);
    const passMark = Number(dto.passMark);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      throw new BadRequestException(
        'Duration must be a positive number of minutes.',
      );
    }
    if (!Number.isFinite(passMark) || passMark < 0 || passMark > 100) {
      throw new BadRequestException('Pass mark must be between 0 and 100.');
    }

    const asset = this.buildAsset(dto.kind, dto.externalUrl, file);
    const questions = this.parseQuestions(dto.questions);

    const course = await this.courseModel.create({
      tenantId: new Types.ObjectId(tenantId),
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      category: dto.category.trim(),
      kind: dto.kind,
      mandatory,
      durationMinutes,
      asset,
      assessment: { passMark, questions },
    });

    this.notifyAllEmployeesOfNewCourse(tenantId, course, businessName).catch(
      () => {},
    );

    return course;
  }

  async updateCourse(
    tenantId: string,
    courseId: string,
    dto: UpdateCourseDto,
    file: Express.Multer.File | undefined,
  ): Promise<CourseDocument> {
    const course = await this.getCourseOrThrow(tenantId, courseId);

    if (dto.title !== undefined) course.title = dto.title.trim();
    if (dto.description !== undefined)
      course.description = dto.description.trim() || null;
    if (dto.category !== undefined) course.category = dto.category.trim();
    if (dto.kind !== undefined) course.kind = dto.kind;
    if (dto.mandatory !== undefined)
      course.mandatory = dto.mandatory === true || dto.mandatory === 'true';
    if (dto.durationMinutes !== undefined) {
      const d = Number(dto.durationMinutes);
      if (!Number.isFinite(d) || d < 1) {
        throw new BadRequestException(
          'Duration must be a positive number of minutes.',
        );
      }
      course.durationMinutes = d;
    }
    if (dto.passMark !== undefined) {
      const p = Number(dto.passMark);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        throw new BadRequestException('Pass mark must be between 0 and 100.');
      }
      course.assessment.passMark = p;
    }
    if (dto.questions !== undefined) {
      course.assessment.questions = this.parseQuestions(dto.questions);
    }
    if (file || dto.externalUrl !== undefined || dto.kind !== undefined) {
      course.asset = this.buildAsset(
        course.kind,
        dto.externalUrl,
        file,
        course.asset,
      );
    }

    course.markModified('assessment');
    course.markModified('asset');
    await course.save();
    return course;
  }

  async deleteCourse(tenantId: string, courseId: string): Promise<void> {
    const course = await this.getCourseOrThrow(tenantId, courseId);
    await this.enrollmentModel.deleteMany({ courseId: course._id });
    await this.courseModel.deleteOne({ _id: course._id });
  }

  async getAllForTenant(tenantId: string): Promise<CourseDocument[]> {
    return this.courseModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  async getOneForTenant(
    tenantId: string,
    courseId: string,
  ): Promise<CourseDocument> {
    return this.getCourseOrThrow(tenantId, courseId);
  }

  // ── Tenant: stats & leaderboard ──────────────────────────────

  async getCourseStats(tenantId: string, courseId: string) {
    const tId = new Types.ObjectId(tenantId);
    const cId = new Types.ObjectId(courseId);

    const [enrollments, activeHeadcount] = await Promise.all([
      this.enrollmentModel.find({ tenantId: tId, courseId: cId }).lean(),
      this.employeeModel.countDocuments({
        tenantId: tId,
        employmentStatus: {
          $nin: [
            EmploymentStatus.TERMINATED,
            EmploymentStatus.RESIGNED,
            EmploymentStatus.SUSPENDED,
          ],
        },
      }),
    ]);

    const completed = enrollments.filter(
      (e) => e.status === EnrollmentStatus.COMPLETED,
    );
    const scores = completed
      .map((e) => e.bestScore)
      .filter((s): s is number => s != null);
    const avgScore =
      scores.length > 0
        ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
        : 0;

    return {
      enrolled: enrollments.length,
      completed: completed.length,
      avgScore,
      // Measured against the whole active workforce, not just those
      // who started — a mandatory course's real completion rate is
      // about who HASN'T engaged yet, not just among self-starters.
      completionRate:
        activeHeadcount > 0
          ? Math.round((completed.length / activeHeadcount) * 100)
          : 0,
    };
  }

  async getCourseLeaderboard(tenantId: string, courseId: string, limit = 20) {
    const enrollments = await this.enrollmentModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        courseId: new Types.ObjectId(courseId),
        status: EnrollmentStatus.COMPLETED,
      })
      .sort({ bestScore: -1, attempts: 1 })
      .limit(limit)
      .lean();

    return enrollments.map((e) => ({
      employeeId: e.employeeId.toString(),
      employeeName: e.employeeName,
      bestScore: e.bestScore,
      attempts: e.attempts,
      completedAt: e.completedAt,
    }));
  }

  // ── Employee self-service ────────────────────────────────────

  async getCoursesForEmployee(tenantId: string, employeeId: string) {
    const tId = new Types.ObjectId(tenantId);
    const [courses, enrollments] = await Promise.all([
      this.courseModel.find({ tenantId: tId }).sort({ createdAt: -1 }).lean(),
      this.enrollmentModel
        .find({ tenantId: tId, employeeId: new Types.ObjectId(employeeId) })
        .lean(),
    ]);
    const enrollmentByCourse = new Map(
      enrollments.map((e) => [e.courseId.toString(), e]),
    );

    return courses.map((c) => ({
      ...this.stripAnswers(c),
      myEnrollment: this.toEnrollmentSummary(
        enrollmentByCourse.get((c._id as Types.ObjectId).toString()),
      ),
    }));
  }

  async getCourseForEmployee(
    tenantId: string,
    employeeId: string,
    courseId: string,
  ) {
    const course = await this.getCourseOrThrow(tenantId, courseId);
    const enrollment = await this.enrollmentModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        courseId: course._id,
        employeeId: new Types.ObjectId(employeeId),
      })
      .lean();

    return {
      ...this.stripAnswers(course as any),
      myEnrollment: this.toEnrollmentSummary(enrollment),
    };
  }

  async startCourse(
    tenantId: string,
    employeeId: string,
    employeeName: string,
    courseId: string,
  ): Promise<CourseEnrollmentDocument> {
    const tId = new Types.ObjectId(tenantId);
    const cId = new Types.ObjectId(courseId);
    const eId = new Types.ObjectId(employeeId);

    const course = await this.courseModel.findOne({ _id: cId, tenantId: tId });
    if (!course) throw new NotFoundException('Course not found');

    // const existing = await this.enrollmentModel.findOne({
    //   tenantId: tId,
    //   courseId: cId,
    //   employeeId: eId,
    // });
    // if (existing) return existing;

    return this.enrollmentModel.findOneAndUpdate(
      { tenantId: tId, courseId: cId, employeeId: eId },
      {
        $setOnInsert: {
          tenantId: tId,
          courseId: cId,
          employeeId: eId,
          employeeName,
          status: EnrollmentStatus.IN_PROGRESS,
          progressPercent: 0,
        },
      },
      { upsert: true, new: true },
    );
  }

  async updateProgress(
    tenantId: string,
    employeeId: string,
    employeeName: string,
    courseId: string,
    progress: number,
    positionSeconds?: number,
  ): Promise<CourseEnrollmentDocument> {
    const tId = new Types.ObjectId(tenantId);
    const cId = new Types.ObjectId(courseId);
    const eId = new Types.ObjectId(employeeId);
    const clamped = Math.max(0, Math.min(100, Math.round(progress)));

    const course = await this.courseModel.findOne({ _id: cId, tenantId: tId });
    if (!course) throw new NotFoundException('Course not found');

    const update: any = {
      $setOnInsert: {
        tenantId: tId,
        courseId: cId,
        employeeId: eId,
        employeeName,
        status: EnrollmentStatus.IN_PROGRESS,
      },

      $max: { progressPercent: clamped },
    };
    if (positionSeconds !== undefined) {
      update.$set = { lastPositionSeconds: Math.max(0, positionSeconds) };
    }

    return this.enrollmentModel.findOneAndUpdate(
      { tenantId: tId, courseId: cId, employeeId: eId },
      update,
      { upsert: true, new: true },
    );
  }

  async getMyCertificates(tenantId: string, employeeId: string) {
    const enrollments = await this.enrollmentModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        employeeId: new Types.ObjectId(employeeId),
        status: EnrollmentStatus.COMPLETED,
      })
      .sort({ completedAt: -1 })
      .lean();

    const courseIds = enrollments.map((e) => e.courseId);
    const courses = await this.courseModel
      .find({ _id: { $in: courseIds } })
      .select('title')
      .lean();
    const titleById = new Map(
      courses.map((c) => [(c._id as Types.ObjectId).toString(), c.title]),
    );

    return enrollments.map((e) => ({
      courseId: e.courseId.toString(),
      courseTitle: titleById.get(e.courseId.toString()) ?? 'Untitled course',
      score: e.bestScore ?? 0,
      completedAt: e.completedAt,
    }));
  }

  async submitAssessment(
    tenantId: string,
    employeeId: string,
    employeeName: string,
    courseId: string,
    dto: SubmitAssessmentDto,
  ): Promise<{
    score: number;
    passed: boolean;
    bestScore: number;
    attempts: number;
  }> {
    const tId = new Types.ObjectId(tenantId);
    const cId = new Types.ObjectId(courseId);
    const eId = new Types.ObjectId(employeeId);

    const course = await this.courseModel.findOne({ _id: cId, tenantId: tId });
    if (!course) throw new NotFoundException('Course not found');

    const score = this.gradeSubmission(course, dto);
    const passed = score >= course.assessment.passMark;

    await this.enrollmentModel.findOneAndUpdate(
      { tenantId: tId, courseId: cId, employeeId: eId },
      {
        $setOnInsert: {
          tenantId: tId,
          courseId: cId,
          employeeId: eId,
          employeeName,
          status: EnrollmentStatus.IN_PROGRESS,
          progressPercent: 0,
        },
      },
      { upsert: true, new: true },
    );

    const scoreUpdate: any = {
      $inc: { attempts: 1 },
      $max: { bestScore: score },
      $set: { lastScore: score },
    };
    if (passed) {
      scoreUpdate.$set.status = EnrollmentStatus.COMPLETED;
      scoreUpdate.$set.completedAt = new Date();
      scoreUpdate.$set.progressPercent = 100;
    }

    const enrollment = await this.enrollmentModel.findOneAndUpdate(
      { tenantId: tId, courseId: cId, employeeId: eId },
      scoreUpdate,
      { new: true },
    );

    return {
      score,
      passed,
      bestScore: enrollment!.bestScore ?? score,
      attempts: enrollment!.attempts,
    };
  }

  async getMyEnrollments(tenantId: string, employeeId: string) {
    const enrollments = await this.enrollmentModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        employeeId: new Types.ObjectId(employeeId),
      })
      .lean();
    const courseIds = enrollments.map((e) => e.courseId);
    const courses = await this.courseModel
      .find({ _id: { $in: courseIds } })
      .select('title category kind durationMinutes')
      .lean();
    const courseById = new Map(
      courses.map((c) => [(c._id as Types.ObjectId).toString(), c]),
    );

    return enrollments.map((e) => ({
      ...e,
      course: courseById.get(e.courseId.toString()) ?? null,
    }));
  }

  async getCertificatePdf(
    tenantId: string,
    employeeId: string,
    courseId: string,
    businessName: string,
  ): Promise<Buffer> {
    const enrollment = await this.enrollmentModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      courseId: new Types.ObjectId(courseId),
      employeeId: new Types.ObjectId(employeeId),
      status: EnrollmentStatus.COMPLETED,
    });
    if (!enrollment) {
      throw new NotFoundException(
        'No completed certificate found for this course.',
      );
    }

    const course = await this.courseModel.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');

    return this.certificatePdfService.buildCertificatePdf({
      employeeName: enrollment.employeeName,
      courseTitle: course.title,
      score: enrollment.bestScore ?? 0,
      completedAt: enrollment.completedAt ?? new Date(),
      businessName,
    });
  }

  // ── Private helpers ───────────────────────────────────────────

  private async getCourseOrThrow(
    tenantId: string,
    courseId: string,
  ): Promise<CourseDocument> {
    const course = await this.courseModel.findOne({
      _id: courseId,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  private buildAsset(
    kind: CourseKind,
    externalUrl: string | undefined,
    file: Express.Multer.File | undefined,
    existingAsset?: any,
  ) {
    if (kind === CourseKind.LINK) {
      if (!externalUrl?.trim()) {
        throw new BadRequestException(
          'An external URL is required for link-type courses.',
        );
      }
      return {
        fileName: externalUrl.trim(),
        mimeType: 'text/html',
        url: null,
        externalUrl: externalUrl.trim(),
        size: 0,
      };
    }

    if (file) {
      return {
        fileName: file.originalname,
        mimeType: file.mimetype,
        url: `/uploads/learning/courses/${file.filename}`,
        externalUrl: null,
        size: file.size,
      };
    }

    if (externalUrl?.trim()) {
      return {
        fileName: externalUrl.trim(),
        mimeType:
          kind === CourseKind.VIDEO
            ? 'video/mp4'
            : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        url: null,
        externalUrl: externalUrl.trim(),
        size: 0,
      };
    }

    if (existingAsset) return existingAsset;

    throw new BadRequestException(
      'Provide either a file upload or an external URL for this course.',
    );
  }

  private parseQuestions(raw: string) {
    let parsed: any[];
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('Questions payload is not valid JSON.');
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new BadRequestException(
        'At least one assessment question is required.',
      );
    }
    return parsed.map((q, i) => {
      if (!q.prompt?.trim()) {
        throw new BadRequestException(`Question ${i + 1} is missing a prompt.`);
      }
      if (
        !Array.isArray(q.options) ||
        q.options.length < 2 ||
        q.options.some((o: string) => !o?.trim())
      ) {
        throw new BadRequestException(
          `Question ${i + 1} needs at least 2 non-empty options.`,
        );
      }
      if (
        typeof q.correctIndex !== 'number' ||
        q.correctIndex < 0 ||
        q.correctIndex >= q.options.length
      ) {
        throw new BadRequestException(
          `Question ${i + 1} has an invalid correct answer index.`,
        );
      }
      return {
        key: q.key || crypto.randomBytes(4).toString('hex'),
        prompt: q.prompt.trim(),
        options: q.options.map((o: string) => o.trim()),
        correctIndex: q.correctIndex,
      };
    });
  }

  private gradeSubmission(
    course: CourseDocument,
    dto: SubmitAssessmentDto,
  ): number {
    const questions = course.assessment.questions;
    if (questions.length === 0) return 0;
    const answerMap = new Map(dto.answers.map((a) => [a.key, a.selectedIndex]));
    let correct = 0;
    for (const q of questions) {
      if (answerMap.get(q.key) === q.correctIndex) correct++;
    }
    return Math.round((correct / questions.length) * 100);
  }

  private stripAnswers(course: any) {
    const plain =
      typeof course.toObject === 'function' ? course.toObject() : course;
    return {
      ...plain,
      assessment: {
        passMark: course.assessment.passMark,
        questions: course.assessment.questions.map((q: any) => ({
          key: q.key,
          prompt: q.prompt,
          options: q.options,
        })),
      },
    };
  }

  private toEnrollmentSummary(enrollment: any) {
    if (!enrollment) return null;
    return {
      status: enrollment.status,
      attempts: enrollment.attempts,
      bestScore: enrollment.bestScore,
      lastScore: enrollment.lastScore,
      completedAt: enrollment.completedAt,
      progress: enrollment.progressPercent ?? 0,
      lastPositionSeconds: enrollment.lastPositionSeconds ?? 0,
    };
  }

  private async notifyAllEmployeesOfNewCourse(
    tenantId: string,
    course: CourseDocument,
    businessName: string,
  ): Promise<void> {
    const employees = await this.employeeModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        employmentStatus: {
          $nin: [
            EmploymentStatus.TERMINATED,
            EmploymentStatus.RESIGNED,
            EmploymentStatus.SUSPENDED,
          ],
        },
      })
      .select('email firstName')
      .lean();

    await Promise.all(
      employees
        .filter((e) => !!e.email)
        .map((e) =>
          this.emailService
            .sendNewCourseNotice({
              to: e.email as string,
              recipientName: e.firstName,
              courseTitle: course.title,
              mandatory: course.mandatory,
              businessName,
            })
            .catch(() => {}),
        ),
    );
  }
}
