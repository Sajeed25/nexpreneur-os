import Link from "next/link";
import { AuthForm } from "../auth-form";

export default function Page() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 text-muted">Sign in to Nexpreneur OS.</p>
      <AuthForm kind="login" />
      <p className="mt-6 text-center text-sm text-muted">New here? <Link href="/register" className="text-accent hover:underline">Create an account</Link></p>
    </>
  );
}
