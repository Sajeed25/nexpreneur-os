// Location keys used by the top-bar selector: "all", a location id (uuid), or - in demo mode only - hyd / wgl / nlg.
export type LocRow = { id: string; name: string; city: string | null };

const LEGACY: Record<string, string> = { hyd: "Hyderabad", wgl: "Warangal", nlg: "Nalgonda" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isAllLocations = (key?: string | null) => !key || key === "all";

/** Ids of the locations a key refers to: every location for "all", one for an id, none for something unknown. */
export function matchLocations(rows: LocRow[], key?: string | null): string[] {
  if (isAllLocations(key)) return rows.map((r) => r.id);
  if (UUID.test(key!)) return rows.filter((r) => r.id === key).map((r) => r.id);
  const city = LEGACY[key!];
  return city ? rows.filter((r) => r.city === city).map((r) => r.id) : [];
}
