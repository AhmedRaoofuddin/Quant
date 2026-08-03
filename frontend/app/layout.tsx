import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { Topbar } from "@/components/Topbar";
import { Footer } from "@/components/Footer";

// Three roles: an elegant transitional serif carries titles and large figures
// (institutional editorial), Inter carries dense body copy, mono carries tabular data.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const display = Newsreader({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Alpha-Forge Terminal",
  description: "Quantitative research and execution terminal on real market data.",
};

/**
 * Header, content, footer, sharing one content rail.
 *
 * The `max-w-[1680px] px-4 lg:px-6` measure is repeated in the header and footer rather than
 * wrapped around all three, because both need a full-bleed background with only their contents
 * constrained. Keeping the three in sync is what puts the logo, the first table column and the
 * footer headings on one vertical line.
 *
 * `min-h-dvh` with `flex-1` on main pins the footer to the bottom of short pages instead of
 * letting it float halfway up.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <Topbar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1680px] px-4 py-4 lg:px-6">{children}</div>
        </main>
        <Footer />
      </body>
    </html>
  );
}
