import { Suspense } from "react";
import { PortfolioScreen } from "@/components/vibecheck/portfolio-screen";

export default function PortfolioPage() {
  return (
    <Suspense fallback={<p className="px-8 py-12 text-[#626262]">Opening the proposal…</p>}>
      <PortfolioScreen />
    </Suspense>
  );
}
