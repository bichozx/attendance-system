import Image from 'next/image';

/* Portada: la jornada de una tienda en una imagen, sobre el carbón de la marca Tauras */
const SAMPLE = [
  ['06:00', '14:00', 'bg-[#8a7d72]'],
  ['08:00', '16:00', 'bg-[#5fae74]'],
  ['09:30', '18:30', 'bg-[#5fae74]'],
  ['14:00', '22:00', 'bg-[#e0a64a]'],
  ['22:00', '06:00', 'bg-[#a98bbd]'],
] as const;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        <Image
          src="/brand/tauras-steakhouse-tinta.png"
          alt="Tauras Steakhouse"
          width={337}
          height={180}
          priority
          className="mb-8 h-auto w-[150px] md:hidden"
        />
        <p className="text-[12px] font-semibold tracking-[0.16em] text-brand uppercase">Control de asistencia</p>
        <span aria-hidden className="rule-brass mt-2 mb-10" />
        <div className="w-full max-w-sm">{children}</div>
      </section>

      <aside aria-hidden className="bg-grill relative hidden overflow-hidden md:block">
        <Image
          src="/brand/tauras-sello.png"
          alt=""
          width={512}
          height={512}
          className="pointer-events-none absolute -right-28 -bottom-28 w-[460px] opacity-[0.06]"
        />
        <div className="relative flex h-full flex-col justify-center px-14 lg:px-20">
          <Image src="/brand/tauras-steakhouse.png" alt="" width={337} height={180} priority className="h-auto w-[260px]" />
          <p className="mt-8 max-w-md font-display text-[28px] leading-snug text-cream italic">
            Cada turno en su lugar, del servicio del mediodía al cierre.
          </p>
          <span className="rule-brass mt-5" />

          <div className="mt-10 max-w-lg">
            <p className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-brass uppercase">La jornada de hoy</p>
            <div className="flex flex-col gap-3">
              {SAMPLE.map(([from, to, color], i) => {
                const start = Number(from.slice(0, 2)) + Number(from.slice(3)) / 60;
                let end = Number(to.slice(0, 2)) + Number(to.slice(3)) / 60;
                if (end <= start) end = 24;
                return (
                  <div key={i} className="flex items-center gap-4 text-sm text-cream/60">
                    <span className="w-24 shrink-0 tabular-nums">
                      {from}–{to}
                    </span>
                    <div className="relative h-3 flex-1 rounded-full bg-white/8">
                      <div
                        className={`absolute inset-y-0 rounded-full ${color}`}
                        style={{ left: `${(start / 24) * 100}%`, width: `${((end - start) / 24) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-10 max-w-md text-sm leading-relaxed text-cream/55">
            Quién está, quién falta y qué falta por aprobar, en una sola mirada.
          </p>
        </div>
      </aside>
    </main>
  );
}
