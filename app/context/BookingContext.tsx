"use client";

import { createContext, useContext, useState, useEffect } from 'react';
import { recordAuditEvent } from '@/app/lib/auditLog';

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
}

interface BookingContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  appointments: Appointment[];
  addAppointment: (appointment: Omit<Appointment, 'id' | 'timestamp'>) => void;
  checkInAppointment: (appointmentId: string) => { ok: boolean; reason?: 'missing' | 'already-checked-in' };
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

  const addAppointment = (appointment: Omit<Appointment, 'id' | 'timestamp'>) => {
    const newAppointment: Appointment = {
      ...appointment,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
    };
    
    const updated = [...appointments, newAppointment];
    setAppointments(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    void recordAuditEvent({
      module: 'appointments',
      action: 'Appointment created',
      relatedRecordId: newAppointment.id,
      result: 'success',
    });
    
    // Dispatch custom event for real-time updates across tabs
    window.dispatchEvent(
      new CustomEvent('appointmentAdded', { detail: newAppointment })
    );
  };

  const checkInAppointment = (appointmentId: string, actor = 'Patient kiosk') => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const currentAppointments: Appointment[] = stored ? JSON.parse(stored) : appointments;
    const appointment = currentAppointments.find((item) => item.id === appointmentId);

    if (!appointment) {
      void recordAuditEvent({
        module: 'check-in',
        action: 'Check-in rejected',
        relatedRecordId: appointmentId,
        result: 'failed',
      });
      return { ok: false as const, reason: 'missing' as const };
    }
    if (appointment.checkedInAt) {
      void recordAuditEvent({
        module: 'check-in',
        action: 'Duplicate check-in prevented',
        relatedRecordId: appointmentId,
        result: 'denied',
      });
      return { ok: false as const, reason: 'already-checked-in' as const };
    }

    const checkedInAt = new Date().toISOString();
    const updated = currentAppointments.map((item) =>
      item.id === appointmentId ? { ...item, checkedInAt } : item,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    void recordAuditEvent({
      module: 'check-in',
      action: 'Patient checked in',
      relatedRecordId: appointmentId,
      result: 'success',
    });
    setAppointments(updated);
    window.dispatchEvent(new CustomEvent('appointmentCheckedIn', { detail: { appointmentId, checkedInAt } }));
    return { ok: true as const };
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
        checkInAppointment,
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
