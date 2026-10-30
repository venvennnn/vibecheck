import { Suspense } from "react";
import { CompareScreen } from "@/components/vibecheck/compare-screen";

export default function ComparePage() {
  return (
    <Suspense fallback={<p className="px-8 py-12 text-[#626262]">Opening the comparison…</p>}>
      <CompareScreen />
    </Suspense>
  );
}
