"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { api, call } from "@/lib/api/client";

interface Item {
  href: string;
  label: string;
  badge?: "approvals";
  group: "daily" | "admin";
}

export function Sidebar({
  company,
  user,
  role,
  items,
  showCounts,
  platformAdmin = false,
}: {
  company: string;
  user: string;
  role: string;
  items: Item[];
  showCounts: boolean;
  platformAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Pendientes por aprobar (mismo dato que el dashboard: una sola consulta en caché)
  const dashboard = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: () => call(api.GET("/reports/dashboard", {})),
    enabled: showCounts,
    refetchInterval: 60_000,
  });
  const p = dashboard.data?.pending;
  const approvals = p
    ? p.attendanceToReview + p.incidentsToApprove + p.shiftChangesToApprove
    : 0;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="bg-grill text-cream md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:overflow-y-auto">
      <div className="flex items-center justify-between gap-4 px-5 py-4 md:block md:px-6 md:pt-7 md:pb-5">
        <Link href="/" className="flex items-center gap-3 md:block" aria-label={`${company} · Control de asistencia, inicio`}>
          <Image
            src="/brand/tauras-steakhouse.png"
            alt=""
            width={337}
            height={180}
            priority
            className="h-auto w-[92px] md:w-[150px]"
          />
          <span className="block md:mt-4">
            <span className="block text-[12px] font-semibold tracking-[0.14em] text-brass uppercase">Asistencia</span>
            <span className="block text-sm leading-snug text-cream/65">{company}</span>
          </span>
        </Link>
        <button
          className="rounded-ui border border-white/20 px-3 py-1.5 text-sm text-cream hover:bg-white/5 md:hidden"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          Menú
        </button>
      </div>

      <nav
        className={`${open ? "block" : "hidden"} px-3 pb-3 md:block md:flex-1`}
        aria-label="Principal"
      >
        {(["daily", "admin"] as const).map((group) =>
          items.some((i) => i.group === group) ? (
            <ul
              key={group}
              aria-label={group === "daily" ? "Operación" : "Administración"}
              className={`flex flex-col gap-0.5 ${group === "admin" ? "mt-4 border-t border-white/10 pt-4" : ""}`}
            >
              <li aria-hidden className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.16em] text-cream/40 uppercase">
                {group === "daily" ? "Operación" : "Administración"}
              </li>
              {items
                .filter((i) => i.group === group)
                .map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active(item.href) ? "page" : undefined}
                      className={`flex items-center justify-between rounded-ui px-3 py-2 text-[15px] transition-colors ${
                        active(item.href)
                          ? "bg-brand font-semibold text-white shadow-[inset_3px_0_0_var(--color-brass)]"
                          : "text-cream/80 hover:bg-white/[0.06] hover:text-cream"
                      }`}
                    >
                      {item.label}
                      {item.badge === "approvals" && approvals > 0 ? (
                        <span
                          className={`rounded-full px-2 text-[13px] font-bold ${active(item.href) ? "bg-cream text-brand" : "bg-brass text-char"}`}
                          aria-label={`${approvals} pendientes`}
                        >
                          {approvals}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
            </ul>
          ) : null,
        )}
      </nav>

      <div
        className={`${open ? "block" : "hidden"} border-t border-white/10 px-6 py-4 md:block`}
      >
        <p className="text-sm font-semibold text-cream">{user}</p>
        <p className="text-sm text-cream/55">{role}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-cream/80">
          {platformAdmin ? (
            <Link href="/plataforma" className="underline-offset-4 hover:text-cream hover:underline">
              Plataforma
            </Link>
          ) : null}
          <Link
            href="/cambiar-clave"
            className="underline-offset-4 hover:text-cream hover:underline"
          >
            Contraseña
          </Link>
          <button
            onClick={() => void logout()}
            className="underline-offset-4 hover:text-cream hover:underline"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </aside>
  );
}
