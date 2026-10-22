import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { appUrl } from "@/lib/mailer";
import { newPkce, signBlob } from "@/lib/oauth";
import { authConfigured } from "@/lib/auth";
import { hasDb } from "@/lib/db/config";
import { discover, oidcConfigured } from "@/lib/oidc";

export const dynamic = "force-dynamic";

/** Step 1: send the browser to the company's sign-in page with a random state, nonce and PKCE challenge. */
export async function GET() {
  const base = appUrl();
  if (!base || !oidcConfigured() || !hasDb() || !authConfigured()) return new NextResponse("Single sign-on isn't set up.", { status: 503 });
  try {
    const d = await discover();
    const { verifier, challenge, state } = newPkce();
    const nonce = randomBytes(16).toString("base64url");
    const url = new URL(d.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: process.env.OIDC_CLIENT_ID!, redirect_uri: `${base}/api/auth/oidc/callback`, response_type: "code",
      scope: "openid email profile", state, nonce, code_challenge: challenge, code_challenge_method: "S256",
    }).toString();
    const res = NextResponse.redirect(url);
    res.cookies.set("nx_oidc", signBlob({ state, verifier, nonce, p: "oidc" }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/oidc", maxAge: 600 });
    return res;
  } catch (e) {
    console.error("oidc start failed", e instanceof Error ? e.message : e);
    return NextResponse.redirect(`${base}/login?error=sso`);
  }
}
