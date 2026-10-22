import "server-only";
import { parseEInvoiceResponse } from "@/lib/einvoice";

const set = (v?: string) => !!v && v !== "placeholder";

/**
 * E-invoicing goes through a GST Suvidha Provider (GSP) or your own gateway that talks to the government's IRP.
 * EINV_API_URL is the endpoint that accepts the NIC e-invoice JSON (POST) and returns the IRN reply; EINV_API_TOKEN is sent as a Bearer token.
 * A cancel call is POSTed to <EINV_API_URL>/cancel with { Irn, CnlRsn, CnlRem }.
 */
export const einvoiceConfigured = () => set(process.env.EINV_API_URL) && set(process.env.EINV_API_TOKEN);

async function call(path: string, body: unknown) {
  const r = await fetch(`${process.env.EINV_API_URL}${path}`, {
    method: "POST", signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.EINV_API_TOKEN}`, ...(process.env.EINV_API_HEADERS ? JSON.parse(process.env.EINV_API_HEADERS) : {}) },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, json };
}

export async function submitEInvoice(payload: Record<string, unknown>) {
  try {
    const { json } = await call("", payload);
    return parseEInvoiceResponse(json);
  } catch (e) {
    console.error("e-invoice submit failed", e instanceof Error ? e.message : e);
    return { ok: false as const, error: "Couldn't reach the e-invoice service. Try again in a minute." };
  }
}

export async function cancelEInvoiceRemote(irn: string, reasonCode: "1" | "2" | "3" | "4", remark: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { status, json } = await call("/cancel", { Irn: irn, CnlRsn: reasonCode, CnlRem: remark.slice(0, 100) });
    const o = (json ?? {}) as { Irn?: string; CancelDate?: string; data?: { Irn?: string; CancelDate?: string }; error?: unknown; message?: string; ErrorDetails?: { ErrorMessage?: string }[] };
    if (status < 300 && (o.CancelDate || o.data?.CancelDate || o.Irn || o.data?.Irn)) return { ok: true };
    return { ok: false, error: (o.ErrorDetails?.[0]?.ErrorMessage ?? (typeof o.error === "string" ? o.error : o.message) ?? "The e-invoice service didn't accept the cancellation.").slice(0, 280) };
  } catch (e) {
    console.error("e-invoice cancel failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't reach the e-invoice service. Try again in a minute." };
  }
}
