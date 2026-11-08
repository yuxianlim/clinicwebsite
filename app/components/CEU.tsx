import Link from 'next/link';

export default function CEU() {
  return <section id="ceu" className="scroll-mt-24 bg-[#eef1fb] px-5 py-16 sm:px-8 sm:py-24">
    <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.5fr_1fr]">
      <div><p className="eyebrow mb-4">Whitewater University of California / Learning</p>
        <h2 className="section-title mb-5">Keep your curiosity growing.</h2>
        <p className="max-w-2xl text-lg leading-8 text-[#657184]">Your own space for courses, learning progress, payment records and completion documents. Create an account or sign in to explore.</p>
        <Link href="/learn" className="mt-7 inline-flex min-h-12 items-center rounded-xl bg-[#3158d8] px-6 py-3 font-semibold text-white">Open learning workspace</Link>
      </div>
      <div className="rounded-2xl border border-[#dce1e8] bg-white p-7"><p className="eyebrow">Development preview</p><h3 className="mt-3 text-2xl font-semibold">A place to try the journey.</h3><p className="mt-4 leading-7 text-[#657184]">The current catalogue contains fictional demo courses and uses Stripe sandbox payments. Sample certificates do not award approved CE credit.</p></div>
    </div>
  </section>;
}
