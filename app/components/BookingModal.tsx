"use client";

import { useState, FormEvent } from 'react';
import { useBooking } from '@/app/context/BookingContext';

const practitioners = [
  { id: 1, name: '李医生' },
  { id: 2, name: '王医生' },
  { id: 3, name: '张医生' },
];

const BookingModal = () => {
  const { isOpen, setIsOpen: setBookingOpen } = useBooking();
  const onClose = () => setBookingOpen(false);
  
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    date: '',
    time: '',
    practitioner: '',
  });
  const [selectColor, setSelectColor] = useState('text-slate-400');
  const [timeColor, setTimeColor] = useState('text-slate-400');

  // Generate time slots from 9 AM to 5:30 PM in 30-minute increments
  const generateTimeSlots = () => {
    const slots = [];
    let hours = 9;
    let minutes = 0;
    
    while (hours < 17 || (hours === 17 && minutes <= 30)) {
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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Handle form submission, e.g., send to API
    console.log(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white p-8 rounded-lg shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">预约挂号</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4" onClick={(e) => e.stopPropagation()}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none text-gray-900 placeholder-gray-400"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">联系电话 *</label>
            <input
              type="tel"
              value={formData.contact}
              onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none text-gray-900 placeholder-gray-400"
              placeholder="123-456-7890"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">预约日期 *</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full h-12 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none text-gray-900 placeholder-gray-400"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">预约时间 *</label>
            <select
              value={formData.time}
              onChange={(e) => {
                setFormData({ ...formData, time: e.target.value });
                setTimeColor('text-slate-900');
              }}
              className={`w-full h-12 px-4 pr-12 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none appearance-none ${timeColor}`}
              required
            >
              <option value="" disabled>选择时间</option>
              {generateTimeSlots().map((slot) => (
                <option key={slot} value={slot}>{slot}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">选择医师 *</label>
            <select
              value={formData.practitioner}
              onChange={(e) => {
                setFormData({ ...formData, practitioner: e.target.value });
                setSelectColor('text-slate-900');
              }}
              className={`w-full h-12 px-4 pr-12 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none appearance-none ${selectColor}`}
              required
            >
              <option value="" disabled>请选择医师</option>
              {practitioners.map((p) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end space-x-4 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded transition-colors">取消</button>
            <button type="submit" className="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 transition-colors">提交预约</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BookingModal;