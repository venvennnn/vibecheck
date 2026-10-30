import { DOMAIN_LABEL, type EntityType } from "@/lib/domains";

export function CategoryArt({ type, className }: { type: EntityType; className?: string }) {
  return (
    <div className={`relative flex h-full w-full items-end bg-white ${className ?? ""}`} aria-hidden>
      <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full">
        <rect width="400" height="300" fill="#ffffff" />
        <path d="M20 240h360M40 40v200M200 20v240" stroke="#DEDEDE" strokeWidth="1" />
        <circle cx="250" cy="120" r="46" fill="none" stroke="#2144ED" strokeWidth="2" />
        <path d="M70 190l80-90 50 40 70-80" fill="none" stroke="#F05A36" strokeWidth="2" />
      </svg>
      <p className="relative z-10 p-3 text-[12px] uppercase tracking-[0.14em] text-[#626262]">
        {DOMAIN_LABEL[type]} · category artwork
      </p>
    </div>
  );
}
