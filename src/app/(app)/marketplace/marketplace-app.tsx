"use client";
import * as React from "react";
import { Gift, Plus, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { contactListing, createListing, listListings, redeemPerk, setListingState, type ListingDTO, type ListingsData } from "./actions";
import { cn } from "@/lib/utils";

const field = "mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent";
type Kind = "perk" | "offer" | "request";
const TABS: { id: Kind; label: string; blurb: string }[] = [
  { id: "perk", label: "Member perks", blurb: "Discounts and deals from partners, just for members." },
  { id: "offer", label: "Offers", blurb: "Services and products members of the community are offering." },
  { id: "request", label: "Looking for", blurb: "What members need. Maybe you can help." },
];

export function MarketplaceApp() {
  const [kind, setKind] = React.useState<Kind>("perk");
  const [q, setQ] = React.useState("");
  const [d, setD] = React.useState<ListingsData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null); // listing being messaged
  const [reveal, setReveal] = React.useState<Record<string, { code: string | null; link: string | null }>>({});
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    const t = setTimeout(() => listListings(kind, q).then((r) => { if (!live) return; if (r.ok) { setError(null); setD(r.data); } else setError(r.error); }), q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [kind, q, tick]);

  const tab = TABS.find((t) => t.id === kind)!;
  const canPost = kind !== "perk" || d?.canCurate;
  const refresh = () => setTick((n) => n + 1);

  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form), g = (k: string) => String(f.get(k) ?? "");
    setBusy(true); setError(null);
    const r = await createListing({ kind, title: g("title"), description: g("description"), priceText: g("priceText"), category: g("category") as "Other", perkCode: g("perkCode"), link: g("link"), validUntil: g("validUntil") });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    form.reset(); setShowForm(false); setInfo("Posted."); refresh();
  };
  const claim = async (l: ListingDTO) => {
    setError(null);
    const r = await redeemPerk(l.id);
    if (!r.ok) return setError(r.error);
    setReveal((x) => ({ ...x, [l.id]: r.data })); refresh();
  };
  const message = async (e: React.FormEvent<HTMLFormElement>, l: ListingDTO) => {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true); setError(null);
    const r = await contactListing({ id: l.id, message: String(new FormData(form).get("message")) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    form.reset(); setOpen(null); setInfo(`Sent. ${l.author} will get your name and contact details.`);
  };
  const state = async (l: ListingDTO, s: "on" | "off" | "remove") => {
    if (s === "remove" && !window.confirm("Remove this listing?")) return;
    const r = await setListingState(l.id, s);
    if (!r.ok) setError(r.error); else refresh();
  };

  return (
    <>
      <PageHeader title="Perks & marketplace" sub={tab.blurb} actions={canPost && <Button onClick={() => setShowForm(!showForm)}><Plus size={18} />{kind === "perk" ? "Add perk" : kind === "offer" ? "Post an offer" : "Post a request"}</Button>} />
      <div role="tablist" className="mb-4 flex max-w-full gap-1 overflow-x-auto rounded-xl border bg-surface p-1 sm:inline-flex">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={kind === t.id} onClick={() => { setKind(t.id); setShowForm(false); setOpen(null); }} className={cn("h-9 shrink-0 rounded-lg px-4 text-sm", kind === t.id ? "bg-primary text-primary-fg" : "text-muted hover:text-fg")}>{t.label}</button>)}
      </div>
      <div className="relative mb-4 max-w-md"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" placeholder="Search…" className="h-11 w-full rounded-xl border bg-surface pl-9 pr-3 text-[15px] outline-none focus:border-accent" /></div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {info && <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{info}</p>}

      {showForm && d && (
        <Card className="mb-6">
          <form onSubmit={add} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Title<input name="title" required minLength={3} maxLength={160} className={field} placeholder={kind === "perk" ? "20% off cloud hosting" : kind === "offer" ? "Logo and brand design for startups" : "Looking for a freelance accountant"} /></label>
            <label className="text-sm font-medium sm:col-span-2">Details<textarea name="description" rows={3} maxLength={2000} className={field + " h-auto py-2"} /></label>
            <label className="text-sm font-medium">Category<select name="category" defaultValue="Other" className={field}>{d.categories.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="text-sm font-medium">{kind === "perk" ? "The deal" : "Price"}<input name="priceText" maxLength={80} className={field} placeholder={kind === "perk" ? "20% off for 6 months" : "From ₹5,000"} /></label>
            {kind === "perk" && <label className="text-sm font-medium">Code to reveal<input name="perkCode" maxLength={80} className={field} placeholder="NEXPRENEUR20" /></label>}
            <label className="text-sm font-medium">Link (optional)<input name="link" type="url" maxLength={300} className={field} placeholder="https://" /></label>
            {kind === "perk" && <label className="text-sm font-medium">Valid until (optional)<input name="validUntil" type="date" className={field} /></label>}
            <Button type="submit" disabled={busy} className="sm:col-span-2">{busy ? "Posting…" : "Post"}</Button>
          </form>
        </Card>
      )}

      {!d ? <p className="text-sm text-muted">Loading…</p> : d.rows.length === 0 ? <EmptyState title={q ? "Nothing matches" : kind === "perk" ? "No perks yet" : kind === "offer" ? "No offers yet" : "Nothing requested yet"} hint={canPost ? "Be the first to post one." : "Check back soon."} /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {d.rows.map((l) => {
            const shown = reveal[l.id]?.code ?? l.code;
            return (
              <Card key={l.id} className={cn("flex flex-col", !l.active && "opacity-60")}>
                <div className="flex items-start justify-between gap-2"><h2 className="font-semibold">{l.title}</h2><div className="flex shrink-0 flex-wrap justify-end gap-1">{l.category && <Badge tone="blue">{l.category}</Badge>}{!l.active && <Badge tone="grey">Off</Badge>}</div></div>
                {l.priceText && <p className="mt-1 text-sm font-medium text-accent">{l.priceText}</p>}
                {l.description && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{l.description}</p>}
                <p className="mt-2 text-xs text-muted">{l.kind === "perk" ? "Offered by" : "Posted by"} {l.author}{l.authorTitle ? ` · ${l.authorTitle}` : ""}{l.validUntil ? ` · until ${l.validUntil}` : ""}{l.kind === "perk" && l.redeemCount > 0 ? ` · ${l.redeemCount} claimed` : ""}</p>
                <div className="mt-auto space-y-2 pt-4">
                  {l.kind === "perk" && (shown || reveal[l.id]
                    ? <div className="rounded-xl bg-emerald-500/10 p-3 text-sm"><p className="text-xs text-muted">Your code</p><p className="font-mono text-base font-semibold">{shown ?? "No code needed"}</p>{(reveal[l.id]?.link ?? l.link) && <a href={(reveal[l.id]?.link ?? l.link)!} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Open the offer</a>}</div>
                    : l.active && <Button size="sm" onClick={() => claim(l)}><Gift size={14} />Get this perk</Button>)}
                  {l.kind !== "perk" && !l.mine && l.active && (open === l.id
                    ? <form onSubmit={(e) => message(e, l)} className="space-y-2"><textarea name="message" required minLength={2} maxLength={500} rows={3} aria-label="Your message" placeholder="Say hello and what you need…" className={field + " h-auto py-2"} /><div className="flex gap-2"><Button size="sm" type="submit" disabled={busy}>Send</Button><Button size="sm" type="button" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button></div><p className="text-xs text-muted">{l.author} will see your name, email and phone.</p></form>
                    : <Button size="sm" variant="secondary" onClick={() => setOpen(l.id)}>{l.kind === "offer" ? "I'm interested" : "I can help"}</Button>)}
                  {l.kind !== "perk" && l.link && <a href={l.link} target="_blank" rel="noopener noreferrer" className="block text-sm text-accent hover:underline">More info</a>}
                  {(l.mine || d.canCurate) && <div className="flex gap-1 border-t pt-2"><Button size="sm" variant="ghost" onClick={() => state(l, l.active ? "off" : "on")}>{l.active ? "Switch off" : "Switch on"}</Button><Button size="sm" variant="ghost" onClick={() => state(l, "remove")}>Remove</Button></div>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
