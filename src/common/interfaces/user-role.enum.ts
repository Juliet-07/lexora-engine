/**
 * PLATFORM ROLES
 * ─────────────────────────────────────────────────────────────
 * Three top-level user types, each with their own role scope.
 *
 * SuperAdmin  → owns and operates the platform
 * Tenant      → a business/organisation on the platform
 * Client      → end-user managed by a tenant
 */

export enum UserType {
  SUPER_ADMIN = 'super_admin',
  TENANT = 'tenant',
  CLIENT = 'client',
}

// ── SuperAdmin roles ─────────────────────────────────────────
export enum SuperAdminRole {
  SUPER_ADMIN = 'super_admin', // full platform access
}

// ── Tenant roles ─────────────────────────────────────────────
export enum TenantRole {
  TENANT_OWNER = 'tenant_owner', // full access within tenant
  TENANT_ADMIN = 'tenant_admin', // admin within tenant
  TENANT_MANAGER = 'tenant_manager', // operational manager
  TENANT_COMPLIANCE = 'tenant_compliance', // compliance & KYC officer
  TENANT_FINANCE = 'tenant_finance', // billing & finance
  TENANT_SUPPORT = 'tenant_support', // read-only support
}

// ── Client classifications ────────────────────────────────────
export enum ClientClassification {
  INDIVIDUAL = 'individual',
  CORPORATE = 'corporate',
  PARTNER = 'partner',
  TRUST = 'trust',
}

// ── Client roles (access within client portal) ────────────────
export enum ClientRole {
  CLIENT_PRIMARY = 'client_primary', // main account holder
  CLIENT_SECONDARY = 'client_secondary', // additional contact / signatory
  CLIENT_VIEWER = 'client_viewer', // read-only access
}

// ── Tenant/Account status ─────────────────────────────────────
export enum AccountStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
  AWAITING_PAYMENT = 'awaiting_payment',
}

// ── Subscription plans ────────────────────────────────────────
export enum SubscriptionPlan {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  TRIAL = 'trial',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  SUSPENDED = 'suspended',
}

// ── Platform module keys ──────────────────────────────────────
export enum PlatformModuleKey {
  KYC = 'kyc_aml',
  GRC = 'grc',
  CRM = 'crm',
  HR_PM = 'hr_pm',
}

// ── All roles in a single array (for validation) ─────────────
export const ALL_ROLES = [
  ...Object.values(SuperAdminRole),
  ...Object.values(TenantRole),
  ...Object.values(ClientRole),
];
