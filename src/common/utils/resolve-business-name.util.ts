import { Model } from 'mongoose';

export async function resolveBusinessName(
  userModel: Model<any>,
  tenantId: string,
): Promise<string> {
  const tenant = await userModel
    .findById(tenantId)
    .select('tenantProfile.businessName firstName')
    .lean();
  return (
    (tenant as any)?.tenantProfile?.businessName ||
    (tenant as any)?.firstName ||
    'Your Provider'
  );
}
