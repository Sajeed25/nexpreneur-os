import Link from "next/link";
import { AuthForm } from "../auth-form";

export default function Page() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 text-muted">Join your coworking community.</p>
      <AuthForm kind="register" />
      <p className="mt-6 text-center text-sm text-muted">Have an account? <Link href="/login" className="text-accent hover:underline">Sign in</Link></p>
    </>
  );
}
