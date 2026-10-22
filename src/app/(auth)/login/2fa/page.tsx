import Link from "next/link";
import { cookies } from "next/headers";
import { AuthForm } from "../../auth-form";
import { verifyBlob } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** The second step of signing in, for people with two-factor on. Without the short-lived sign-in cookie there is nothing to confirm. */
export default async function Page() {
  const blob = verifyBlob<{ purpose: string }>((await cookies()).get("nx_2fa")?.value);
  if (!blob || blob.purpose !== "2fa") {
    return (
      <>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Sign in first</h1>
        <p className="mb-6 text-muted">Enter your email and password, then come back here for your code.</p>
        <Link href="/login" className="text-accent hover:underline">Go to sign in</Link>
      </>
    );
  }
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Two-step check</h1>
      <p className="mb-6 text-muted">Open your authenticator app and enter the 6-digit code for Nexpreneur OS. Lost your phone? Enter one of your recovery codes instead.</p>
      <AuthForm kind="twofa" />
      <p className="mt-6 text-center text-sm text-muted"><Link href="/login" className="text-accent hover:underline">Start again</Link></p>
    </>
  );
}
