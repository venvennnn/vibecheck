import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Caveat, Instrument_Serif, Inter, Inter_Tight } from "next/font/google";
import { Header } from "@/components/vibecheck/header";
import { Providers } from "@/components/vibecheck/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const tight = Inter_Tight({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-tight" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", variable: "--font-serif" });
const note = Caveat({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-note" });

export const metadata: Metadata = {
  title: "VibeCheck",
  description: "Discover cultural partners and assemble a campaign portfolio.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${tight.variable} ${serif.variable} ${note.variable} h-full`}>
      <body className="min-h-full bg-white text-[#111111] antialiased">
        <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <Providers>
          <Header />
          <div id="content">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
