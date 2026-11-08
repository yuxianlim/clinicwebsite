"use client";

import BookingModal from "./BookingModal";
import { useBooking } from "@/app/context/BookingContext";

export default function Hero() {
  const { setIsOpen } = useBooking();
  return (
    <section
      id="hero"
      className="relative bg-[#f8f7f3] px-5 pt-32 pb-12 sm:px-8 sm:pt-40 sm:pb-20"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
        <div className="min-w-0">
          <p className="eyebrow mb-6">
            Acupuncture & whole-person care · San Jose
          </p>
          <h1 className="max-w-3xl text-[clamp(2.8rem,6.5vw,6.5rem)] leading-[1.02] font-medium tracking-[-0.065em] text-[#192738]">
            Feel better.
            <br />
            Live <span className="text-[#3158d8]">fully.</span>
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-8 text-[#657184]">
            Thoughtful care for the way you live. A personal approach to
            acupuncture, herbal medicine, and everyday wellbeing.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <button onClick={() => setIsOpen(true)} className="brand-button">
              Book a visit <span aria-hidden="true">↗</span>
            </button>
            <a
              href="#services"
              className="inline-flex min-h-12 items-center gap-3 px-2 font-medium text-[#192738]"
            >
              Explore our care <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="mt-12 flex flex-wrap gap-x-7 gap-y-3 border-t border-[#dce1e5] pt-5 text-sm text-[#657184]">
            <span>Individual care plans</span>
            <span>In-person appointments</span>
            <span>San Jose, California</span>
          </div>
        </div>
        <div className="relative min-w-0">
          <div className="relative overflow-hidden rounded-t-[7rem] rounded-b-2xl bg-[#e9e7e2] px-6 pt-9 pb-7 sm:px-9">
            <div className="flex items-center justify-between text-[10px] font-semibold tracking-[0.18em] text-[#536073]">
              <span>AVEN CLINIC</span>
              <span>CARE, CONSIDERED.</span>
            </div>
            <svg
              viewBox="0 0 400 360"
              fill="none"
              className="mx-auto my-3 w-full max-w-sm"
              role="img"
              aria-label="Abstract intersecting forms representing balanced, personal care"
            >
              <circle cx="260" cy="130" r="100" fill="#dfb7a3" />
              <rect
                x="56"
                y="53"
                width="188"
                height="270"
                rx="94"
                fill="#f8f7f3"
              />
              <rect
                x="99"
                y="26"
                width="188"
                height="270"
                rx="94"
                stroke="#3158d8"
                strokeWidth="2"
              />
              <path
                d="M30 237h340M30 250h340"
                stroke="#192738"
                strokeOpacity=".12"
              />
              <circle cx="193" cy="166" r="36" fill="#3158d8" />
              <path
                d="M177 166h32M193 150v32"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <div className="flex items-end justify-between gap-5 border-t border-[#192738]/15 pt-5">
              <p className="max-w-48 text-xl leading-7 font-medium tracking-tight text-[#192738]">
                A little more balance.
                <br />A little more you.
              </p>
              <span className="text-3xl text-[#3158d8]" aria-hidden="true">
                ↗
              </span>
            </div>
          </div>
        </div>
      </div>
      <BookingModal />
    </section>
  );
}
