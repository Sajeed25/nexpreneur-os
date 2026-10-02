export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-accent p-12 text-accent-fg lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold"><span className="grid size-9 place-items-center rounded-xl bg-white/20">N</span>Nexpreneur OS</div>
        <div>
          <p className="text-4xl font-semibold leading-tight tracking-tight">The Intelligent Operating System for Modern Coworking Spaces.</p>
          <p className="mt-4 max-w-md opacity-80">Bookings, members, billing, community and AI — one calm place to run every location.</p>
        </div>
        <p className="text-sm opacity-70">© Nexpreneur</p>
      </div>
      <div className="grid place-items-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
