import Link from "next/link";
import { AuthForm } from "../auth-form";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token || token.length < 20 || token.length > 100) {
    return (
      <>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Reset link needed</h1>
        <p className="mb-6 text-muted">Open the link from your reset email, or request a new one.</p>
        <Link href="/forgot-password" className="text-accent hover:underline">Request a reset link</Link>
      </>
    );
  }
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Set a new password</h1>
      <p className="mb-6 text-muted">Choose something strong. You&apos;ll be signed out everywhere else.</p>
      <AuthForm kind="reset" token={token} />
    </>
  );
}
