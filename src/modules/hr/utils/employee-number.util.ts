import { Model, Types } from 'mongoose';

// Employee numbers (EMP-0001, EMP-0002 …) are a per-tenant sequence, so
// uniqueness is enforced on (tenantId, employeeNumber) — never on the number
// alone, or every new tenant's first employee would collide with the last
// tenant's EMP-0001.

export const EMPLOYEE_NUMBER_PREFIX = 'EMP-';

export const formatEmployeeNumber = (n: number) =>
  `${EMPLOYEE_NUMBER_PREFIX}${String(n).padStart(4, '0')}`;

/** Parses EMP-0007 → 7; anything that isn't one of ours → null. */
export function parseEmployeeNumber(value?: string | null): number | null {
  const m = /^EMP-(\d+)$/.exec(value ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * Next free number for the tenant: one past the highest in use. Counting
 * documents would hand out a number twice after any employee is deleted.
 */
export async function nextEmployeeNumber(
  model: Model<any>,
  tenantId: Types.ObjectId,
): Promise<string> {
  const rows = await model
    .find({ tenantId, employeeNumber: /^EMP-\d+$/ })
    .select('employeeNumber')
    .lean();
  let max = 0;
  for (const r of rows as any[]) {
    const n = parseEmployeeNumber(r.employeeNumber);
    if (n !== null && n > max) max = n;
  }
  return formatEmployeeNumber(max + 1);
}

const isEmployeeNumberClash = (e: any) =>
  e?.code === 11000 &&
  (e?.keyPattern?.employeeNumber !== undefined ||
    /employeeNumber/.test(String(e?.message)));

/**
 * Creates the employee with the tenant's next number. If two requests race
 * for the same number the unique index rejects one; it simply takes the
 * next number and tries again.
 */
export async function createWithEmployeeNumber<T>(
  model: Model<any>,
  tenantId: Types.ObjectId,
  build: (employeeNumber: string) => Record<string, any>,
  attempts = 6,
): Promise<T> {
  let last: any;
  for (let i = 0; i < attempts; i++) {
    const employeeNumber = await nextEmployeeNumber(model, tenantId);
    try {
      return (await model.create(build(employeeNumber))) as T;
    } catch (e) {
      if (!isEmployeeNumberClash(e)) throw e;
      last = e;
    }
  }
  throw last;
}
