import KioskClient from './KioskClient';
import { demoKioskEnabled } from '@/app/lib/demoKiosk.server';

export const metadata = {
  title: 'Patient Check-in Kiosk',
  description: 'Patient self-check-in kiosk',
};

export default function KioskPage() {
  return <KioskClient demoVerificationEnabled={demoKioskEnabled()} />;
}
