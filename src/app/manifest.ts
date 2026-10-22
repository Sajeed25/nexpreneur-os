import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nexpreneur OS",
    short_name: "Nexpreneur",
    description: "Book spaces, pay invoices and stay in the loop at your coworking space.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f8fb",
    theme_color: "#042341",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Book a space", short_name: "Book", url: "/bookings/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Invoices", url: "/invoices", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Notifications", url: "/notifications", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
