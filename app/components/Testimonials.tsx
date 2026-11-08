"use client";

import { useState } from "react";
import Modal from "./Modal";

// English translations of the existing prototype's patient stories.
const stories = [
  {
    name: "Ms. Zhao",
    topic: "Acupuncture",
    quote: "My neck pain and dizziness improved after a course of treatment.",
    detail:
      "Working at a computer had made my neck problems worse. After a course of acupuncture and herbal care with Dr. Li, my neck pain and dizziness improved.",
  },
  {
    name: "Mr. Zhu",
    topic: "Herbal care",
    quote: "I was sleeping better and feeling more refreshed.",
    detail:
      "Sleep problems had been affecting my work and daily life. A friend recommended the clinic, and after following a herbal care plan, I was sleeping better and feeling more refreshed.",
  },
  {
    name: "Ms. Li",
    topic: "Personal wellbeing",
    quote: "I’m grateful for the team’s care and patience.",
    detail:
      "Dr. Wang developed an acupuncture and herbal care plan for my menopausal symptoms. Over the following months, I noticed improvements and felt grateful for the team’s care and patience.",
  },
];

export default function Testimonials() {
  const [selected, setSelected] = useState<(typeof stories)[number] | null>(
    null,
  );
  return (
    <section id="testimonials" className="bg-white px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <p className="eyebrow">03 / Patient stories</p>
        <h2 className="section-title mt-4 mb-10 max-w-2xl">
          A personal journey.
          <br />A human connection.
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {stories.map((story) => (
            <button
              key={story.name}
              onClick={() => setSelected(story)}
              className="flex min-w-0 flex-col rounded-xl border border-[#dce1e5] p-6 text-left transition-colors hover:bg-[#f8f7f3] sm:p-8"
            >
              <span
                className="text-4xl leading-none text-[#3158d8]"
                aria-hidden="true"
              >
                “
              </span>
              <p className="mt-4 mb-8 flex-1 text-xl leading-8 tracking-tight text-[#192738]">
                {story.quote}
              </p>
              <div className="flex items-end justify-between gap-3 border-t border-[#dce1e5] pt-5">
                <div>
                  <p className="font-medium text-[#192738]">{story.name}</p>
                  <p className="mt-1 text-xs text-[#657184]">{story.topic}</p>
                </div>
                <span className="text-xl text-[#3158d8]" aria-hidden="true">
                  ↗
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
      {selected && (
        <Modal onClose={() => setSelected(null)} titleId="testimonial-title">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow mb-2">Patient story</p>
              <h2
                id="testimonial-title"
                className="text-2xl font-medium text-[#192738]"
              >
                {selected.name}
              </h2>
            </div>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close details"
              className="h-11 w-11 shrink-0 rounded-lg text-2xl hover:bg-slate-100"
            >
              ×
            </button>
          </div>
          <p className="leading-8 text-[#657184]">{selected.detail}</p>
        </Modal>
      )}
    </section>
  );
}
