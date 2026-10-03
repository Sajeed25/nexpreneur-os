export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#042341] p-12 text-white lg:flex">
        {/* soft brand shapes taken from the logo mark */}
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-[5rem] bg-[#F15A24]/20 rotate-12" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-[4rem] bg-[#8AC73E]/10 -rotate-12" />
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="Nexpreneur" width={260} height={61} className="h-auto w-64 rounded-2xl bg-white p-3" />
        </div>
        <div className="relative">
          <p className="text-4xl font-semibold leading-tight tracking-tight">The Intelligent Operating System for <span className="text-[#F15A24]">Modern Coworking</span> Spaces.</p>
          <p className="mt-4 max-w-md text-white/75">Bookings, members, billing, community and AI in one calm place to run every location.</p>
        </div>
        <p className="relative text-sm text-white/60">© Nexpreneur</p>
      </div>
      <div className="grid place-items-center p-6">
        <div className="w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="Nexpreneur" width={200} height={47} className="mb-8 h-auto w-44 lg:hidden" />
          {children}
        </div>
      </div>
    </div>
  );
}
