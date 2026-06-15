import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Two weights only — design system §2 typography.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Knowledge Graph",
  description: "A cross-source synthesis instrument.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
