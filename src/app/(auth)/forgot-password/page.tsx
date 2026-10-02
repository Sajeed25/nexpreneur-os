import Link from "next/link";
import { AuthForm } from "../auth-form";

export default function Page() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Forgot password</h1>
      <p className="mb-6 text-muted">We&apos;ll email you a reset link.</p>
      <AuthForm kind="forgot" />
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-accent hover:underline">Back to sign in</Link></p>
    </>
  );
}
