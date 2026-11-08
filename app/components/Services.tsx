"use client";

import { useState } from "react";
import Modal from "./Modal";

const services = [
  {
    title: "Acupuncture",
    summary:
      "Individual treatment focused on comfort, mobility, and wellbeing.",
    details:
      "Your practitioner will discuss your concerns and recommend an acupuncture approach suited to your needs. Ask about what to expect during treatment, session length, and follow-up care.",
  },
  {
    title: "Herbal medicine",
    summary:
      "A considered approach to herbal care, guided by your practitioner.",
    details:
      "Herbal recommendations begin with a conversation about your health, current medications, and goals. Your practitioner can explain the proposed plan and answer questions before you begin.",
  },
  {
    title: "Manual therapy",
    summary: "Hands-on care for areas of tension and everyday discomfort.",
    details:
      "Manual therapy uses hands-on techniques to address muscle tension and support movement. Your practitioner will discuss the areas you would like to focus on and adapt the session to your comfort.",
  },
  {
    title: "Moxibustion",
    summary:
      "A traditional warming therapy, considered as part of your care plan.",
    details:
      "Moxibustion uses warmth as a traditional therapeutic technique. Your practitioner will explain the procedure, discuss whether it is appropriate for you, and answer your questions.",
  },
];

export default function Services() {
  const [selected, setSelected] = useState<(typeof services)[number] | null>(
    null,
  );
  return (
    <section id="services" className="bg-white px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">01 / Our approach</p>
            <h2 className="section-title mt-4">Care built around you.</h2>
          </div>
          <p className="max-w-sm text-base leading-7 text-[#657184]">
            A focused range of therapies. A plan shaped by your needs, your
            goals, and your everyday life.
          </p>
        </div>
        <div className="grid gap-px overflow-hidden rounded-xl border border-[#dce1e5] bg-[#dce1e5] sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, index) => (
            <button
              key={service.title}
              onClick={() => setSelected(service)}
              className="group min-w-0 bg-white p-6 text-left transition-colors hover:bg-[#f6f7fb] sm:p-7"
            >
              <span className="font-mono text-xs text-[#657184]">
                0{index + 1}
              </span>
              <div className="my-7 flex items-center justify-between gap-3">
                <h3 className="text-xl font-medium tracking-tight text-[#192738]">
                  {service.title}
                </h3>
                <span
                  className="text-xl text-[#3158d8] transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  ↗
                </span>
              </div>
              <p className="text-sm leading-7 text-[#657184]">
                {service.summary}
              </p>
              <span className="mt-6 block text-xs font-semibold text-[#3158d8]">
                Explore treatment
              </span>
            </button>
          ))}
        </div>
      </div>
      {selected && (
        <Modal onClose={() => setSelected(null)} titleId="service-title">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2
              id="service-title"
              className="text-2xl font-medium tracking-tight text-[#192738]"
            >
              {selected.title}
            </h2>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close details"
              className="h-11 w-11 shrink-0 rounded-lg text-2xl hover:bg-slate-100"
            >
              ×
            </button>
          </div>
          <p className="leading-8 text-[#657184]">{selected.details}</p>
        </Modal>
      )}
    </section>
  );
}
