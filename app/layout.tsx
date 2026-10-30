import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Caveat, Inter, Inter_Tight, Playfair_Display } from "next/font/google";
import { Header } from "@/components/vibecheck/header";
import { Providers } from "@/components/vibecheck/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const tight = Inter_Tight({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-tight" });
const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
});
const note = Caveat({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-note" });

export const metadata: Metadata = {
  title: "VibeCheck",
  description: "Discover cultural partners and assemble a campaign portfolio.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${tight.variable} ${display.variable} ${note.variable} h-full`}>
      <body className="min-h-full bg-white text-[#111111] antialiased">
        <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <Providers>
          <Header />
          <div id="content">{children}</div>
          <footer className="no-print border-t border-[#DEDEDE] bg-white">
            <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 py-8 text-[12px] uppercase tracking-[0.14em] text-[#626262] md:flex-row md:items-center md:justify-between md:px-12">
              <p>
                <span className="text-[#111111]">VibeCheck</span>
                <span className="mx-3">·</span>
                Session only. Cleared when you close the tab or choose Clear session.
              </p>
              <p>Qloo affinity is a cultural signal, not a price or a booking.</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
