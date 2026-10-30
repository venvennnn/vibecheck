import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BriefEnvelope, LiveDiscoveries } from "@/components/vibecheck/session-preview";

const steps = [
  {
    n: "01",
    kicker: "Input",
    title: "Set the brief",
    copy: "Name the brand, the city, the budget, and at least two cultural references you can confirm.",
    foot: "Validated seeds",
  },
  {
    n: "02",
    kicker: "Graph",
    title: "Find the connection",
    copy: "Qloo returns culturally connected artists, books, podcasts, places, and brands. Affinity is a signal, not a booking.",
    foot: "Qloo cultural signal",
  },
  {
    n: "03",
    kicker: "Output",
    title: "Build the portfolio",
    copy: "Choose a complementary mix, record what you actually know about cost and rights, and export a proposal.",
    foot: "Reviewed proposal",
  },
];

const preview = [
  { src: "/collage/runners.jpg", caption: "Runners", note: "Design preview" },
  { src: "/collage/vinyl.jpg", caption: "Listening", note: "Design preview" },
  { src: "/collage/books.jpg", caption: "Books", note: "Design preview" },
];

export function Landing() {
  return (
    <main className="bg-white">
      <section id="idea" className="grid min-h-[640px] grid-cols-1 border-b border-[#DEDEDE] lg:grid-cols-12">
        <div className="flex flex-col justify-between border-b border-[#DEDEDE] px-5 py-10 md:px-12 lg:col-span-5 lg:border-r lg:border-b-0 lg:py-14">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-[#2144ED] uppercase">
              <span className="inline-block size-2 bg-[#2144ED]" aria-hidden />
              Cultural intelligence, put to work.
            </p>
            <h1 className="hero-title mt-6 text-[#111111]">
              Great brands keep <em className="font-serif font-normal text-[#2144ED] italic">unexpected</em> company.
            </h1>
            <p className="mt-6 max-w-[520px] text-[18px] leading-relaxed text-[#111111]">
              Discover the artists, places and communities your next collaboration belongs with.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild className="uppercase tracking-[0.12em]">
                <Link href="/brief">Explore my brand</Link>
              </Button>
              <Button variant="outline" asChild className="uppercase tracking-[0.12em]">
                <Link href="/brief?demo=1">Try the demo</Link>
              </Button>
            </div>
            <p className="mt-6 text-[13px] text-[#626262]">Powered by Qloo · No signup needed.</p>
          </div>
          <BriefEnvelope />
        </div>
        <div className="bg-white px-5 py-8 md:px-12 lg:col-span-7 lg:py-12">
          <div className="border border-[#DEDEDE] p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#DEDEDE] pb-3 text-[11px] font-semibold tracking-[0.14em] text-[#626262] uppercase">
              <span>Design preview</span>
              <span className="text-[#F05A36]">Not a live recommendation</span>
            </div>
            <div className="grid gap-4 md:grid-cols-12">
              <figure className="border border-[#DEDEDE] bg-white p-2 md:col-span-7">
                <Image src={preview[0].src} alt="" width={960} height={540} className="aspect-[4/3] w-full object-cover" />
                <figcaption className="px-1 pt-2">
                  <p className="text-[18px] font-semibold">{preview[0].caption}</p>
                  <p className="text-[12px] text-[#626262]">Illustrative photograph · {preview[0].note}</p>
                </figcaption>
              </figure>
              <div className="grid gap-4 md:col-span-5">
                {preview.slice(1).map((item) => (
                  <figure key={item.src} className="border border-[#DEDEDE] bg-white p-2">
                    <Image src={item.src} alt="" width={800} height={600} className="aspect-[16/10] w-full object-cover" />
                    <figcaption className="px-1 pt-2">
                      <p className="text-[16px] font-semibold">{item.caption}</p>
                      <p className="text-[12px] text-[#626262]">Illustrative photograph · {item.note}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="method" className="grid grid-cols-1 border-b border-[#DEDEDE] md:grid-cols-3 md:divide-x md:divide-[#DEDEDE]">
        {steps.map((step) => (
          <article key={step.n} className="flex flex-col justify-between px-5 py-10 md:px-10">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#2144ED] uppercase">Step {step.n}</p>
              <h2 className="mt-3 text-[18px] font-semibold tracking-[-0.02em] uppercase">{step.title}</h2>
              <p className="mt-3 max-w-[360px] text-[15px] leading-relaxed text-[#626262]">{step.copy}</p>
            </div>
            <p className="mt-8 flex items-center justify-between border-t border-[#DEDEDE] pt-3 text-[12px] text-[#626262]">
              <span className="uppercase tracking-[0.12em]">{step.kicker}</span>
              <span className="font-semibold text-[#111111]">{step.foot}</span>
            </p>
          </article>
        ))}
      </section>

      <LiveDiscoveries />
    </main>
  );
}
