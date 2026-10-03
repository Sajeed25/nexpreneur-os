"use client";
import * as React from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { useLocation } from "@/components/shell/app-shell";
import { uploadImage } from "@/app/images/actions";
import { resizeToJpeg } from "@/lib/client-image";
import { rupees } from "@/lib/booking";
import { listOrders, listServices, orderService, saveService, setServiceAvailable, type OrderDTO, type ServiceDTO } from "./actions";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";

export function ServicesApp({ manage }: { manage: boolean }) {
  const { loc } = useLocation();
  const [rows, setRows] = React.useState<ServiceDTO[]>([]);
  const [orders, setOrders] = React.useState<OrderDTO[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<{ text: string; invoiceId?: string } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const [showForm, setShowForm] = React.useState(false);
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [coupon, setCoupon] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    let live = true;
    Promise.all([listServices(), listOrders()]).then(([s, o]) => {
      if (!live) return;
      setLoading(false);
      if (s.ok) { setError(null); setRows(s.data); } else setError(s.error);
      if (o.ok) setOrders(o.data);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load services."); } });
    return () => { live = false; };
  }, [tick]);

  const order = async (s: ServiceDTO) => {
    setBusy(s.id); setInfo(null);
    const r = await orderService({ serviceId: s.id, qty: qty[s.id] ?? 1, couponCode: coupon[s.id] || undefined, loc });
    setBusy(null);
    if (!r.ok) setError(r.error); else { setError(null); setInfo({ text: `Ordered ${s.name}. Your invoice is ready.`, invoiceId: r.data.invoiceId }); setTick((t) => t + 1); }
  };
  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy("new");
    let imageId: string | undefined;
    const photo = f.get("photo");
    if (photo instanceof File && photo.size > 0) {
      const blob = await resizeToJpeg(photo, 900);
      if (!blob) { setBusy(null); setError("That file isn't a readable image."); return; }
      const up = new FormData(); up.set("file", new File([blob], "service.jpg", { type: "image/jpeg" }));
      const u = await uploadImage(up);
      if (!u.ok) { setBusy(null); setError(u.error); return; }
      imageId = u.id;
    }
    const r = await saveService(null, { name: String(f.get("name")), description: String(f.get("description")), price: Number(f.get("price")), taxPct: Number(f.get("taxPct")) as 18, available: f.get("available") === "on", imageId });
    setBusy(null);
    if (!r.ok) setError(r.error); else { setError(null); form.reset(); setShowForm(false); setTick((t) => t + 1); }
  };
  const toggle = async (s: ServiceDTO) => {
    const r = await setServiceAvailable(s.id, !s.available);
    if (!r.ok) setError(r.error); else setTick((t) => t + 1);
  };

  return (
    <>
      <PageHeader title="Services" sub={manage ? "What members can order, billed on a GST invoice." : "Printing, parking, coffee and more."}
        actions={manage && <Button onClick={() => setShowForm(!showForm)}>Add service</Button>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {info && <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{info.text} {info.invoiceId && <Link href={`/invoices/${info.invoiceId}`} className="font-medium underline">View invoice</Link>}</p>}

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Name<input name="name" required minLength={2} maxLength={160} className={field} placeholder="Colour printing (per page)" /></label>
            <label className="text-sm font-medium sm:col-span-2">Description<textarea name="description" rows={2} maxLength={1000} className={field + " h-auto py-2"} /></label>
            <label className="text-sm font-medium">Price (₹, before GST)<input name="price" type="number" min="0" step="0.01" required className={field} /></label>
            <label className="text-sm font-medium">GST rate<select name="taxPct" defaultValue="18" className={field}>{[0, 5, 12, 18, 28].map((t) => <option key={t} value={t}>{t}%</option>)}</select></label>
            <label className="text-sm font-medium">Image (optional)<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1.5 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-accent" /></label>
            <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" name="available" defaultChecked />Available to order</label>
            <Button type="submit" disabled={busy === "new"} className="sm:col-span-2">{busy === "new" ? "Saving…" : "Add service"}</Button>
          </form>
        </Card>
      )}

      {loading ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0 ? <EmptyState title="No services yet" hint={manage ? "Add the first one." : "Nothing to order right now."} /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3 overflow-hidden">
              {s.imageId
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/images/${s.imageId}`} alt="" loading="lazy" className="-mx-5 -mt-5 h-36 w-[calc(100%+2.5rem)] max-w-none object-cover" />
                : <span className="grid h-24 place-items-center rounded-xl bg-accent-soft text-accent"><ShoppingBag size={26} /></span>}
              <div className="flex items-start justify-between gap-2"><h2 className="font-semibold">{s.name}</h2>{manage && <Badge tone={s.available ? "green" : "grey"}>{s.available ? "Available" : "Hidden"}</Badge>}</div>
              {s.description && <p className="text-sm text-muted">{s.description}</p>}
              <p className="mt-auto text-lg font-semibold">{rupees(s.pricePaise)}<span className="text-xs font-normal text-muted"> + {s.taxPct}% GST</span></p>
              {s.available && (
                <div className="flex flex-wrap items-center gap-2">
                  <input type="number" min={1} max={50} value={qty[s.id] ?? 1} onChange={(e) => setQty({ ...qty, [s.id]: Math.max(1, Number(e.target.value) || 1) })} aria-label={`Quantity of ${s.name}`} className="h-10 w-16 rounded-xl border bg-surface px-2 text-sm" />
                  <input value={coupon[s.id] ?? ""} onChange={(e) => setCoupon({ ...coupon, [s.id]: e.target.value.toUpperCase() })} maxLength={40} placeholder="Coupon" aria-label="Coupon code" className="h-10 w-24 rounded-xl border bg-surface px-2 text-sm" />
                  <Button size="sm" disabled={busy === s.id} onClick={() => order(s)}>{busy === s.id ? "Ordering…" : "Order"}</Button>
                </div>
              )}
              {manage && <Button size="sm" variant="ghost" onClick={() => toggle(s)}>{s.available ? "Hide" : "Make available"}</Button>}
            </Card>
          ))}
        </div>
      )}

      {orders.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 font-medium">{manage ? "Recent orders" : "Your orders"}</h2>
          <Card className="py-1"><ul className="divide-y text-sm">{orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>{manage && <b>{o.who} · </b>}{o.service}{o.qty > 1 ? ` × ${o.qty}` : ""} <span className="text-muted">· {new Date(o.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></span>
              {o.invoiceId && <Link href={`/invoices/${o.invoiceId}`} className="text-accent hover:underline">Invoice</Link>}
            </li>
          ))}</ul></Card>
        </>
      )}
    </>
  );
}
