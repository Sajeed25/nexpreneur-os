import Link from "next/link";
import { AuthForm } from "../auth-form";

export const dynamic = "force-dynamic";

/** The emailed link lands here. Signing in needs a click (a POST), so mail scanners that only fetch the URL can't use up the link. */
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token || token.length < 20 || token.length > 100) {
    return (
      <>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Sign-in link needed</h1>
        <p className="mb-6 text-muted">Open the link from your email, or request a new one.</p>
        <Link href="/magic-link" className="text-accent hover:underline">Email me a sign-in link</Link>
      </>
    );
  }
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Ready to sign in</h1>
      <p className="mb-6 text-muted">Press the button to finish signing in.</p>
      <AuthForm kind="magicUse" token={token} />
    </>
  );
}
