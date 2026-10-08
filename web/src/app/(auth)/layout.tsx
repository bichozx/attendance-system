export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        <p className="mb-10 text-lg font-bold">Control de asistencia</p>
        <div className="w-full max-w-sm">{children}</div>
      </section>
      {/* Panel lateral: la idea del producto en una imagen — la jornada de una tienda */}
      <aside aria-hidden className="relative hidden overflow-hidden bg-ink md:block">
        <div className="absolute inset-0 flex flex-col justify-center gap-3 px-14">
          {[
            ['06:00', '14:00', 'bg-done'],
            ['08:00', '16:00', 'bg-working'],
            ['09:30', '18:30', 'bg-working'],
            ['14:00', '22:00', 'bg-warn'],
            ['22:00', '06:00', 'bg-leave'],
          ].map(([from, to, color], i) => {
            const start = Number(from.slice(0, 2)) + Number(from.slice(3)) / 60;
            let end = Number(to.slice(0, 2)) + Number(to.slice(3)) / 60;
            if (end <= start) end = 24;
            return (
              <div key={i} className="flex items-center gap-4 text-sm text-white/55">
                <span className="w-24 shrink-0">
                  {from}–{to}
                </span>
                <div className="relative h-3 flex-1 rounded-full bg-white/8">
                  <div className={`absolute inset-y-0 rounded-full ${color}`} style={{ left: `${(start / 24) * 100}%`, width: `${((end - start) / 24) * 100}%` }} />
                </div>
              </div>
            );
          })}
          <div className="relative ml-28 h-0">
            <div className="absolute -top-44 h-48 border-l-2 border-white/70" style={{ left: '58%' }} />
          </div>
          <p className="mt-16 max-w-sm text-2xl leading-snug font-bold text-white">
            Quién está, quién falta y qué falta por aprobar, en una sola mirada.
          </p>
        </div>
      </aside>
    </main>
  );
}
