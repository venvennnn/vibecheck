import { Suspense } from "react";
import { GraphScreen } from "@/components/vibecheck/graph-screen";

export default function GraphPage() {
  return (
    <Suspense fallback={<p className="px-8 py-12 text-[#626262]">Opening the cultural graph…</p>}>
      <GraphScreen />
    </Suspense>
  );
}
