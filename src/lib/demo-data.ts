// Deterministic demo data (seeded PRNG) so SSR and client agree.
export const LOCATIONS = [
  { id: "all", name: "All Locations" },
  { id: "hyd", name: "Hyderabad" },
  { id: "wgl", name: "Warangal" },
  { id: "nlg", name: "Nalgonda" },
] as const;
export type LocationId = "hyd" | "wgl" | "nlg";

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

const FIRST = ["Aarav", "Vivaan", "Ananya", "Diya", "Rohan", "Sneha", "Karthik", "Priya", "Arjun", "Meera", "Rahul", "Kavya", "Imran", "Fatima", "Sai", "Lakshmi", "Naveen", "Pooja", "Harsha", "Divya", "Vikram", "Ishita", "Ravi", "Swathi", "Mohit"];
const LAST = ["Reddy", "Sharma", "Rao", "Naidu", "Khan", "Patel", "Iyer", "Gupta", "Kumar", "Verma", "Chowdary", "Singh", "Shaik", "Nair"];
const COMPANIES = ["Zenith Labs", "BluePeak Studio", "Kiran Analytics", "Orbit Foods", "Pixelwise", "GreenLoop", "CodeNest", "Vistara Legal", "Anvaya Design", "Nimbus Cloud", "TerraGrid", "Lumen Media"];

export const PLANS = [
  { id: "flexi", name: "Flexi", price: 3999 },
  { id: "fixed", name: "Fixed Desk", price: 4999 },
  { id: "private", name: "Private Office", price: 19999 },
  { id: "virtual", name: "Virtual Office", price: 999 },
] as const;
const STATUSES = ["Active", "Active", "Active", "Active", "Trial", "Expiring", "Paused"] as const;
const PAY = ["Paid", "Paid", "Paid", "Due", "Overdue"] as const;

export type Member = {
  id: string; name: string; email: string; company: string; plan: string;
  location: LocationId; status: string; renewal: string; payment: string;
};

export const MEMBERS: Member[] = Array.from({ length: 64 }, (_, i) => {
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  const d = new Date(2026, 9, 1 + Math.floor(rnd() * 60));
  return {
    id: `m${i + 1}`, name,
    email: `${name.toLowerCase().replace(" ", ".")}${i}@example.in`,
    company: pick(COMPANIES), plan: pick(PLANS).name,
    location: i % 4 === 3 ? "wgl" : i % 7 === 6 ? "nlg" : "hyd",
    status: pick(STATUSES),
    renewal: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    payment: pick(PAY),
  };
});

export type Resource = {
  id: string; name: string; type: string; location: LocationId;
  capacity: number; price: string; status: string;
};
const RS = ["Available", "Available", "Available", "Booked", "Reserved", "Maintenance"];
const pad = (n: number) => String(n + 1).padStart(2, "0");
export const RESOURCES: Resource[] = [
  ...Array.from({ length: 16 }, (_, i): Resource => ({ id: `h${i}`, name: `Hot Desk H${pad(i)}`, type: "Hot Desk", location: "hyd", capacity: 1, price: "₹300/day", status: pick(RS) })),
  ...Array.from({ length: 6 }, (_, i): Resource => ({ id: `d${i}`, name: `Dedicated Desk D${pad(i)}`, type: "Dedicated Desk", location: "hyd", capacity: 1, price: "₹4,999/mo", status: pick(RS) })),
  { id: "mra", name: "Meeting Room A", type: "Meeting Room", location: "hyd", capacity: 6, price: "₹800/hr", status: "Available" },
  { id: "mrb", name: "Meeting Room B", type: "Meeting Room", location: "hyd", capacity: 8, price: "₹1,000/hr", status: "Booked" },
  { id: "pb1", name: "Phone Booth 1", type: "Phone Booth", location: "hyd", capacity: 1, price: "₹150/hr", status: "Available" },
  { id: "po1", name: "Private Office P1", type: "Private Office", location: "hyd", capacity: 6, price: "₹19,999/mo", status: "Reserved" },
  { id: "es1", name: "Event Space", type: "Event Space", location: "hyd", capacity: 60, price: "₹6,000/hr", status: "Available" },
  ...Array.from({ length: 4 }, (_, i): Resource => ({ id: `w${i}`, name: `Hot Desk W${pad(i)}`, type: "Hot Desk", location: "wgl", capacity: 1, price: "₹250/day", status: pick(RS) })),
  { id: "wmr", name: "Warangal Meeting Room", type: "Meeting Room", location: "wgl", capacity: 6, price: "₹600/hr", status: "Available" },
  ...Array.from({ length: 4 }, (_, i): Resource => ({ id: `n${i}`, name: `Hot Desk N${pad(i)}`, type: "Hot Desk", location: "nlg", capacity: 1, price: "₹200/day", status: pick(RS) })),
  { id: "nmr", name: "Nalgonda Meeting Room", type: "Meeting Room", location: "nlg", capacity: 6, price: "₹500/hr", status: "Maintenance" },
];

const months = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"];
export const REVENUE_TREND = months.map((m, i) => ({ m, revenue: 520000 + i * 62000 + Math.round(rnd() * 30000), mrr: 430000 + i * 51000 }));
export const OCCUPANCY_TREND = months.map((m, i) => ({ m, occupancy: 64 + i * 3 + Math.round(rnd() * 3) }));
export const MEMBER_GROWTH = months.map((m, i) => ({ m, members: 190 + i * 19 }));
export const BOOKING_TREND = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => ({ d, bookings: 20 + Math.round(rnd() * 40) }));

export const KPIS = [
  { label: "Monthly Revenue", value: "₹8,42,500", delta: "+12.4%", up: true },
  { label: "MRR", value: "₹6,84,000", delta: "+8.1%", up: true },
  { label: "Active Members", value: "284", delta: "+14", up: true },
  { label: "Occupancy", value: "82%", delta: "+3 pts", up: true },
  { label: "Bookings Today", value: "46", delta: "+6", up: true },
  { label: "Outstanding", value: "₹74,200", delta: "-5.2%", up: false },
];

export const TODAY = [
  { t: "09:30", text: "Rohan Reddy checked in — Hot Desk H04" },
  { t: "10:00", text: "Meeting Room A booked by Zenith Labs (2h)" },
  { t: "11:15", text: "Payment ₹4,999 received from Ananya Rao" },
  { t: "12:00", text: "Visitor Karthik Naidu arrived for Priya Sharma" },
];
export const UPCOMING_BOOKINGS = [
  { who: "Pixelwise", what: "Meeting Room B", when: "Today, 2:00 PM" },
  { who: "Sneha Iyer", what: "Phone Booth 1", when: "Today, 4:30 PM" },
  { who: "CodeNest", what: "Event Space", when: "Tomorrow, 6:00 PM" },
];
export const RECENT_PAYMENTS = [
  { who: "Ananya Rao", amt: "₹4,999", ref: "INV-0412" },
  { who: "BluePeak Studio", amt: "₹19,999", ref: "INV-0411" },
  { who: "Imran Khan", amt: "₹3,999", ref: "INV-0409" },
];
export const EVENTS = [
  { title: "Founders Breakfast", when: "Fri, 10 Oct · 9:00 AM" },
  { title: "Pitch Practice Night", when: "Tue, 14 Oct · 6:30 PM" },
  { title: "GST for Startups workshop", when: "Sat, 18 Oct · 11:00 AM" },
];
export const LEADS = [
  { name: "Vistara Legal", plan: "Private Office", value: "₹2,40,000" },
  { name: "Meera Chowdary", plan: "Flexi", value: "₹48,000" },
];
