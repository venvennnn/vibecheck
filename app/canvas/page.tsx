import { Suspense } from "react";
import { CanvasScreen } from "@/components/vibecheck/canvas-screen";

export default function CanvasPage() {
  return (
    <Suspense fallback={<p className="px-8 py-12 text-[#626262]">Opening the canvas…</p>}>
      <CanvasScreen />
    </Suspense>
  );
}
