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
  EMPLOYEE = 'employee',
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
  // KYC / onboarding roles
  CLIENT_PRIMARY = 'client_primary', // main account holder
  CLIENT_SECONDARY = 'client_secondary', // additional contact / signatory
  CLIENT_VIEWER = 'client_viewer', // read-only access

  // HR / corporate roles
  // CLIENT_EMPLOYEE = 'client_employee', // employee of the corporate client
  // CLIENT_BOARD = 'client_board', // board member
  // CLIENT_CLIENT = 'client_client', // the client's own customer (CRM)
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
  LITE = 'lite',
  GROW = 'grow',
  ENTERPRISE = 'enterprise',
  PREMIUM = 'premium',
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
  DEALS = 'deals',
  FINANCE = 'finance',
}

// ── Staff roles — module-scoped access, assignable to EMPLOYEE-typed
// accounts by the tenant at creation or afterward. One person can
// hold multiple staff roles simultaneously (User.roles is a plain
// array with no uniqueness constraint).
export enum StaffRole {
  RISK_OFFICER = 'risk_officer',
  GRC_COMPLIANCE_OFFICER = 'grc_compliance_officer',
  AML_COMPLIANCE_OFFICER = 'aml_compliance_officer',
  HR_MANAGER = 'hr_manager',
  CRM_MANAGER = 'crm_manager',
  FINANCE_MANAGER = 'finance_manager',
}

// Which platform module(s) each staff role unlocks. A root Tenant
// account (userType TENANT) always has full access and is never
// checked against this map.
export const STAFF_ROLE_MODULE_ACCESS: Record<StaffRole, PlatformModuleKey[]> =
  {
    [StaffRole.RISK_OFFICER]: [PlatformModuleKey.GRC],
    [StaffRole.GRC_COMPLIANCE_OFFICER]: [PlatformModuleKey.GRC],
    [StaffRole.AML_COMPLIANCE_OFFICER]: [PlatformModuleKey.KYC],
    [StaffRole.HR_MANAGER]: [PlatformModuleKey.HR_PM],
    [StaffRole.CRM_MANAGER]: [PlatformModuleKey.CRM],
    [StaffRole.FINANCE_MANAGER]: [PlatformModuleKey.FINANCE],
  };

// ── All roles in a single array (for validation) ─────────────
export const ALL_ROLES = [
  ...Object.values(SuperAdminRole),
  ...Object.values(TenantRole),
  ...Object.values(ClientRole),
  ...Object.values(StaffRole),
];
