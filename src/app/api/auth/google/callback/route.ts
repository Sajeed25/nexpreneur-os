import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/mailer";
import { decodeJwtPayload, googleConfigured, validGoogleClaims, verifyBlob } from "@/lib/oauth";
import { COOKIE, authConfigured, cookieOptions, signSession, throttled } from "@/lib/auth";
import { hasDb } from "@/lib/db/config";
import { HOME } from "@/lib/home";

export const dynamic = "force-dynamic";

/** Step 2: Google sends the user back with ?code. We verify state, swap the code for tokens, check the claims, then sign in. */
export async function GET(req: NextRequest) {
  const base = appUrl();
  if (!base || !googleConfigured() || !hasDb() || !authConfigured()) return new NextResponse("Google sign-in isn't set up.", { status: 503 });
  const fail = (why: string) => {
    const res = NextResponse.redirect(`${base}/login?error=${why}`);
    res.cookies.delete({ name: "nx_oauth", path: "/api/auth/google" });
    return res;
  };
  if (throttled(`google:${(req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim()}`, 20, 10 * 60_000)) return fail("google_busy");

  const sp = req.nextUrl.searchParams;
  const code = sp.get("code"), state = sp.get("state");
  const blob = verifyBlob<{ state: string; verifier: string }>(req.cookies.get("nx_oauth")?.value);
  if (sp.get("error") || !code || !state || !blob || blob.state !== state) return fail("google");

  try {
    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15_000),
      body: new URLSearchParams({
        code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${base}/api/auth/google/callback`, grant_type: "authorization_code", code_verifier: blob.verifier,
      }),
    });
    if (!tok.ok) { console.error("google token exchange failed", tok.status); return fail("google"); }
    const claims = decodeJwtPayload(((await tok.json()) as { id_token?: string }).id_token ?? "");
    if (!claims || !validGoogleClaims(claims, process.env.GOOGLE_CLIENT_ID!)) return fail("google");

    const { findOrCreateGoogleUser } = await import("@/lib/auth-service");
    const user = await findOrCreateGoogleUser(claims.email!.toLowerCase(), claims.name ?? "");
    const res = NextResponse.redirect(`${base}${HOME[user.role]}`);
    res.cookies.set(COOKIE, await signSession(user), cookieOptions);
    res.cookies.delete({ name: "nx_oauth", path: "/api/auth/google" });
    return res;
  } catch (e) {
    console.error("google sign-in failed", e);
    return fail("google");
  }
}
