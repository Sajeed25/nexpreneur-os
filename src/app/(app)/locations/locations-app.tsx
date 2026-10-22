"use client";
import * as React from "react";
import { MapPin, Plus } from "lucide-react";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { archiveLocation, listLocationRows, saveLocation, saveLocationBranding, type LocationRow } from "./actions";
import { uploadImage } from "@/app/images/actions";
import { resizeToJpeg } from "@/lib/client-image";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

export function LocationsApp() {
  const [rows, setRows] = React.useState<LocationRow[]>([]);
  const [canEdit, setCanEdit] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [form, setForm] = React.useState<"new" | string | null>(null);
  const [brand, setBrand] = React.useState<string | null>(null);
  const [logo, setLogo] = React.useState<string | null | undefined>(undefined); // undefined = unchanged

  React.useEffect(() => {
    let live = true;
    listLocationRows().then((r) => {
      if (!live) return;
      setLoading(false);
      if (r.ok) { setError(null); setRows(r.data.rows); setCanEdit(r.data.canEdit); } else setError(r.error);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load locations."); } });
    return () => { live = false; };
  }, [tick]);

  const save = async (e: React.FormEvent<HTMLFormElement>, id: string | null) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await saveLocation(id, { name: String(f.get("name")), city: String(f.get("city") ?? "") });
    setBusy(false);
    if (!r.ok) setError(r.error); else { setError(null); setForm(null); setTick((t) => t + 1); }
  };
  const archive = async (l: LocationRow) => {
    if (!window.confirm(`Archive ${l.name}?`)) return;
    const r = await archiveLocation(l.id);
    if (!r.ok) setError(r.error); else { setError(null); setTick((t) => t + 1); }
  };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError(null);
    const blob = await resizeToJpeg(file, 600, 0.9);
    if (!blob) { setBusy(false); return setError("That file isn't a readable image."); }
    const fd = new FormData(); fd.set("file", new File([blob], "logo.jpg", { type: "image/jpeg" }));
    const r = await uploadImage(fd);
    setBusy(false);
    if (!r.ok) setError(r.error); else setLogo(r.id);
  };
  const saveBrand = async (e: React.FormEvent<HTMLFormElement>, l: LocationRow) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget), g = (k: string) => String(f.get(k) ?? "");
    setBusy(true);
    const r = await saveLocationBranding(l.id, { legalName: g("legalName"), gstin: g("gstin"), address: g("address"), phone: g("phone"), email: g("email"), brandColor: f.get("useColor") ? g("brandColor") : "", invoiceFooter: g("invoiceFooter"), logoImageId: logo === undefined ? l.logoImageId : logo });
    setBusy(false);
    if (!r.ok) setError(r.error); else { setError(null); setBrand(null); setLogo(undefined); setTick((t) => t + 1); }
  };

  const BrandForm = ({ l }: { l: LocationRow }) => {
    const shown = logo === undefined ? l.logoImageId : logo;
    return (
      <form onSubmit={(e) => saveBrand(e, l)} className="space-y-3">
        <p className="text-sm text-muted">Printed on this location&apos;s invoices, credit notes and emails. Leave a field empty to use the business profile (Settings).</p>
        <label className="block text-sm font-medium">Legal name<input name="legalName" defaultValue={l.legalName} maxLength={160} className={field} /></label>
        <label className="block text-sm font-medium">GSTIN<input name="gstin" defaultValue={l.gstin} maxLength={15} className={field} style={{ textTransform: "uppercase" }} /></label>
        <label className="block text-sm font-medium">Address<textarea name="address" defaultValue={l.address} maxLength={500} rows={2} className={field + " h-auto py-2"} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-medium">Phone<input name="phone" defaultValue={l.phone} maxLength={20} className={field} /></label>
          <label className="text-sm font-medium">Email<input name="email" type="email" defaultValue={l.email} maxLength={190} className={field} /></label>
        </div>
        <div className="flex items-end gap-3">
          <label className="text-sm font-medium">Accent colour<input name="brandColor" type="color" defaultValue={l.brandColor || "#F15A24"} className="mt-1.5 block h-11 w-16 rounded-xl border bg-surface p-1" /></label>
          <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" name="useColor" defaultChecked={!!l.brandColor} />Use it</label>
        </div>
        <div className="text-sm font-medium">Logo
          <div className="mt-1.5 flex items-center gap-3">
            {shown && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/images/${shown}`} alt="Logo" className="max-h-12 w-auto rounded border bg-white p-1" />}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => pickLogo(e.target.files?.[0])} className="text-sm" />
            {shown && <button type="button" onClick={() => setLogo(null)} className="text-sm text-accent hover:underline">Remove</button>}
          </div>
        </div>
        <label className="block text-sm font-medium">Invoice footer<textarea name="invoiceFooter" defaultValue={l.invoiceFooter} maxLength={500} rows={2} className={field + " h-auto py-2"} placeholder="Bank details, terms, thank-you note" /></label>
        <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : "Save branding"}</Button><Button type="button" size="sm" variant="secondary" onClick={() => { setBrand(null); setLogo(undefined); }}>Cancel</Button></div>
      </form>
    );
  };

  const Form = ({ l }: { l?: LocationRow }) => (
    <form onSubmit={(e) => save(e, l?.id ?? null)} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Name<input name="name" defaultValue={l?.name} required minLength={2} maxLength={120} className={field} placeholder="Nexpreneur Karimnagar" /></label>
      <label className="text-sm font-medium">City<input name="city" defaultValue={l?.city} maxLength={120} className={field} placeholder="Karimnagar" /></label>
      <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button><Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button></div>
    </form>
  );

  return (
    <>
      <PageHeader title="Locations" sub="Every Nexpreneur space. New locations appear in the location selector straight away."
        actions={canEdit && <Button onClick={() => setForm(form === "new" ? null : "new")}><Plus size={18} />Add location</Button>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {form === "new" && <Card className="mb-6"><Form /></Card>}
      {loading ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0 ? <EmptyState title="No locations yet" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((l) => (
            <Card key={l.id}>
              {brand === l.id ? <BrandForm l={l} /> : form === l.id ? <Form l={l} /> : (
                <>
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><MapPin size={18} /></span>
                    <div className="min-w-0"><h2 className="font-semibold">{l.name}</h2><p className="text-sm text-muted">{l.city || "No city set"}</p></div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-muted">Resources</dt><dd className="text-xl font-semibold">{l.resources}</dd></div>
                    <div><dt className="text-muted">Active members</dt><dd className="text-xl font-semibold">{l.activeMembers}</dd></div>
                  </dl>
                  {canEdit && <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setForm(l.id)}>Edit</Button><Button size="sm" variant="secondary" onClick={() => { setLogo(undefined); setBrand(l.id); }}>Branding</Button><Button size="sm" variant="ghost" onClick={() => archive(l)}>Archive</Button></div>}
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
