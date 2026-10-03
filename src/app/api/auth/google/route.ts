import { NextResponse } from "next/server";
import { appUrl } from "@/lib/mailer";
import { googleConfigured, newPkce, signBlob } from "@/lib/oauth";
import { authConfigured } from "@/lib/auth";
import { hasDb } from "@/lib/db/config";

export const dynamic = "force-dynamic";

/** Step 1: send the browser to Google with a random state and a PKCE challenge. Redirect URI to register: <AUTH_URL>/api/auth/google/callback */
export async function GET() {
  const base = appUrl();
  if (!base || !googleConfigured() || !hasDb() || !authConfigured()) return new NextResponse("Google sign-in isn't set up.", { status: 503 });
  const { verifier, challenge, state } = newPkce();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: `${base}/api/auth/google/callback`, response_type: "code",
    scope: "openid email profile", state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("nx_oauth", signBlob({ state, verifier }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/google", maxAge: 600 });
  return res;
}
