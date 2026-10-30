import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Note({
  className,
  rotate = -2,
  tone = "ink",
  children,
}: {
  className?: string;
  rotate?: number;
  tone?: "ink" | "vermilion";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-20 border border-[#DEDEDE] bg-white px-3 py-2 font-note text-[20px] leading-[1.05] text-[#111111]",
        tone === "vermilion" && "text-[#F05A36]",
        className,
      )}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {children}
    </div>
  );
}
