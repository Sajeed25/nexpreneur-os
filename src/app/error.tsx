"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-muted">Please try again. If it keeps happening, tell your admin.</p>
        <button onClick={reset} className="mt-4 h-11 rounded-xl bg-accent px-4 font-medium text-accent-fg">Try again</button>
      </div>
    </div>
  );
}
