import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const steps = [
  {
    n: "01",
    title: "Set the brief",
    copy: "Name the brand, the city, the budget, and at least two cultural references you can confirm.",
  },
  {
    n: "02",
    title: "Find the connection",
    copy: "Qloo returns culturally connected artists, books, podcasts, places, and brands. Affinity is a signal, not a booking.",
  },
  {
    n: "03",
    title: "Build the partnership",
    copy: "Choose a complementary mix, record what you actually know about cost and rights, and export a proposal.",
  },
];

export function Landing() {
  return (
    <main>
      <section id="idea" className="mx-auto grid max-w-[1440px] items-center gap-10 px-5 py-10 md:px-12 lg:grid-cols-[44fr_56fr] lg:py-14">
        <div>
          <p className="text-[12px] uppercase tracking-[0.16em] text-[#626262]">Cultural intelligence, put to work.</p>
          <h1 className="hero-title mt-4 text-[#111111]">
            Great brands keep <em className="font-serif font-normal text-[#2144ED] italic">unexpected</em> company.
          </h1>
          <p className="mt-6 max-w-[520px] text-[18px] text-[#111111]">
            Discover the artists, places and communities your next collaboration belongs with.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link href="/brief">Explore my brand</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/brief?demo=1">See a demo</Link>
            </Button>
          </div>
          <p className="mt-6 text-[13px] text-[#626262]">Powered by Qloo · No signup needed.</p>
        </div>
        <div className="relative min-h-[520px] overflow-hidden bg-[#2144ED] p-6 sm:min-h-[620px] sm:p-8">
          <figure className="absolute top-8 right-8 w-[58%] border-[8px] border-white bg-white">
            <figcaption className="px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-[#111111]">01 Runners</figcaption>
            <Image src="/collage/runners.jpg" alt="" width={960} height={540} className="aspect-[16/10] w-full object-cover" />
          </figure>
          <figure className="absolute top-[42%] left-8 w-[46%] border-[8px] border-white bg-white">
            <figcaption className="px-2 py-1 text-[11px] uppercase tracking-[0.14em]">02 Listening</figcaption>
            <Image src="/collage/vinyl.jpg" alt="" width={800} height={600} className="aspect-[4/3] w-full object-cover" />
          </figure>
          <figure className="absolute bottom-10 left-[36%] w-[32%] border-[8px] border-white bg-white">
            <figcaption className="px-2 py-1 text-[11px] uppercase tracking-[0.14em]">03 Community</figcaption>
            <Image src="/collage/table.jpg" alt="" width={800} height={600} className="aspect-[4/3] w-full object-cover" />
          </figure>
          <figure className="absolute right-8 bottom-8 w-[26%] border-[8px] border-white bg-white">
            <figcaption className="px-2 py-1 text-[11px] uppercase tracking-[0.14em]">04 Books</figcaption>
            <Image src="/collage/books.jpg" alt="" width={600} height={800} className="aspect-[3/4] w-full object-cover" />
          </figure>
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <path d="M30 48 C 48 42, 58 70, 72 62" fill="none" stroke="#F05A36" strokeWidth="0.6" />
          </svg>
        </div>
      </section>
      <div className="border-t border-[#DEDEDE]">
        <section id="method" className="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 md:grid-cols-3 md:px-12">
          {steps.map((step) => (
            <article key={step.n}>
              <p className="text-[12px] tracking-[0.16em] text-[#626262]">{step.n}</p>
              <h2 className="font-tight mt-3 text-[28px] font-bold tracking-[-0.03em]">{step.title}</h2>
              <p className="mt-3 max-w-[360px] text-[16px] text-[#626262]">{step.copy}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
