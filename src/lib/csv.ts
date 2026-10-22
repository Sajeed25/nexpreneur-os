// Shared CSV helpers. Spreadsheet apps run text that starts with = + - @ as a formula, so any text cell that does is neutralised.

export const csvCell = (v: string | number | null | undefined) => {
  if (v == null) return "";
  const t = String(v);
  // A plain number (even a negative one written as text, like "-500.00") can't be a formula, so it stays a number.
  const safe = typeof v === "string" && /^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t) ? `'${t}` : t;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const csvRow = (...c: (string | number | null | undefined)[]) => c.map(csvCell).join(",");

/** Paise to a plain number of rupees with two decimals, e.g. 471882 -> "4718.82" (no thousands separators, so imports parse it). */
export const rs = (paise: number) => {
  const v = Math.round(paise) / 100;
  return (v === 0 ? 0 : v).toFixed(2); // never "-0.00"
};
