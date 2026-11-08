"use client";
import { useBooking } from "@/app/context/BookingContext";

export default function Location() {
  const { setIsOpen } = useBooking();
  return (
    <section id="location" className="bg-[#f8f7f3] px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2 lg:gap-20">
        <div>
          <p className="eyebrow">04 / Come say hello</p>
          <h2 className="section-title mt-4">
            Your next step
            <br />
            starts here.
          </h2>
          <p className="mt-6 max-w-md text-lg leading-8 text-[#657184]">
            Questions about care? Ready for a first visit? We’d love to hear
            from you.
          </p>
          <button onClick={() => setIsOpen(true)} className="brand-button mt-8">
            Book a visit <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="rounded-2xl border border-[#dce1e5] bg-white p-6 sm:p-9">
          <div className="flex items-center justify-between border-b border-[#dce1e5] pb-6">
            <h3 className="text-xl font-medium text-[#192738]">
              Visit the clinic
            </h3>
            <svg
              className="h-7 w-7 text-[#3158d8]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
              <circle cx="12" cy="10" r="2" />
            </svg>
          </div>
          <address className="mt-6 text-lg leading-8 not-italic text-[#192738]">
            3150 Almaden Expy, Suite 111
            <br />
            San Jose, CA 95118
          </address>
          <a
            href="https://www.google.com/maps/search/?api=1&query=3150+Almaden+Expy+Ste+111+San+Jose+CA+95118"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-11 items-center gap-3 text-sm font-medium text-[#3158d8]"
          >
            Get directions <span aria-hidden="true">↗</span>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <dl className="mt-6 grid gap-6 border-t border-[#dce1e5] pt-6 text-sm sm:grid-cols-2">
            <div>
              <dt className="eyebrow mb-3">Opening hours</dt>
              <dd className="space-y-2 text-[#657184]">
                <p>Mon–Fri · 9 am–6 pm</p>
                <p>Saturday · 9 am–4 pm</p>
                <p>Sunday · Closed</p>
              </dd>
            </div>
            <div>
              <dt className="eyebrow mb-3">Let’s talk</dt>
              <dd>
                <a
                  href="tel:+14085551234"
                  className="text-base font-medium text-[#192738]"
                >
                  (408) 555-1234
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
