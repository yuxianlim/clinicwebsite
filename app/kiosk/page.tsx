import KioskClient from './KioskClient';

export const metadata = {
  title: 'Patient Check-in Kiosk',
  description: 'Patient self-check-in kiosk',
};

export default function KioskPage() {
  return <KioskClient />;
}