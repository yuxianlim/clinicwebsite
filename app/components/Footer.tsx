"use client";

import Link from 'next/link';
import { useBooking } from '@/app/context/BookingContext';

const Footer = () => {
  const { setIsOpen: setBookingOpen } = useBooking();
  return (
    <footer style={{ backgroundColor: '#556B42' }} className="text-white py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-4 text-white">圣恩中医诊所</h3>
            <p className="text-white">专业的中医治疗服务，为您的健康保驾护航。</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4 text-white">联系我们</h3>
            <p className="text-white">地址: 3150 Almaden Expy Ste 111, San Jose, CA 95118</p>
            <p className="text-white">电话: (408) 555-1234</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4 text-white">快速链接</h3>
            <ul className="space-y-2">
              <li><a href="#services" className="text-white hover:text-gray-200">服务与治疗</a></li>
              <li><a href="#about" className="text-white hover:text-gray-200">医师介绍</a></li>
              <li><a href="#testimonials" className="text-white hover:text-gray-200">评价</a></li>
              <li><button onClick={() => setBookingOpen(true)} style={{ backgroundColor: '#ffffff', color: '#556B42' }} className="font-semibold px-4 py-2 rounded shadow-sm hover:bg-gray-100 transition-colors">预约挂号</button></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t pt-4 text-center text-white" style={{ borderColor: 'rgba(255,255,255,0.2)' }}>
          <p>&copy; 2026 圣恩中医诊所. 保留所有权利.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;