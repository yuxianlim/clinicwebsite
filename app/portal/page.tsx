"use client";

import { useState } from 'react';
import Calendar from './components/Calendar';
import AppointmentGrid from './components/AppointmentGrid';

const practitioners = [
  { id: 1, name: '李医生', specialty: '内科' },
  { id: 2, name: '王医生', specialty: '外科' },
  { id: 3, name: '张医生', specialty: '儿科' },
];

export default function PortalPage() {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [selectedPractitioner, setSelectedPractitioner] = useState(1);

  const currentPractitioner = practitioners.find(
    (p) => p.id === selectedPractitioner
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">诊所预约系统</h1>
          <p className="text-slate-300">前台预约查看面板</p>
        </div>

        {/* Calendar and Practitioner Selection Row */}
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-6 gap-4">
          {/* Practitioner Selection Card - Compact */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow-lg p-4">
            <label className="block text-xs font-medium text-gray-600 mb-2">
              选择医师
            </label>
            <select
              value={selectedPractitioner}
              onChange={(e) => setSelectedPractitioner(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 text-white rounded-lg font-medium border-2 border-slate-800 hover:border-slate-600 transition-colors cursor-pointer text-sm"
            >
              {practitioners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} - {p.specialty}
                </option>
              ))}
            </select>

            {/* Practitioner Info - Compact */}
            {currentPractitioner && (
              <div className="border-t border-gray-200 pt-3 mt-3">
                <div className="text-sm text-gray-600 mb-2">预约情况</div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-base font-semibold">
                    <span className="text-slate-700">可预约</span>
                    <span className="text-green-600" id="available-count">17</span>
                  </div>
                  <div className="flex justify-between items-center text-base font-semibold">
                    <span className="text-slate-700">已预约</span>
                    <span className="text-red-600" id="booked-count">1</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Calendar - Compact */}
          <div className="lg:col-span-2">
            <Calendar selectedDate={selectedDate} onDateSelect={setSelectedDate} />
          </div>

          {/* Empty space for alignment */}
          <div className="lg:col-span-3"></div>
        </div>

        {/* Appointment Grid */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">
            预约情况总览
          </h2>
          <AppointmentGrid
            selectedDate={selectedDate}
            selectedPractitioner={selectedPractitioner}
            onPractitionerChange={setSelectedPractitioner}
          />
        </div>
      </div>
    </div>
  );
}
