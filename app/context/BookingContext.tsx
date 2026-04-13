"use client";

import { createContext, useContext, useState } from 'react';

const BookingContext = createContext({ isOpen: false, setIsOpen: (open: boolean) => {} });

export const BookingProvider = ({ children }: { children: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <BookingContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </BookingContext.Provider>
  );
};

export const useBooking = () => useContext(BookingContext);
