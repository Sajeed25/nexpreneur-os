import Link from "next/link";
import { AuthForm } from "../auth-form";

export default function Page() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Email me a sign-in link</h1>
      <p className="mb-6 text-muted">No password needed. We&apos;ll send a one-time link.</p>
      <AuthForm kind="magic" />
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-accent hover:underline">Back to sign in</Link></p>
    </>
  );
}
