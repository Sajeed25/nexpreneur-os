import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isGstin, stateCodeOf } from "@/lib/gst";

const { organizations, locations } = schema;

/** Who is selling: the business profile, with a location's own details (name, GSTIN, address, logo, colour, footer) taking priority. */
export type Seller = {
  name: string; gstin: string; address: string; pincode: string; stateCode: string; phone: string; email: string;
  logoImageId: string | null; brandColor: string | null; footer: string | null; locationName: string | null;
};

export async function sellerFor(org: string, locationId: string | null): Promise<Seller> {
  const [o] = await db().select().from(organizations).where(eq(organizations.id, org));
  const [l] = locationId ? await db().select().from(locations).where(eq(locations.id, locationId)) : [];
  const gstin = (l?.gstin || o?.gstin || process.env.SELLER_GSTIN || "").trim().toUpperCase();
  return {
    name: l?.legalName || o?.legalName || process.env.SELLER_NAME || o?.name || "Nexpreneur",
    gstin,
    address: l?.address || o?.address || "",
    pincode: o?.pincode || "",
    // The state registration comes from the GSTIN when there is one; otherwise from the business profile; Telangana by default.
    stateCode: stateCodeOf(gstin) || o?.stateCode || "36",
    phone: l?.phone || o?.phone || "", email: l?.email || o?.email || "",
    logoImageId: l?.logoImageId ?? null, brandColor: l?.brandColor ?? null, footer: l?.invoiceFooter ?? null,
    locationName: l?.name ?? null,
  };
}

export const sellerReady = (s: Seller) => isGstin(s.gstin) && !!s.address && /^[1-9]\d{5}$/.test(s.pincode);
