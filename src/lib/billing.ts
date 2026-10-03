// Shared (client + server) billing rules. Amounts are integer paise. Seller state: Telangana.
export const SELLER_STATE = "Telangana";
export const MANAGER_ROLES = ["super_admin", "owner", "location_manager"] as const;
export const FINANCE_ROLES = [...MANAGER_ROLES, "finance"] as const;
export const isFinance = (role: string) => (FINANCE_ROLES as readonly string[]).includes(role);
export const isManager = (role: string) => (MANAGER_ROLES as readonly string[]).includes(role);

export type Line = { description: string; qty: number; unitPaise: number; taxPct: number; hsnSac?: string };

/**
 * GST split: same state => CGST + SGST (half each); different state => IGST.
 * A discount reduces the taxable value, shared across lines in proportion to their value (GST is charged on the discounted price).
 * Rounded once per invoice, not per line.
 */
export function gst(lines: Line[], interstate: boolean, discountPaise = 0) {
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPaise, 0);
  const discount = Math.max(0, Math.min(Math.round(discountPaise), subtotal));
  let left = discount;
  const net = lines.map((l, i) => {
    const gross = l.qty * l.unitPaise;
    const share = i === lines.length - 1 ? left : Math.round((discount * gross) / (subtotal || 1));
    left -= share;
    return { gross: gross - share, pct: l.taxPct };
  });
  const tax = Math.round(net.reduce((s, l) => s + (l.gross * l.pct) / 100, 0));
  const cgst = interstate ? 0 : Math.floor(tax / 2);
  const sgst = interstate ? 0 : tax - cgst;
  const igst = interstate ? tax : 0;
  return { subtotal, discount, cgst, sgst, igst, total: subtotal - discount + tax };
}

/** Coupon value in paise for a given subtotal. Percent coupons round to the nearest paisa; fixed coupons never exceed the subtotal. */
export function couponDiscount(kind: "percent" | "fixed", value: number, subtotalPaise: number) {
  const d = kind === "percent" ? Math.round((subtotalPaise * Math.min(100, Math.max(0, value))) / 100) : value;
  return Math.max(0, Math.min(d, subtotalPaise));
}

export type InvoiceStatus = "unpaid" | "partial" | "paid" | "void" | "overdue";
/** Status after a payment or refund changes the amount paid. */
export const statusFor = (totalPaise: number, paidPaise: number): "unpaid" | "partial" | "paid" =>
  paidPaise >= totalPaise ? "paid" : paidPaise > 0 ? "partial" : "unpaid";

export function displayStatus(i: { status: string; dueDate: string }, today: string): InvoiceStatus {
  if ((i.status === "unpaid" || i.status === "partial") && i.dueDate < today) return "overdue";
  return i.status as InvoiceStatus;
}
export const INV_LABEL: Record<string, string> = { unpaid: "Unpaid", partial: "Part paid", paid: "Paid", void: "Void", overdue: "Overdue" };
export const INV_TONE: Record<string, "green" | "amber" | "red" | "grey" | "blue"> = { unpaid: "amber", partial: "blue", paid: "green", void: "grey", overdue: "red" };

export const invoiceNumber = (year: number, seq: number) => `INV-${year}-${String(seq).padStart(4, "0")}`;
export const toPaise = (rupees: number) => Math.round(rupees * 100);

export function addMonths(isoDate: string, n: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + n);
  if (d.getUTCDate() !== day) d.setUTCDate(0); // 31 Jan + 1 month => 28/29 Feb
  return d.toISOString().slice(0, 10);
}
export const CYCLE_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };
export const addDays = (isoDate: string, n: number) => new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
