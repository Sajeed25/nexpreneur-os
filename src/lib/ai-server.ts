import "server-only";
import { createHmac } from "node:crypto";
import { safeEq } from "@/lib/payments-server";

// ---- Signed confirmation tokens ----
// The model can only *propose* an action. The proposal is signed server-side so the browser cannot edit it
// (different resource, price, user...) between "proposed" and "confirmed".
export type Proposal =
  | { t: "book"; uid: string; resourceId: string; date: string; start: string; end: string }
  | { t: "cancel"; uid: string; bookingId: string };

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET not configured");
  return s;
}
const sign = (body: string) => createHmac("sha256", secret()).update(`ai-proposal:${body}`).digest("base64url");

export function signProposal(p: Proposal, ttlMs = 10 * 60_000) {
  const body = b64(JSON.stringify({ ...p, exp: Date.now() + ttlMs }));
  return `${body}.${sign(body)}`;
}
export function verifyProposal(token: string): Proposal | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEq(sig, sign(body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Proposal & { exp: number };
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

// ---- OpenAI ----
export const aiConfigured = () => {
  const k = process.env.OPENAI_API_KEY;
  return !!k && k !== "placeholder";
};

export type ChatMsg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export async function callOpenAI(messages: ChatMsg[], tools: unknown[]) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", messages, tools, tool_choice: "auto", temperature: 0.2, max_tokens: 600 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) { console.error("openai error", res.status); throw new Error(`OPENAI_${res.status}`); }
  const j = (await res.json()) as { choices?: { message: Extract<ChatMsg, { role: "assistant" }> }[] };
  const m = j.choices?.[0]?.message;
  if (!m) throw new Error("OPENAI_EMPTY");
  return m;
}
