/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// Razorpay Checkout needs its script, frames, API and image hosts. Set CSP_REPORT_ONLY=1 to log violations instead of blocking.
const csp = [
  "default-src 'self'",
  // Next.js injects small inline bootstrap scripts; no eval in production.
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
  "img-src 'self' data: blob: https://*.razorpay.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://checkout.razorpay.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "form-action 'self' https://api.razorpay.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const security = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(isProd ? [
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    { key: process.env.CSP_REPORT_ONLY === "1" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", value: csp },
  ] : []),
];

module.exports = {
  poweredByHeader: false,
  experimental: { optimizePackageImports: ["lucide-react", "recharts"] },
  async headers() {
    return [{ source: "/:path*", headers: security }];
  },
};
