import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/mailer";
import { verifyBlob } from "@/lib/oauth";
import { COOKIE, authConfigured, cookieOptions, signSession, throttled } from "@/lib/auth";
import { hasDb } from "@/lib/db/config";
import { HOME } from "@/lib/home";
import { completeLogin, emailAllowed, oidcConfigured } from "@/lib/oidc";

export const dynamic = "force-dynamic";

/**
 * Step 2: the provider sends the person back with ?code. We check the state, verify the id_token, then sign in the existing
 * account with that email. Accounts are never created here: an owner adds the person first (Settings > Team).
 */
export async function GET(req: NextRequest) {
  const base = appUrl();
  if (!base || !oidcConfigured() || !hasDb() || !authConfigured()) return new NextResponse("Single sign-on isn't set up.", { status: 503 });
  const fail = (why: string) => {
    const res = NextResponse.redirect(`${base}/login?error=${why}`);
    res.cookies.delete({ name: "nx_oidc", path: "/api/auth/oidc" });
    return res;
  };
  if (throttled(`oidc:${(req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim()}`, 20, 10 * 60_000)) return fail("sso_busy");

  const sp = req.nextUrl.searchParams;
  const code = sp.get("code"), state = sp.get("state");
  const blob = verifyBlob<{ state: string; verifier: string; nonce: string; p: string }>(req.cookies.get("nx_oidc")?.value);
  if (sp.get("error") || !code || !state || !blob || blob.p !== "oidc" || blob.state !== state) return fail("sso");

  try {
    const who = await completeLogin(code, `${base}/api/auth/oidc/callback`, blob.verifier, blob.nonce);
    if (!emailAllowed(who.email, process.env.OIDC_ALLOWED_DOMAINS)) return fail("sso_domain");
    const { findSsoUser } = await import("@/lib/auth-service");
    const user = await findSsoUser(who.email);
    if (!user) return fail("sso_unknown");
    const res = NextResponse.redirect(`${base}${HOME[user.role]}`);
    // The provider already asked for its own second factor, so this session isn't asked for ours again.
    res.cookies.set(COOKIE, await signSession({ ...user, sso: true }), cookieOptions);
    res.cookies.delete({ name: "nx_oidc", path: "/api/auth/oidc" });
    return res;
  } catch (e) {
    console.error("oidc sign-in failed", e instanceof Error ? e.message : e);
    return fail("sso");
  }
}
