import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

// Outfit: a geometric rounded sans that matches the Nexpreneur wordmark.
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Nexpreneur OS",
  description: "The Intelligent Operating System for Modern Coworking Spaces.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable} suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
