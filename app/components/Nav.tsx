"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useBooking } from '@/app/context/BookingContext';
import ClinicAuthModal from './ClinicAuthModal';
import { clearClinicAuth, saveClinicAuth, type ClinicAuthSession } from '@/app/lib/clinicAuth';

import { useClinicAuth } from '@/app/lib/useClinicAuth';

const Nav = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showClinicMenu, setShowClinicMenu] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const authState = useClinicAuth();
  const { setIsOpen: setBookingOpen } = useBooking();
  const router = useRouter();


  const isAdmin = authState?.authenticated && authState.role === 'admin' && authState.verificationCompleted;
  const isLoggedIn = authState?.authenticated;

  const handleClinicAccess = () => {
    if (isAdmin) {
      router.push('/portal');
      return;
    }

    if (isLoggedIn) {
      setShowClinicMenu(false);
      return;
    }

    setShowAuthModal(true);
    setShowClinicMenu(false);
  };

  const handleLogout = () => {
    void fetch('/api/clinic/session', { method: 'DELETE' });
    clearClinicAuth();
    setShowClinicMenu(false);
    router.push('/');
  };

  const handleAuthenticated = (session: ClinicAuthSession) => {
    saveClinicAuth(session);
  };

  const openLoginModal = () => {
    setShowAuthModal(true);
    setShowClinicMenu(false);
  };

  const closeAuthModal = () => {
    setShowAuthModal(false);
    setShowClinicMenu(false);
  };

  return (
    <>
      <nav className="fixed top-0 w-full bg-white shadow-md z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="#hero" style={{ color: '#556B42' }} className="text-xl font-bold">
                Felicia Ho
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#services" style={{ color: '#556B42' }} className="hover:opacity-70 transition-colors px-2 py-1">服务与治疗</a>
              <a href="#about" style={{ color: '#556B42' }} className="hover:opacity-70 transition-colors px-2 py-1">医师介绍</a>
              <a href="#ceu" style={{ color: '#556B42' }} className="hover:opacity-70 transition-colors px-2 py-1">CEU</a>
              <a href="#testimonials" style={{ color: '#556B42' }} className="hover:opacity-70 transition-colors px-2 py-1">评价</a>
              <a href="#location" style={{ color: '#556B42' }} className="hover:opacity-70 transition-colors px-2 py-1">联系我们</a>
              {isAdmin ? (
                <div className="relative">
                  <button onClick={() => setShowClinicMenu((prev) => !prev)} style={{ color: '#556B42' }} className="rounded px-2 py-1 font-medium hover:opacity-70 transition-colors">
                    Clinic System
                  </button>
                  {showClinicMenu ? (
                    <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                      <button onClick={handleClinicAccess} className="block w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                        Clinic System Management
                      </button>
                      <button onClick={() => { setBookingOpen(true); setShowClinicMenu(false); }} className="block w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                        Billing
                      </button>
                      <button onClick={handleLogout} className="mt-1 block w-full rounded bg-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-200">
                        Logout
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button onClick={() => setBookingOpen(true)} style={{ backgroundColor: '#556B42' }} className="text-white px-4 py-2 rounded hover:opacity-90 transition-colors">预约挂号</button>
              <button onClick={isLoggedIn ? handleLogout : openLoginModal} style={{ backgroundColor: '#556B42' }} className="text-white px-4 py-2 rounded hover:opacity-90 transition-colors">
                {isLoggedIn ? 'Logout' : 'Login'}
              </button>
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
                  <a href="#services" onClick={() => setIsOpen(false)} style={{ color: '#556B42' }} className="block px-3 py-2 hover:opacity-70 hover:bg-gray-50 rounded">服务与治疗</a>
                  <a href="#about" onClick={() => setIsOpen(false)} style={{ color: '#556B42' }} className="block px-3 py-2 hover:opacity-70 hover:bg-gray-50 rounded">医师介绍</a>
                  <a href="#ceu" onClick={() => setIsOpen(false)} style={{ color: '#556B42' }} className="block px-3 py-2 hover:opacity-70 hover:bg-gray-50 rounded">CEU</a>
                  <a href="#testimonials" onClick={() => setIsOpen(false)} style={{ color: '#556B42' }} className="block px-3 py-2 hover:opacity-70 hover:bg-gray-50 rounded">评价</a>
                  <a href="#location" onClick={() => setIsOpen(false)} style={{ color: '#556B42' }} className="block px-3 py-2 hover:opacity-70 hover:bg-gray-50 rounded">联系我们</a>
                  {isAdmin ? (
                    <button onClick={() => { setIsOpen(false); setShowClinicMenu(false); handleClinicAccess(); }} style={{ color: '#556B42' }} className="block w-full text-left px-3 py-2 hover:opacity-70 hover:bg-gray-50 rounded">Clinic System</button>
                  ) : null}
                  <button onClick={() => { setIsOpen(false); if (isLoggedIn) handleLogout(); else openLoginModal(); }} style={{ backgroundColor: '#556B42' }} className="block w-full text-left px-3 py-2 text-white rounded hover:opacity-90 transition-colors">{isLoggedIn ? 'Logout' : 'Login'}</button>
                  <button onClick={() => { setIsOpen(false); setBookingOpen(true); }} style={{ backgroundColor: '#556B42' }} className="block w-full text-left px-3 py-2 text-white rounded hover:opacity-90 transition-colors">预约挂号</button>
                </div>
              </div>
            </>
          )}
        </div>
      </nav>
      {showAuthModal && <ClinicAuthModal isOpen onClose={closeAuthModal} onAuthenticated={handleAuthenticated} />}
    </>
  );
};

export default Nav;