// Shared phone helpers. Numbers are stored as typed; messaging providers want digits with the country code.

/** Digits with country code (India by default), or null when it can't be a mobile number. */
export function normalizePhone(raw: string | null | undefined, defaultCountry = "91"): string | null {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, "");
  const hadPlus = d.startsWith("+");
  d = d.replace(/\D/g, "");
  if (!hadPlus) {
    if (d.startsWith("00")) d = d.slice(2);
    else if (d.length === 11 && d.startsWith("0")) d = defaultCountry + d.slice(1); // 09876543210
    else if (d.length === 10) d = defaultCountry + d;
  }
  if (defaultCountry === "91" && d.startsWith("91") && d.length === 12 && !/^91[6-9]/.test(d)) return null; // Indian mobiles start with 6-9
  return d.length >= 11 && d.length <= 15 ? d : null;
}

/** "98••••3210", for showing a number without exposing it. */
export function maskPhone(p: string | null | undefined) {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length < 6 ? "" : `${d.slice(0, 2)}${"•".repeat(Math.max(2, d.length - 6))}${d.slice(-4)}`;
}

/** WhatsApp template parameters can't contain newlines, tabs or long runs of spaces. */
export const oneLine = (s: string, max = 400) => s.replace(/\s+/g, " ").trim().slice(0, max);
