"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBooking } from "@/app/context/BookingContext";
import {
  clearClinicAuth,
  saveClinicAuth,
  type ClinicAuthSession,
} from "@/app/lib/clinicAuth";
import { useClinicAuth } from "@/app/lib/useClinicAuth";
import ClinicAuthModal from "./ClinicAuthModal";
import BrandMark from "./BrandMark";

const links = [
  ["services", "Our care"],
  ["about", "Our clinicians"],
  ["ceu", "Education"],
  ["testimonials", "Patient stories"],
  ["location", "Visit us"],
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const auth = useClinicAuth();
  const { setIsOpen: setBookingOpen } = useBooking();
  const router = useRouter();
  const isAdmin =
    auth?.authenticated && auth.role === "admin" && auth.verificationCompleted;
  const logout = () => {
    void fetch("/api/clinic/session", { method: "DELETE" });
    clearClinicAuth();
    setOpen(false);
    setAccountOpen(false);
    router.push("/");
  };
  const openLogin = () => {
    setOpen(false);
    setAccountOpen(false);
    setAuthOpen(true);
  };
  const authenticated = (session: ClinicAuthSession) => saveClinicAuth(session);
  return (
    <>
      {open && <div className="fixed inset-0 top-20 z-40 bg-[#192738]/30 xl:hidden" onClick={() => setOpen(false)} />}
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 top-0 z-50 border-b border-[#dce1e5]/80 bg-white/95 backdrop-blur-xl"
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex h-20 items-center justify-between gap-4">
            <Link
              href="#hero"
              aria-label="Aven Clinic home"
              className="flex shrink-0 items-center gap-3 text-[#3158d8]"
            >
              <BrandMark />
              <div>
                <span className="block text-xl font-semibold tracking-[-0.05em] text-[#192738]">
                  Aven<span className="text-[#3158d8]">.</span>
                </span>
                <span className="block text-[9px] font-medium tracking-[0.18em] text-[#657184]">
                  CLINIC & WELLNESS
                </span>
              </div>
            </Link>
            <div className="hidden items-center gap-5 xl:flex">
              {links.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="py-3 text-sm font-medium text-[#536073] transition-colors hover:text-[#3158d8]"
                >
                  {label}
                </a>
              ))}
              {isAdmin && (
                <div className="relative">
                  <button
                    aria-expanded={accountOpen}
                    aria-controls="account-menu"
                    onClick={() => setAccountOpen(!accountOpen)}
                    className="px-1 text-sm font-medium text-[#3158d8]"
                  >
                    Workspace
                  </button>
                  {accountOpen && (
                    <div
                      id="account-menu"
                      className="absolute right-0 mt-3 w-56 rounded-xl border border-[#dce1e5] bg-white p-2 shadow-lg"
                    >
                      <button
                        onClick={() => {
                          setAccountOpen(false);
                          router.push("/portal");
                        }}
                        className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f3f5fa]"
                      >
                        Open staff workspace ↗
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={auth?.authenticated ? logout : openLogin}
                className="rounded-lg border border-[#dce1e5] px-4 py-2 text-sm font-medium text-[#192738] hover:bg-[#f3f5fa]"
              >
                {auth?.authenticated ? "Logout" : "Login"}
              </button>
              <button
                onClick={() => setBookingOpen(true)}
                className="brand-button text-sm"
              >
                Book a visit <span aria-hidden="true">↗</span>
              </button>
            </div>
            <button
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              aria-controls="mobile-navigation"
              onClick={() => setOpen(!open)}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#dce1e5] text-[#192738] xl:hidden"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d={open ? "M6 6l12 12M6 18L18 6" : "M4 8h16M4 16h16"} />
              </svg>
            </button>
          </div>
        </div>
        {open && (
          <>
            <div
              id="mobile-navigation"
              className="absolute inset-x-0 top-20 max-h-[calc(100dvh-5rem)] overflow-y-auto border-b border-[#dce1e5] bg-white p-5 shadow-lg xl:hidden"
            >
              <div className="mx-auto grid max-w-7xl gap-2">
                {links.map(([id, label]) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    onClick={() => setOpen(false)}
                    className="flex min-h-12 items-center justify-between rounded-lg px-3 text-[#192738] hover:bg-[#f3f5fa]"
                  >
                    {label}
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
                {isAdmin && (
                  <button
                    onClick={() => {
                      setOpen(false);
                      router.push("/portal");
                    }}
                    className="min-h-12 px-3 text-left font-medium text-[#3158d8]"
                  >
                    Staff workspace ↗
                  </button>
                )}
                <button
                  onClick={auth?.authenticated ? logout : openLogin}
                  className="min-h-12 rounded-lg border border-[#dce1e5] px-4 py-2 text-left font-medium"
                >
                  {auth?.authenticated ? "Logout" : "Login"}
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    setBookingOpen(true);
                  }}
                  className="brand-button mt-2 justify-between"
                >
                  Book a visit <span aria-hidden="true">↗</span>
                </button>
              </div>
            </div>
          </>
        )}
      </nav>
      {authOpen && (
        <ClinicAuthModal
          isOpen
          onClose={() => setAuthOpen(false)}
          onAuthenticated={authenticated}
        />
      )}
    </>
  );
}
