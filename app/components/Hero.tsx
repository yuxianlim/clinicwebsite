"use client";

import BookingModal from './BookingModal';
import { useBooking } from '@/app/context/BookingContext';

const Hero = () => {
  const { isOpen: isModalOpen, setIsOpen: setIsModalOpen } = useBooking();

  return (
    <section 
      id="hero" 
      className="h-[500px] flex items-center justify-center text-white relative overflow-hidden"
      style={{
        backgroundImage: 'url(/hero-bg.svg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Overlay for better text readability */}
      <div className="absolute inset-0 bg-black/30"></div>
      
      <div className="text-center relative z-10">
        <h1 className="text-6xl font-bold mb-6 tracking-tight">欢迎来到我们的中医诊所</h1>
        <p className="text-2xl mb-10 font-light opacity-90">专业的中医治疗服务，为您的健康保驾护航</p>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-green-500 text-white px-10 py-4 rounded-full font-semibold hover:bg-green-600 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
        >
          预约挂号
        </button>
      </div>
      <BookingModal />
    </section>
  );
};

export default Hero;