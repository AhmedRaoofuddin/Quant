import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { Topbar } from "@/components/Topbar";
import { Sidebar } from "@/components/Sidebar";

// Three roles: an elegant transitional serif carries titles and large figures
// (institutional editorial), Inter carries dense body copy, mono carries tabular data.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const display = Newsreader({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Alpha-Forge Terminal",
  description: "Quantitative research and execution terminal on real market data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body className="min-h-screen">
        <Topbar />
        <div className="flex">
          <Sidebar />
          <main className="min-w-0 flex-1 px-3 py-3 lg:px-4">
            <div className="mx-auto w-full max-w-[1680px]">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
