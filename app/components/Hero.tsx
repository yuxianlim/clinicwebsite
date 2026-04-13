"use client";

import BookingModal from './BookingModal';
import { useBooking } from '@/app/context/BookingContext';

const Hero = () => {
  const { isOpen: isModalOpen, setIsOpen: setIsModalOpen } = useBooking();

  return (
    <section id="hero" className="h-screen flex items-center justify-center bg-gradient-to-r from-slate-800 via-slate-700 to-slate-900 text-white">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-4">欢迎来到我们的中医诊所</h1>
        <p className="text-xl mb-8">专业的中医治疗服务，为您的健康保驾护航</p>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-white text-slate-800 px-8 py-3 rounded-full font-semibold hover:bg-slate-100 transition"
        >
          预约挂号
        </button>
      </div>
      <BookingModal />
    </section>
  );
};

export default Hero;