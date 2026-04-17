"use client";

import { useEffect, useState } from 'react';
import { useBooking, Appointment } from '@/app/context/BookingContext';

interface TimeSlot {
  time: string;
  booked: boolean;
  appointment?: Appointment;
}

const practitioners = [
  { id: 1, name: '李医生', specialty: '内科' },
  { id: 2, name: '王医生', specialty: '外科' },
  { id: 3, name: '张医生', specialty: '儿科' },
];

interface AppointmentGridProps {
  selectedDate: string;
  selectedPractitioner: number;
  onPractitionerChange: (id: number) => void;
}

const AppointmentGrid = ({
  selectedDate,
  selectedPractitioner,
  onPractitionerChange,
}: AppointmentGridProps) => {
  const { getAppointmentsByDate } = useBooking();
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [refresh, setRefresh] = useState(0);

  // Generate time slots based on business hours
  const generateTimeSlots = (dateString: string) => {
    // Parse date string to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    
    // Sunday = 0: no appointments
    if (dayOfWeek === 0) {
      return [];
    }
    
    // Determine end hour and minute: 
    // Saturday (6) = 15:30, Monday-Friday (1-5) = 17:30
    const endHour = dayOfWeek === 6 ? 15 : 17;
    const endMinute = 30;
    
    const slots = [];
    let hours = 9;
    let minutes = 0;

    while (hours < endHour || (hours === endHour && minutes <= endMinute)) {
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
      const timeString = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
      slots.push(timeString);

      minutes += 30;
      if (minutes === 60) {
        minutes = 0;
        hours += 1;
      }
    }

    return slots;
  };

  // Update time slots with booking info
  useEffect(() => {
    const appointments = getAppointmentsByDate(selectedDate);
    const generatedSlots = generateTimeSlots(selectedDate);
    
    const slots = generatedSlots.map((time) => {
      const appointment = appointments.find((apt) => apt.time === time);
      return {
        time,
        booked: !!appointment,
        appointment,
      };
    });
    setTimeSlots(slots);

    // Update live stats - count only booked slots for current practitioner
    const currentPractitioner = practitioners.find((p) => p.id === selectedPractitioner);
    if (currentPractitioner) {
      let bookedCount = 0;
      
      // Count only appointments for this specific practitioner and date
      slots.forEach((slot) => {
        if (slot.booked && slot.appointment?.practitioner === currentPractitioner.name) {
          bookedCount++;
        }
      });
      
      const availableCount = generatedSlots.length - bookedCount;

      // Update the stats in the parent component
      const availableEl = document.getElementById('available-count');
      const bookedEl = document.getElementById('booked-count');
      if (availableEl) availableEl.textContent = availableCount.toString();
      if (bookedEl) bookedEl.textContent = bookedCount.toString();
    }
  }, [selectedDate, getAppointmentsByDate, refresh, selectedPractitioner]);

  // Listen for real-time appointment updates
  useEffect(() => {
    const handleAppointmentAdded = () => {
      setRefresh((prev) => prev + 1);
    };

    window.addEventListener('appointmentAdded', handleAppointmentAdded);
    return () => window.removeEventListener('appointmentAdded', handleAppointmentAdded);
  }, []);

  const currentPractitioner = practitioners.find(
    (p) => p.id === selectedPractitioner
  );

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
      {timeSlots.map((slot) => {
        const isForThisPractitioner =
          slot.appointment?.practitioner === currentPractitioner?.name;
        const isBooked = slot.booked && isForThisPractitioner;

        return (
          <div
            key={slot.time}
            className={`p-6 rounded-lg border-2 transition-all h-32 flex flex-col items-center justify-center ${
              isBooked
                ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
                : 'bg-green-50 border-green-200 hover:bg-green-100 cursor-pointer'
            }`}
          >
            <div className="text-center w-full overflow-hidden">
              <div
                className={`text-base font-semibold mb-2 ${
                  isBooked ? 'text-gray-500' : 'text-green-800'
                }`}
              >
                {slot.time}
              </div>
              {isBooked && slot.appointment ? (
                <div className="space-y-1 text-xs overflow-hidden">
                  <div className="font-bold text-gray-600 truncate">
                    {slot.appointment.name}
                  </div>
                  <div className="text-gray-500 truncate">
                    {slot.appointment.contact}
                  </div>
                  <div className="inline-block px-2 py-1 rounded text-xs font-medium mt-1 bg-gray-300 text-gray-700">
                    已预约
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AppointmentGrid;
