"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/vibecheck/logo";
import { Button } from "@/components/ui/button";
import { useCampaign } from "@/lib/store/campaign-store";
import { cn } from "@/lib/utils";

const land = [
  { href: "/#idea", label: "The idea" },
  { href: "/#method", label: "How it works" },
  { href: "/canvas", label: "Explore" },
];

const app = [
  { href: "/brief", label: "Your brief" },
  { href: "/canvas", label: "The canvas" },
  { href: "/portfolio", label: "Your portfolio" },
];

export function Header() {
  const path = usePathname();
  const router = useRouter();
  const clearSession = useCampaign((state) => state.clearSession);
  const inApp = ["/brief", "/canvas", "/portfolio", "/compare"].some((item) => path.startsWith(item));
  const links = inApp ? app : land;

  function anotherBrand() {
    if (typeof window !== "undefined" && !window.confirm("Clear this session and start another brand?")) return;
    clearSession();
    router.push("/brief");
  }

  return (
    <header className="no-print sticky top-0 z-40 min-h-[72px] border-b border-[#DEDEDE] bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 md:h-[72px] md:flex-nowrap md:px-12 md:py-0">
        <Logo />
        <nav className="order-3 flex w-full items-center gap-5 md:order-none md:flex-1 md:justify-center" aria-label="Primary">
          {links.map((link) => {
            const active = path === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "inline-flex min-h-11 items-center text-[15px] text-[#111111]",
                  active && "underline decoration-[#F05A36] decoration-2 underline-offset-8",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 md:gap-3">
          {inApp ? (
            <>
              <button type="button" className="hidden min-h-11 text-[13px] text-[#626262] underline-offset-4 hover:underline lg:inline" onClick={() => clearSession()}>
                Clear session
              </button>
              <Button variant="outline" onClick={anotherBrand}>
                Try another brand
              </Button>
              {path.startsWith("/brief") ? (
                <Button asChild>
                  <Link href="/canvas">Explore the canvas</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/portfolio">Build campaign</Link>
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" asChild>
                <Link href="/brief?demo=1">Try the demo</Link>
              </Button>
              <Button asChild>
                <Link href="/brief">Start a campaign</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
