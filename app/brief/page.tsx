import Image from "next/image";
import { Suspense } from "react";
import { BriefForm } from "@/components/vibecheck/brief-form";
import { Note } from "@/components/vibecheck/notes";

export default function BriefPage() {
  return (
    <main className="mx-auto grid max-w-[1440px] gap-12 px-5 py-10 md:px-12 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)] lg:py-14">
      <Suspense fallback={<p className="text-[#626262]">Loading the brief…</p>}>
        <BriefForm />
      </Suspense>
      <aside className="relative hidden min-h-[760px] lg:block" aria-hidden>
        <figure className="absolute top-0 right-0 w-[78%] border border-[#DEDEDE] bg-white">
          <Image src="/collage/runners.jpg" alt="" width={960} height={540} className="aspect-[16/10] w-full object-cover" />
        </figure>
        <Note className="top-6 left-0 w-36" rotate={-6}>
          Movement
          <br />
          people culture
          <br />
          brighter cities
        </Note>
        <figure className="absolute top-[34%] left-0 w-[58%] border border-[#DEDEDE] bg-white">
          <Image src="/collage/vinyl.jpg" alt="" width={800} height={600} className="aspect-[4/3] w-full object-cover" />
        </figure>
        <Note className="top-[36%] left-[54%] w-28" rotate={-2}>
          Music brings people together
        </Note>
        <div className="absolute top-[58%] right-0 flex size-36 items-center justify-center bg-[#2144ED] text-center font-tight text-[18px] font-extrabold tracking-[-0.04em] text-white">
          YOUR
          <br />
          CULTURAL
          <br />
          DNA
        </div>
        <Note className="top-[46%] right-0 w-32" rotate={3} tone="vermilion">
          The more specific, the more interesting.
        </Note>
        <figure className="absolute bottom-16 left-0 w-[48%] border border-[#DEDEDE] bg-white">
          <Image src="/collage/table.jpg" alt="" width={800} height={600} className="aspect-[4/3] w-full object-cover" />
        </figure>
        <Note className="bottom-40 left-[8%] w-32" rotate={-4} tone="vermilion">
          Local culture
          <br />
          IRL moments
        </Note>
        <figure className="absolute right-0 bottom-0 w-[42%] border border-[#DEDEDE] bg-white">
          <Image src="/collage/books.jpg" alt="" width={600} height={800} className="aspect-[3/4] w-full object-cover" />
        </figure>
        <Note className="right-2 bottom-6 w-28" rotate={2} tone="vermilion">
          Ideas into action
        </Note>
        <p className="absolute bottom-0 left-0 text-[12px] text-[#626262]">Powered by Qloo · Design preview</p>
      </aside>
    </main>
  );
}
