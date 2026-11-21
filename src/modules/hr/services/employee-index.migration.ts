import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Employee, EmployeeDocument } from '../schemas/employee.schema';

/**
 * Early databases carry a GLOBAL unique index on `employeeNumber`
 * (employeeNumber_1). Numbers are issued per tenant, so the second tenant's
 * first employee (EMP-0001) is rejected with E11000. Mongoose never drops an
 * index that has left the schema, so this does it once on startup:
 *   1. drop the old global unique index if it is there
 *   2. make sure the per-tenant unique index exists
 * It is idempotent and never blocks the app from starting.
 */
@Injectable()
export class EmployeeIndexMigration implements OnModuleInit {
  private readonly logger = new Logger(EmployeeIndexMigration.name);

  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async onModuleInit() {
    try {
      const col = this.employeeModel.collection;
      let indexes: any[] = [];
      try {
        indexes = await col.indexes();
      } catch {
        // collection doesn't exist yet (fresh database) — nothing to drop
      }
      const legacy = indexes.find(
        (i) =>
          i.unique &&
          Object.keys(i.key ?? {}).length === 1 &&
          i.key.employeeNumber === 1,
      );
      if (legacy) {
        await col.dropIndex(legacy.name);
        this.logger.log(
          `Dropped global unique index ${legacy.name} on hr_employees (employee numbers are per tenant)`,
        );
      }
      await col.createIndex(
        { tenantId: 1, employeeNumber: 1 },
        { unique: true, name: 'tenantId_1_employeeNumber_1' },
      );
    } catch (e: any) {
      this.logger.error(
        `Employee index migration failed: ${e?.message ?? e}. Creating a second tenant may fail until employeeNumber_1 is dropped.`,
      );
    }
  }
}
