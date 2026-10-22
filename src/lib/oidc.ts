import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// Single sign-on over OpenID Connect (authorization code + PKCE). Works with Microsoft Entra ID, Google Workspace, Okta, Keycloak, Auth0...
// Configure with OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET (and optionally OIDC_ALLOWED_DOMAINS, OIDC_NAME).
// Redirect URI to register with the provider: <AUTH_URL>/api/auth/oidc/callback

const set = (v?: string) => !!v && v !== "placeholder";
export const oidcConfigured = () => set(process.env.OIDC_ISSUER) && set(process.env.OIDC_CLIENT_ID) && set(process.env.OIDC_CLIENT_SECRET);
export const oidcLabel = () => (process.env.OIDC_NAME || "Single sign-on").slice(0, 40);

export type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string };
let cache: { at: number; d: Discovery } | null = null;

/** Reads the provider's configuration page (cached for an hour). Refuses a provider whose stated issuer isn't the one we configured. */
export async function discover(): Promise<Discovery> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.d;
  const issuer = process.env.OIDC_ISSUER!.replace(/\/$/, "");
  const r = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`OIDC discovery failed (${r.status})`);
  const d = (await r.json()) as Partial<Discovery>;
  if (!d.authorization_endpoint || !d.token_endpoint || !d.jwks_uri || (d.issuer ?? "").replace(/\/$/, "") !== issuer) throw new Error("OIDC discovery document doesn't match OIDC_ISSUER");
  cache = { at: Date.now(), d: d as Discovery };
  return cache.d;
}

/** Pure: whose email may sign in. With no OIDC_ALLOWED_DOMAINS set, any verified person from the provider may try (they still need an account here). */
export function emailAllowed(email: string, allowed: string | undefined): boolean {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  const list = (allowed ?? "").split(",").map((s) => s.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  return !!domain && (list.length === 0 || list.includes(domain));
}

/** Pure: the email in an id_token. Entra often leaves `email` out and uses `preferred_username`; an explicit email_verified of false is refused. */
export function claimsEmail(p: JWTPayload & { email?: unknown; preferred_username?: unknown; email_verified?: unknown }): string | null {
  if (p.email_verified === false || p.email_verified === "false") return null;
  const cand = [p.email, p.preferred_username].find((v): v is string => typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v));
  return cand ? cand.toLowerCase() : null;
}

/** Swaps the code for tokens and verifies the id_token's signature, issuer, audience, expiry and nonce. Returns the person's email. */
export async function completeLogin(code: string, redirectUri: string, verifier: string, nonce: string): Promise<{ email: string; name: string }> {
  const d = await discover();
  const tok = await fetch(d.token_endpoint, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: process.env.OIDC_CLIENT_ID!, client_secret: process.env.OIDC_CLIENT_SECRET!, code_verifier: verifier }),
  });
  if (!tok.ok) throw new Error(`OIDC token exchange failed (${tok.status})`);
  const idToken = ((await tok.json()) as { id_token?: string }).id_token;
  if (!idToken) throw new Error("OIDC response has no id_token");
  const { payload } = await jwtVerify(idToken, createRemoteJWKSet(new URL(d.jwks_uri)), { issuer: d.issuer, audience: process.env.OIDC_CLIENT_ID! });
  if (payload.nonce !== nonce) throw new Error("OIDC nonce mismatch");
  const email = claimsEmail(payload);
  if (!email) throw new Error("OIDC token has no usable email");
  return { email, name: typeof payload.name === "string" ? payload.name : email };
}
