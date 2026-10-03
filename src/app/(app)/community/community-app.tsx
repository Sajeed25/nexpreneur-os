"use client";
import * as React from "react";
import { Heart, Megaphone, MessageCircle, Trash2 } from "lucide-react";
import { Avatar, Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { addComment, createPost, deletePost, listComments, listDirectory, listPosts, toggleLike, type CommentDTO, type PersonDTO, type PostDTO } from "./actions";
import { cn } from "@/lib/utils";

const KIND: Record<string, { label: string; tone: "blue" | "green" | "amber" | "grey" | "red" }> = {
  update: { label: "Update", tone: "grey" }, opportunity: { label: "Opportunity", tone: "green" }, job: { label: "Job", tone: "blue" },
  question: { label: "Question", tone: "amber" }, announcement: { label: "Announcement", tone: "red" },
};
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

export function CommunityApp({ mod }: { mod: boolean }) {
  const [tab, setTab] = React.useState<"feed" | "people">("feed");
  const [posts, setPosts] = React.useState<PostDTO[]>([]);
  const [people, setPeople] = React.useState<PersonDTO[]>([]);
  const [q, setQ] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [comments, setComments] = React.useState<CommentDTO[]>([]);

  React.useEffect(() => {
    let live = true;
    Promise.all([listPosts(), listDirectory()]).then(([p, d]) => {
      if (!live) return;
      setLoading(false);
      if (p.ok) { setError(null); setPosts(p.data); } else setError(p.error);
      if (d.ok) setPeople(d.data);
    }).catch(() => { if (live) { setLoading(false); setError("Couldn't load the community."); } });
    return () => { live = false; };
  }, [tick]);

  React.useEffect(() => {
    if (!openId) return;
    let live = true;
    listComments(openId).then((r) => live && r.ok && setComments(r.data));
    return () => { live = false; };
  }, [openId, tick]);

  const post = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    const r = await createPost({ kind: String(f.get("kind")) as "update", body: String(f.get("body")) });
    setBusy(false);
    if (!r.ok) setError(r.error); else { setError(null); form.reset(); setTick((t) => t + 1); }
  };
  const like = async (p: PostDTO) => {
    setPosts((ps) => ps.map((x) => (x.id === p.id ? { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) } : x))); // optimistic
    const r = await toggleLike(p.id);
    if (!r.ok) { setError(r.error); setTick((t) => t + 1); }
  };
  const comment = async (e: React.FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault();
    const form = e.currentTarget;
    const r = await addComment(id, String(new FormData(form).get("body")));
    if (!r.ok) setError(r.error); else { setError(null); form.reset(); setTick((t) => t + 1); }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Delete this post?")) return;
    const r = await deletePost(id);
    if (!r.ok) setError(r.error); else setTick((t) => t + 1);
  };

  const shown = people.filter((p) => `${p.name} ${p.company} ${p.jobTitle}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Community" sub="Share updates, find collaborators, ask questions." />
      <div role="tablist" className="mb-4 inline-flex gap-1 rounded-xl border bg-surface p-1">
        {(["feed", "people"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("h-9 rounded-lg px-4 text-sm", tab === t ? "bg-primary text-primary-fg" : "text-muted hover:text-fg")}>{t === "feed" ? "Feed" : "Member directory"}</button>
        ))}
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}

      {tab === "feed" && <>
        <Card className="mb-5">
          <form onSubmit={post} className="space-y-3">
            <textarea name="body" required minLength={2} maxLength={2000} rows={3} placeholder="Share an update, an opportunity, or ask a question…" className="w-full rounded-xl border bg-surface px-3 py-2 text-[15px] outline-none focus:border-accent" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <select name="kind" className="h-10 rounded-xl border bg-surface px-3 text-sm">
                {Object.entries(KIND).filter(([k]) => k !== "announcement" || mod).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <Button type="submit" size="sm" disabled={busy}>{busy ? "Posting…" : "Post"}</Button>
            </div>
          </form>
        </Card>
        {loading ? <p className="text-sm text-muted">Loading…</p> : posts.length === 0 ? <EmptyState title="Nothing here yet" hint="Be the first to post." /> : (
          <ul className="space-y-4">
            {posts.map((p) => (
              <li key={p.id}><Card className={cn("space-y-3", p.kind === "announcement" && "border-accent")}>
                <div className="flex items-start gap-3">
                  <Avatar name={p.author} />
                  <div className="min-w-0 flex-1"><p className="font-medium">{p.author}</p><p className="truncate text-xs text-muted">{p.authorTitle || "Member"} · {ago(p.at)}</p></div>
                  <Badge tone={KIND[p.kind].tone}>{p.kind === "announcement" ? <span className="inline-flex items-center gap-1"><Megaphone size={12} />{KIND[p.kind].label}</span> : KIND[p.kind].label}</Badge>
                </div>
                <p className="whitespace-pre-wrap text-[15px]">{p.body}</p>
                <div className="flex items-center gap-4 text-sm text-muted">
                  <button onClick={() => like(p)} aria-pressed={p.liked} className={cn("flex items-center gap-1.5 hover:text-fg", p.liked && "text-red-500")}><Heart size={16} fill={p.liked ? "currentColor" : "none"} />{p.likes}</button>
                  <button onClick={() => setOpenId(openId === p.id ? null : p.id)} className="flex items-center gap-1.5 hover:text-fg"><MessageCircle size={16} />{p.comments}</button>
                  {(p.mine || mod) && <button onClick={() => remove(p.id)} aria-label="Delete post" className="ml-auto hover:text-red-500"><Trash2 size={16} /></button>}
                </div>
                {openId === p.id && (
                  <div className="space-y-3 border-t pt-3">
                    {comments.map((c) => <p key={c.id} className="text-sm"><span className="font-medium">{c.author}</span> <span className="text-muted">· {ago(c.at)}</span><br />{c.body}</p>)}
                    <form onSubmit={(e) => comment(e, p.id)} className="flex gap-2">
                      <input name="body" required maxLength={1000} placeholder="Write a comment…" className="h-10 min-w-0 flex-1 rounded-xl border bg-surface px-3 text-sm outline-none focus:border-accent" />
                      <Button type="submit" size="sm">Reply</Button>
                    </form>
                  </div>
                )}
              </Card></li>
            ))}
          </ul>
        )}
      </>}

      {tab === "people" && <>
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" placeholder="Search by name, company or role…" className="mb-4 h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent" />
        {shown.length === 0 ? <EmptyState title="No members found" /> : (
          <ul className="grid gap-3 sm:grid-cols-2">{shown.map((p) => (
            <li key={p.id}><Card className="flex items-center gap-3 p-4"><Avatar name={p.name} size={44} /><div className="min-w-0"><p className="truncate font-medium">{p.name}</p><p className="truncate text-sm text-muted">{[p.jobTitle, p.company].filter(Boolean).join(" · ") || "Member"}</p></div></Card></li>
          ))}</ul>
        )}
        <p className="mt-4 text-xs text-muted">Only name, company and role are shown. Update yours on your Profile page.</p>
      </>}
    </div>
  );
}
