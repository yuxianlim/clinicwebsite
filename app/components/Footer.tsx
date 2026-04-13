"use client";

import Link from 'next/link';
import { useBooking } from '@/app/context/BookingContext';

const Footer = () => {
  const { setIsOpen: setBookingOpen } = useBooking();
  return (
    <footer className="bg-gray-800 text-white py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-4">中医诊所</h3>
            <p>专业的中医治疗服务，为您的健康保驾护航。</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">联系我们</h3>
            <p>地址: 3150 Almaden Expy Ste 111, San Jose, CA 95118</p>
            <p>电话: (408) 555-1234</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">快速链接</h3>
            <ul className="space-y-2">
              <li><a href="#services" className="hover:text-gray-300">服务与治疗</a></li>
              <li><a href="#about" className="hover:text-gray-300">医师介绍</a></li>
              <li><a href="#testimonials" className="hover:text-gray-300">评价</a></li>
              <li><button onClick={() => setBookingOpen(true)} className="bg-white text-slate-900 font-semibold px-4 py-2 rounded shadow-sm hover:bg-slate-100 transition-colors">预约挂号</button></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-gray-700 pt-4 text-center">
          <p>&copy; 2026 中医诊所. 保留所有权利.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;