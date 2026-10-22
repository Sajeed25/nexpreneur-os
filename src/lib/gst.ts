// Shared (client + server) GST identifiers. No database access.

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const isGstin = (v: string | null | undefined) => !!v && GSTIN_RE.test(v.trim().toUpperCase());
export const stateCodeOf = (gstin: string | null | undefined) => (isGstin(gstin) ? gstin!.trim().slice(0, 2) : null);

/** GST state / UT codes, for showing a place of supply by name. */
export const STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
  "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
  "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala",
  "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
};

/** A 6-digit PIN code anywhere in a free-text address (the last one wins), or null. */
export function pinFrom(address: string | null | undefined): string | null {
  const m = [...(address ?? "").matchAll(/(?<!\d)[1-9]\d{5}(?!\d)/g)];
  return m.length ? m[m.length - 1][0] : null;
}
