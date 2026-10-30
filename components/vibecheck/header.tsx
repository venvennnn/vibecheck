"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/vibecheck/logo";
import { useCampaign } from "@/lib/store/campaign-store";
import { cn } from "@/lib/utils";

const links = [
  { href: "/#idea", label: "The idea", match: (path: string) => path === "/" },
  { href: "/#method", label: "How it works", match: () => false },
  { href: "/canvas", label: "Explore", match: (path: string) => path.startsWith("/canvas") },
  { href: "/graph", label: "Cultural graph", match: (path: string) => path.startsWith("/graph") },
  { href: "/portfolio", label: "Optimizer", match: (path: string) => path.startsWith("/portfolio") },
];

export function Header() {
  const path = usePathname();
  const router = useRouter();
  const clearSession = useCampaign((state) => state.clearSession);

  function anotherBrand() {
    if (typeof window !== "undefined" && !window.confirm("Clear this session and start another brand?")) return;
    clearSession();
    router.push("/brief");
  }

  return (
    <header className="no-print sticky top-0 z-40 border-b border-[#DEDEDE] bg-white">
      <div className="mx-auto max-w-[1600px] px-5 md:px-8">
        <div className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 py-2">
          <Logo />
          <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
            <p className="hidden items-center gap-2 border border-[#DEDEDE] px-3 py-2 text-[12px] text-[#626262] 2xl:flex">
              <span className="size-1.5 bg-[#2144ED]" aria-hidden />
              Session only · cleared on close
            </p>
            <button type="button" className="hidden min-h-11 text-[12px] text-[#626262] underline-offset-4 hover:underline lg:inline" onClick={() => clearSession()}>
              Clear session
            </button>
            <Button variant="outline" className="uppercase tracking-[0.12em]" onClick={anotherBrand}>
              Try another brand
            </Button>
            <Button variant="outline" asChild className="hidden uppercase tracking-[0.12em] sm:inline-flex">
              <Link href="/brief?demo=1">Try the demo</Link>
            </Button>
            <Button asChild className="uppercase tracking-[0.12em]">
              <Link href="/portfolio">Build portfolio</Link>
            </Button>
          </div>
        </div>
        <nav className="flex w-full flex-wrap items-center gap-x-5" aria-label="Primary">
          {links.map((link) => {
            const active = link.match(path);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center text-[11px] font-semibold tracking-[0.14em] uppercase",
                  active ? "border-b-2 border-[#2144ED] text-[#111111]" : "border-b-2 border-transparent text-[#626262] hover:text-[#111111]",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
