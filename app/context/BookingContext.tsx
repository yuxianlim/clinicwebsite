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
}

interface BookingContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  appointments: Appointment[];
  addAppointment: (appointment: Omit<Appointment, 'id' | 'timestamp'>) => void;
  getAppointmentsByDate: (date: string) => Appointment[];
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

const STORAGE_KEY = 'clinic_appointments';

export const BookingProvider = ({ children }: { children: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Load appointments from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setAppointments(JSON.parse(stored));
    }
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
    
    // Dispatch custom event for real-time updates across tabs
    window.dispatchEvent(
      new CustomEvent('appointmentAdded', { detail: newAppointment })
    );
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
