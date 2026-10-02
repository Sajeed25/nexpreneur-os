import { AuthForm } from "../auth-form";

export default function Page() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Set a new password</h1>
      <p className="mb-6 text-muted">Choose something strong.</p>
      <AuthForm kind="reset" />
    </>
  );
}
