"use client";

import { useState } from "react";
import Modal from "./Modal";

const practitioners = [
  {
    name: "Dr. Li",
    initials: "LI",
    specialty: "Acupuncture & pain management",
    summary:
      "A focus on acupuncture, comfort, and restoring everyday movement.",
    bio: "Dr. Li focuses on acupuncture and care for neck, back, and other musculoskeletal concerns. During your visit, you can discuss your symptoms, goals, and the treatment options available.",
    color: "#e9edfa",
  },
  {
    name: "Dr. Wang",
    initials: "WA",
    specialty: "Women’s & family wellbeing",
    summary:
      "Personal care through different stages of life, with time to listen.",
    bio: "Dr. Wang focuses on women’s and family wellbeing, using acupuncture and herbal medicine as part of an individual care plan. Bring your questions and any relevant medical information to your consultation.",
    color: "#f0e4dc",
  },
  {
    name: "Dr. Zhang",
    initials: "ZH",
    specialty: "Chronic concerns & preventive care",
    summary:
      "A thoughtful approach to ongoing concerns and long-term wellbeing.",
    bio: "Dr. Zhang focuses on ongoing health concerns and individual wellbeing. Your consultation is an opportunity to review your history, discuss your priorities, and consider an appropriate plan together.",
    color: "#e8eae7",
  },
];

export default function About() {
  const [selected, setSelected] = useState<
    (typeof practitioners)[number] | null
  >(null);
  return (
    <section id="about" className="bg-[#f8f7f3] px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <p className="eyebrow">02 / Meet your care team</p>
        <div className="mt-4 mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <h2 className="section-title max-w-xl">
            People first.
            <br />
            Always.
          </h2>
          <p className="max-w-sm leading-7 text-[#657184]">
            A good care relationship starts with listening. Get to know the
            practitioners behind your next visit.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {practitioners.map((person) => (
            <button
              key={person.name}
              onClick={() => setSelected(person)}
              className="group min-w-0 text-left"
            >
              <div
                style={{ backgroundColor: person.color }}
                className="relative mb-5 flex aspect-[5/4] items-center justify-center overflow-hidden rounded-xl"
              >
                <span
                  className="text-7xl font-light tracking-[-0.08em] text-[#192738]/60 transition-transform duration-300 group-hover:scale-110"
                  aria-hidden="true"
                >
                  {person.initials}
                </span>
                <span
                  className="absolute right-4 bottom-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl text-[#3158d8]"
                  aria-hidden="true"
                >
                  ↗
                </span>
              </div>
              <h3 className="text-2xl font-medium tracking-tight text-[#192738]">
                {person.name}
              </h3>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#3158d8]">
                {person.specialty}
              </p>
              <p className="mt-3 text-sm leading-7 text-[#657184]">
                {person.summary}
              </p>
            </button>
          ))}
        </div>
      </div>
      {selected && (
        <Modal onClose={() => setSelected(null)} titleId="practitioner-title">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow mb-2">Your care team</p>
              <h2
                id="practitioner-title"
                className="text-2xl font-medium text-[#192738]"
              >
                {selected.name}
              </h2>
              <p className="mt-2 text-sm text-[#3158d8]">
                {selected.specialty}
              </p>
            </div>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close details"
              className="h-11 w-11 shrink-0 rounded-lg text-2xl hover:bg-slate-100"
            >
              ×
            </button>
          </div>
          <p className="leading-8 text-[#657184]">{selected.bio}</p>
        </Modal>
      )}
    </section>
  );
}
