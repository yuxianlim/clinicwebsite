import { cookies } from 'next/headers';
import { billingDemoCookie, clinicSessionCookieName, verifyAdminSession, verifyBillingDemoSession } from './serverClinicSession';
import { demoBillingEnabled, type BillingActor } from './demoBilling.server';

export const billingActor = async (): Promise<BillingActor | null> => {
  if (!demoBillingEnabled()) return null;
  const cookieStore = await cookies();
  const admin = verifyAdminSession(cookieStore.get(clinicSessionCookieName)?.value);
  if (admin) return { role: 'admin', sessionId: admin.sessionId };
  const staff = verifyBillingDemoSession(cookieStore.get(billingDemoCookie)?.value);
  return staff ? { role: 'clinic_staff', sessionId: staff.sessionId } : null;
};
