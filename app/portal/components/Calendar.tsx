"use client";

import { useState } from 'react';

interface CalendarProps {
  selectedDate: string;
  onDateSelect: (date: string) => void;
}

export default function Calendar({ selectedDate, onDateSelect }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const daysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const firstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const handlePreviousMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)
    );
  };

  const handleNextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
    );
  };

  const handleDateClick = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const dateString = date.toISOString().split('T')[0];
    onDateSelect(dateString);
  };

  const getDaysArray = () => {
    const days = [];
    const totalDays = daysInMonth(currentMonth);
    const startingDayOfWeek = firstDayOfMonth(currentMonth);

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    for (let day = 1; day <= totalDays; day++) {
      days.push(day);
    }

    return days;
  };

  const monthName = currentMonth.toLocaleDateString('zh-CN', {
    month: 'long',
    year: 'numeric',
  });

  const selectedDateObj = new Date(selectedDate + 'T00:00:00');
  const isCurrentMonth =
    selectedDateObj.getFullYear() === currentMonth.getFullYear() &&
    selectedDateObj.getMonth() === currentMonth.getMonth();

  const daysArray = getDaysArray();
  const weeks = [];
  for (let i = 0; i < daysArray.length; i += 7) {
    weeks.push(daysArray.slice(i, i + 7));
  }

  // California federal holidays in 2026
  const federalHolidays = [
    '2026-01-01', // New Year's Day
    '2026-01-19', // MLK Jr. Birthday (3rd Monday)
    '2026-02-16', // Presidents' Day (3rd Monday)
    '2026-05-25', // Memorial Day (last Monday)
    '2026-06-19', // Juneteenth
    '2026-07-04', // Independence Day
    '2026-09-07', // Labor Day (1st Monday)
    '2026-10-12', // Columbus Day (2nd Monday)
    '2026-11-11', // Veterans Day
    '2026-11-26', // Thanksgiving (4th Thursday)
    '2026-12-25', // Christmas Day
  ];

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 w-full">
      {/* Month/Year Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePreviousMonth}
          className="p-1 hover:bg-gray-100 rounded transition-colors text-lg w-8 h-8 flex items-center justify-center"
        >
          ←
        </button>
        <h3 className="text-base font-semibold text-gray-800">
          {monthName}
        </h3>
        <button
          onClick={handleNextMonth}
          className="p-1 hover:bg-gray-100 rounded transition-colors text-lg w-8 h-8 flex items-center justify-center"
        >
          →
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
          <div
            key={day}
            className="text-center font-semibold text-gray-600 text-xs py-1"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Days */}
      <div className="grid grid-cols-7 gap-1">
        {weeks.map((week, weekIdx) =>
          week.map((day, dayIdx) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${weekIdx}-${dayIdx}`}
                  className="aspect-square"
                ></div>
              );
            }

            const date = new Date(
              currentMonth.getFullYear(),
              currentMonth.getMonth(),
              day
            );
            const dateString = date.toISOString().split('T')[0];
            const isSelected =
              selectedDate === dateString && isCurrentMonth;
            const isToday =
              new Date().toISOString().split('T')[0] === dateString;
            const isPast = date < new Date();
            const isHoliday = federalHolidays.includes(dateString);
            const isSunday = date.getDay() === 0;
            const isUnavailable = isPast || isHoliday || isSunday;

            return (
              <button
                key={`day-${day}`}
                onClick={() => !isUnavailable && handleDateClick(day)}
                disabled={isUnavailable && !isSelected}
                className={`aspect-square rounded text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-slate-800 text-white'
                    : isToday && !isUnavailable
                    ? 'bg-blue-100 text-blue-900 border border-blue-300'
                    : isUnavailable
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-green-100 text-green-800 hover:bg-green-200 border border-green-300'
                }`}
              >
                {day}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
