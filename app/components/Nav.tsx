"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useBooking } from '@/app/context/BookingContext';

const Nav = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { setIsOpen: setBookingOpen } = useBooking();

  return (
    <nav className="fixed top-0 w-full bg-white shadow-md z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="#hero" className="text-xl font-bold text-gray-800">
              中医诊所
            </Link>
          </div>
          <div className="hidden md:flex items-center space-x-8">
            <a href="#services" className="text-gray-700 hover:text-slate-900 transition-colors px-2 py-1">服务与治疗</a>
            <a href="#about" className="text-gray-700 hover:text-slate-900 transition-colors px-2 py-1">医师介绍</a>
            <a href="#testimonials" className="text-gray-700 hover:text-slate-900 transition-colors px-2 py-1">评价</a>
            <a href="#location" className="text-gray-700 hover:text-slate-900 transition-colors px-2 py-1">联系我们</a>
            <button onClick={() => setBookingOpen(true)} className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-900 transition-colors">预约挂号</button>
          </div>
          <div className="md:hidden flex items-center">
            <button onClick={() => setIsOpen(!isOpen)} className="text-gray-700 hover:text-gray-900">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
        {isOpen && (
          <>
            <div className="fixed inset-0 bg-black/20 z-40 md:hidden" onClick={() => setIsOpen(false)} />
            <div className="fixed top-16 inset-x-0 z-50 md:hidden">
              <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white shadow-xl">
                <a href="#services" onClick={() => setIsOpen(false)} className="block px-3 py-2 text-gray-700 hover:text-slate-900 hover:bg-gray-50 rounded">服务与治疗</a>
                <a href="#about" onClick={() => setIsOpen(false)} className="block px-3 py-2 text-gray-700 hover:text-slate-900 hover:bg-gray-50 rounded">医师介绍</a>
                <a href="#testimonials" onClick={() => setIsOpen(false)} className="block px-3 py-2 text-gray-700 hover:text-slate-900 hover:bg-gray-50 rounded">评价</a>
                <a href="#location" onClick={() => setIsOpen(false)} className="block px-3 py-2 text-gray-700 hover:text-slate-900 hover:bg-gray-50 rounded">联系我们</a>
                <button onClick={() => { setIsOpen(false); setBookingOpen(true); }} className="block w-full text-left px-3 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 transition-colors">预约挂号</button>
              </div>
            </div>
          </>
        )}
      </div>
    </nav>
  );
};

export default Nav;