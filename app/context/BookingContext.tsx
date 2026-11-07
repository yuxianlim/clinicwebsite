"use client";

import { createContext, useContext, useState, useEffect } from 'react';

export interface Appointment {
  id: string;
  name: string;
  contact: string;
  date: string;
  time: string;
  practitioner: string;
  timestamp: number;
  patientId?: string;
  checkedInAt?: string;
  status?: 'scheduled' | 'cancelled';
}

interface BookingContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  appointments: Appointment[];
  addAppointment: (appointment: Appointment) => void;
  syncAppointmentCheckIn: (appointmentId: string, checkedInAt: string) => void;
  getAppointmentsByDate: (date: string) => Appointment[];
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

const STORAGE_KEY = 'clinic_appointments';

const getLocalDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const BookingProvider = ({ children }: { children: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Load appointments from localStorage on mount
  useEffect(() => {
    const loadAppointments = () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      const existing: Appointment[] = stored ? JSON.parse(stored) : [];
      const demoAppointmentId = `demo-appointment-${getLocalDate()}`;
      const hasDemoAppointment = existing.some((appointment) => appointment.id === demoAppointmentId);
      const nextAppointments = hasDemoAppointment ? existing : [
        ...existing,
        {
          id: demoAppointmentId,
          name: 'Demo Patient',
          contact: '(408) 555-8888',
          date: getLocalDate(),
          time: '2:00 PM',
          practitioner: 'Dr. Li',
          patientId: 'PT-DEMO-8888',
          timestamp: Date.now(),
        },
      ];

      if (!hasDemoAppointment) localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAppointments));
      setAppointments(nextAppointments);
    };

    loadAppointments();
    window.addEventListener('appointmentAdded', loadAppointments);
    window.addEventListener('appointmentCheckedIn', loadAppointments);
    window.addEventListener('storage', loadAppointments);
    return () => {
      window.removeEventListener('appointmentAdded', loadAppointments);
      window.removeEventListener('appointmentCheckedIn', loadAppointments);
      window.removeEventListener('storage', loadAppointments);
    };
  }, []);

  const addAppointment = (appointment: Appointment) => {
    const updated = [...appointments, appointment];
    setAppointments(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    
    window.dispatchEvent(
      new CustomEvent('appointmentAdded', { detail: appointment })
    );
  };

  const syncAppointmentCheckIn = (appointmentId: string, checkedInAt: string) => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const currentAppointments: Appointment[] = stored ? JSON.parse(stored) : appointments;
    const updated = currentAppointments.map((item) =>
      item.id === appointmentId ? { ...item, checkedInAt } : item,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setAppointments(updated);
    window.dispatchEvent(new CustomEvent('appointmentCheckedIn', { detail: { appointmentId, checkedInAt } }));
  };

  const getAppointmentsByDate = (date: string) => {
    return appointments.filter((apt) => apt.date === date);
  };

  return (
    <BookingContext.Provider
      value={{
        isOpen,
        setIsOpen,
        appointments,
        addAppointment,
        syncAppointmentCheckIn,
        getAppointmentsByDate,
      }}
    >
      {children}
    </BookingContext.Provider>
  );
};

export const useBooking = () => {
  const context = useContext(BookingContext);
  if (!context) {
    throw new Error('useBooking must be used within BookingProvider');
  }
  return context;
};
