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
        backgroundImage: 'url(/leave.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Overlay for better text readability */}
      <div className="absolute inset-0 bg-black/30"></div>
      
      <div className="text-center relative z-10">
        <h1 style={{ fontSize: '26px', color: '#ffffff' }} className="font-bold mb-4">Welcome to Felicia Ho</h1>
        <p style={{ fontSize: '14px', color: '#ffffff' }} className="mb-8">专业的中医治疗服务，为您的健康保驾护航</p>
        <button
          onClick={() => setIsModalOpen(true)}
          style={{ backgroundColor: '#556B42' }}
          className="text-white px-8 py-3 rounded-full font-semibold hover:opacity-80 transition"
        >
          预约挂号
        </button>
      </div>
      <BookingModal />
    </section>
  );
};

export default Hero;