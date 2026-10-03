"use client";
import * as React from "react";
import { Bot, Send } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { chat, confirmProposal, type ProposalCard } from "./actions";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; error?: boolean };
type Card_ = ProposalCard & { state: "pending" | "busy" | "done" | "dismissed" };

const SUGGESTIONS = [
  "Book a meeting room tomorrow at 3 PM",
  "Show available desks tomorrow",
  "Show my invoices",
  "How much is my membership?",
  "What events are happening this week?",
  "Cancel my booking",
];

export function AssistantApp({ configured }: { configured: boolean }) {
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [cards, setCards] = React.useState<Card_[]>([]);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const end = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, cards, busy]);

  const send = async (content: string) => {
    const t = content.trim();
    if (!t || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next); setText(""); setBusy(true);
    // Older, unconfirmed proposals are no longer offered once the conversation moves on.
    setCards((cs) => cs.map((c) => (c.state === "pending" ? { ...c, state: "dismissed" } : c)));
    const r = await chat(next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })));
    setBusy(false);
    if (!r.ok) { setMsgs([...next, { role: "assistant", content: r.error, error: true }]); return; }
    setMsgs([...next, { role: "assistant", content: r.reply }]);
    if (r.proposals.length) setCards((cs) => [...cs, ...r.proposals.map((p) => ({ ...p, state: "pending" as const }))]);
  };

  const decide = async (token: string, ok: boolean) => {
    if (!ok) { setCards((cs) => cs.map((c) => (c.token === token ? { ...c, state: "dismissed" } : c))); return; }
    setCards((cs) => cs.map((c) => (c.token === token ? { ...c, state: "busy" } : c)));
    const r = await confirmProposal(token);
    setCards((cs) => cs.map((c) => (c.token === token ? { ...c, state: r.ok ? "done" : "pending" } : c)));
    setMsgs((m) => [...m, { role: "assistant", content: r.ok ? r.message : r.error, error: !r.ok }]);
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-13rem)] max-w-2xl flex-col md:h-[calc(100dvh-9rem)]">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><Bot size={20} /></span>
        <div><h1 className="text-xl font-semibold tracking-tight">Assistant</h1><p className="text-sm text-muted">Ask about bookings, invoices, your plan and events.</p></div>
      </div>
      {!configured && <p role="status" className="mb-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">The assistant isn&apos;t switched on yet. An admin needs to add an OpenAI key to the server settings.</p>}

      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border bg-surface p-4" aria-live="polite">
        {msgs.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div className="space-y-4">
              <p className="text-muted">Try asking:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} disabled={!configured} className="rounded-full border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50">{s}</button>)}
              </div>
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <p className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px]", m.role === "user" ? "bg-accent text-accent-fg" : m.error ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-surface-2")}>{m.content}</p>
          </div>
        ))}
        {cards.filter((c) => c.state !== "dismissed").map((c) => (
          <Card key={c.token} className="max-w-[85%] space-y-3 border-accent">
            <div><p className="font-medium">{c.title}</p><p className="text-sm text-muted">{c.detail}</p></div>
            {c.state === "done" ? <p className="text-sm font-medium text-emerald-600">Confirmed</p> : (
              <div className="flex gap-2">
                <Button size="sm" disabled={c.state === "busy"} onClick={() => decide(c.token, true)}>{c.state === "busy" ? "Working…" : c.confirmLabel}</Button>
                <Button size="sm" variant="secondary" disabled={c.state === "busy"} onClick={() => decide(c.token, false)}>Not now</Button>
              </div>
            )}
          </Card>
        ))}
        {busy && <p className="text-sm text-muted">Thinking…</p>}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} disabled={!configured} aria-label="Message" placeholder={configured ? "Ask anything…" : "Assistant not set up"}
          className="h-12 min-w-0 flex-1 rounded-xl border bg-surface px-4 outline-none focus:border-accent disabled:opacity-60" />
        <Button type="submit" disabled={busy || !text.trim() || !configured} aria-label="Send"><Send size={18} /></Button>
      </form>
      <p className="mt-2 text-center text-xs text-muted">The assistant can look things up and prepare bookings. Nothing is booked or cancelled until you press Confirm.</p>
    </div>
  );
}
