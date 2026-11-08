"use client";
import { useBooking } from "@/app/context/BookingContext";
import BrandMark from "./BrandMark";

export default function Footer() {
  const { setIsOpen } = useBooking();
  return (
    <footer className="bg-[#192738] px-5 py-12 text-white sm:px-8 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <BrandMark className="h-10 w-10 text-[#7794ff]" />
              <h3 className="text-2xl font-medium tracking-tight text-white">
                Aven.
              </h3>
            </div>
            <p className="mt-5 max-w-xs leading-7 text-[#c1cad8]">
              Thoughtful care.
              <br />
              More room for living.
            </p>
          </div>
          <div>
            <p className="mb-4 text-xs font-semibold tracking-[0.16em] text-[#a7b4c8]">
              FIND YOUR WAY
            </p>
            <div className="grid gap-3 text-sm">
              <a href="#services" className="hover:text-[#a4b8ff]">
                Our care ↗
              </a>
              <a href="#about" className="hover:text-[#a4b8ff]">
                Our clinicians ↗
              </a>
              <a href="#location" className="hover:text-[#a4b8ff]">
                Visit us ↗
              </a>
            </div>
          </div>
          <div>
            <p className="mb-4 text-xs font-semibold tracking-[0.16em] text-[#a7b4c8]">
              MAKE TIME FOR YOU
            </p>
            <p className="mb-4 text-sm leading-7 text-[#c1cad8]">
              San Jose, California
              <br />
              (408) 555-1234
            </p>
            <button
              onClick={() => setIsOpen(true)}
              className="inline-flex min-h-11 items-center gap-5 rounded-lg border border-[#71839e] px-4 py-2 text-sm hover:bg-white/10"
            >
              Book a visit <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
        <div className="mt-12 flex flex-wrap justify-between gap-3 border-t border-white/15 pt-5 text-xs text-[#a7b4c8]">
          <p>© 2026 Aven Clinic. All rights reserved.</p>
          <p>Acupuncture & whole-person care.</p>
        </div>
      </div>
    </footer>
  );
}
