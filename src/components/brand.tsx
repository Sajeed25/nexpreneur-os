import { cn } from "@/lib/utils";

/** The logo mark on a white tile (the artwork has a white background, so the tile keeps it clean in dark mode too). */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/mark.png" alt="" width={size} height={size} style={{ width: size, height: size }} className={cn("shrink-0 rounded-xl bg-white object-contain p-0.5", className)} />
  );
}

/** "nex" in navy, "preneur" in orange, set in the brand font, like the logo. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("select-none text-[22px] font-semibold lowercase leading-none tracking-tight", className)} aria-label="Nexpreneur">
      <span className="text-[#042341] dark:text-white">nex</span>
      <span className="text-brand">preneur</span>
    </span>
  );
}
