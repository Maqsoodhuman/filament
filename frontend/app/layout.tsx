import type { Metadata } from "next";
import { Space_Grotesk, Newsreader, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import CommandPalette from "@/components/CommandPalette";

// Filament's four fonts — this is ~70% of why the design reads premium
// (docs/COHESIVE_DESIGN.md §1). Keep all four:
//   Space Grotesk → brand / headings
//   Newsreader (incl. italic) → reading body + hero em
//   Inter → UI chrome
//   JetBrains Mono → meta / tags / q-weights
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-brand",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-read",
  display: "swap",
  // Newsreader is an optical-size (variable) font; Next can't compute fallback
  // metrics for it, which logs a noisy build warning. We control the serif
  // fallback ourselves (Georgia) in --f-read, so opt out of the auto-adjust.
  adjustFontFallback: false,
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ui",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Filament — notes that connect",
  description:
    "A cross-source synthesis instrument. It surfaces genuinely non-obvious, true connections across everything you read.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${newsreader.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-paper font-ui text-text antialiased">
        {children}
        {/* Global ⌘K command palette — mounted once, opens on Cmd/Ctrl+K. */}
        <CommandPalette />
      </body>
    </html>
  );
}
