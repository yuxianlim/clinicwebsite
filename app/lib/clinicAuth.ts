export const AUTH_STORAGE_KEY = 'clinic_auth_session';

export type ClinicAuthRole = 'patient' | 'admin';
export type ClinicAuthMethod = 'google' | 'email';
export type ClinicPermission = 'audit-log:read';

export interface ClinicAuthSession {
  authenticated: boolean;
  role: ClinicAuthRole;
  method: ClinicAuthMethod;
  email?: string;
  verificationCompleted: boolean;
  permissions: ClinicPermission[];
}

const allowedPermissions: ClinicPermission[] = ['audit-log:read'];

export const hasClinicPermission = (session: ClinicAuthSession | null, permission: ClinicPermission) =>
  Boolean(
    session?.authenticated
    && session.verificationCompleted
    && session.role === 'admin'
    && session.permissions.includes(permission),
  );

export const saveClinicAuth = (session: ClinicAuthSession) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event('clinic-auth-changed'));
};

export const readClinicAuth = (): ClinicAuthSession | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ClinicAuthSession>;
    if (!parsed.role || !['patient', 'admin'].includes(parsed.role)) {
      return null;
    }

    return {
      authenticated: Boolean(parsed.authenticated),
      role: parsed.role as ClinicAuthRole,
      method: parsed.method === 'google' ? 'google' : 'email',
      email: parsed.email,
      verificationCompleted: Boolean(parsed.verificationCompleted),
      permissions: Array.isArray(parsed.permissions)
        ? parsed.permissions.filter((permission): permission is ClinicPermission =>
          allowedPermissions.includes(permission as ClinicPermission),
        )
        : [],
    };
  } catch {
    return null;
  }
};

export const clearClinicAuth = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new Event('clinic-auth-changed'));
};
