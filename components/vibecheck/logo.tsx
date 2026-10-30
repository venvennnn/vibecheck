import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3 text-[#111111]" aria-label="VibeCheck home">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <path
          d="M16 3v26M3 16h26M6.2 6.2l19.6 19.6M25.8 6.2 6.2 25.8"
          stroke="#F05A36"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
      <span className="flex items-center gap-2">
        <span className="text-[15px] font-semibold tracking-[0.14em]">VIBECHECK</span>
        <span className="hidden border-l border-[#DEDEDE] pl-2 text-[11px] font-semibold tracking-[0.16em] text-[#626262] sm:inline">
          INTELLIGENCE
        </span>
      </span>
    </Link>
  );
}
