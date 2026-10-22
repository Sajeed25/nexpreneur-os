import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

// Outfit: a geometric rounded sans that matches the Nexpreneur wordmark.
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Nexpreneur OS",
  description: "The Intelligent Operating System for Modern Coworking Spaces.",
  applicationName: "Nexpreneur OS",
  appleWebApp: { capable: true, title: "Nexpreneur", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#042341" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable} suppressHydrationWarning>
      <body className="antialiased">{children}<PwaRegister /></body>
    </html>
  );
}
