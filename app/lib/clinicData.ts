export interface Patient {
  firstName: string;
  lastName: string;
  id: string;
  status: string;
  lastVisit: string;
  phone: string;
  visitHistory: { date: string; treatment: string; practitioner: string }[];
}

export const patients: Patient[] = [
  {
    firstName: 'Mina',
    lastName: 'Chen',
    id: 'PT-1042',
    status: 'Follow-up',
    lastVisit: '2026-08-02',
    phone: '(408) 555-0114',
    visitHistory: [
      { date: '2026-08-02', treatment: 'Acupuncture follow-up', practitioner: 'Dr. Li' },
      { date: '2026-07-19', treatment: 'Herbal consultation', practitioner: 'Dr. Wang' },
    ],
  },
  {
    firstName: 'Daniel',
    lastName: 'Zhao',
    id: 'PT-1088',
    status: 'In treatment',
    lastVisit: '2026-08-01',
    phone: '(408) 555-0187',
    visitHistory: [
      { date: '2026-08-01', treatment: 'Massage therapy', practitioner: 'Dr. Zhang' },
      { date: '2026-07-22', treatment: 'Pain management', practitioner: 'Dr. Li' },
    ],
  },
  {
    firstName: 'Alicia',
    lastName: 'Gomez',
    id: 'PT-1120',
    status: 'New',
    lastVisit: '2026-08-02',
    phone: '(408) 555-0132',
    visitHistory: [{ date: '2026-08-02', treatment: 'Initial assessment', practitioner: 'Dr. Wang' }],
  },
  {
    firstName: 'Demo',
    lastName: 'Patient',
    id: 'PT-DEMO-8888',
    status: 'Demo',
    lastVisit: '2026-09-24',
    phone: '(408) 555-8888',
    visitHistory: [],
  },
];

export const normalizePhone = (value: string) => value.replace(/\D/g, '');

export const findPatientByLastFour = (lastFour: string) => {
  const normalized = lastFour.replace(/\D/g, '');
  return normalized.length === 4
    ? patients.find((patient) => normalizePhone(patient.phone).endsWith(normalized)) ?? null
    : null;
};

export const findPatientByMembershipId = (membershipId: string) => {
  const normalized = membershipId.trim().toUpperCase();
  return patients.find((patient) => patient.id.toUpperCase() === normalized) ?? null;
};