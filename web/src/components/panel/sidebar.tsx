"use client";

import { useQuery } from "@tanstack/react-query";
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
    <aside className="border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-r md:border-b-0">
      <div className="flex items-center justify-between px-5 py-4 md:block">
        <div>
          <p className="font-bold leading-tight">{company}</p>
          <p className="text-sm text-muted">Control de asistencia</p>
        </div>
        <button
          className="rounded-ui border border-line px-3 py-1.5 text-sm md:hidden"
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
              className={`flex flex-col gap-0.5 ${group === "admin" ? "mt-3 border-t border-line pt-3" : ""}`}
            >
              {items
                .filter((i) => i.group === group)
                .map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active(item.href) ? "page" : undefined}
                      className={`flex items-center justify-between rounded-ui px-3 py-2 text-[15px] ${
                        active(item.href)
                          ? "bg-ink font-semibold text-white"
                          : "hover:bg-paper"
                      }`}
                    >
                      {item.label}
                      {item.badge === "approvals" && approvals > 0 ? (
                        <span
                          className={`rounded-full px-2 text-[13px] font-bold ${active(item.href) ? "bg-white text-ink" : "bg-warn text-white"}`}
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
        className={`${open ? "block" : "hidden"} border-t border-line px-5 py-4 md:block`}
      >
        <p className="text-sm font-semibold">{user}</p>
        <p className="text-sm text-muted">{role}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {platformAdmin ? (
            <Link href="/plataforma" className="underline-offset-4 hover:underline">
              Plataforma
            </Link>
          ) : null}
          <Link
            href="/cambiar-clave"
            className="underline-offset-4 hover:underline"
          >
            Contraseña
          </Link>
          <button
            onClick={() => void logout()}
            className="underline-offset-4 hover:underline"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </aside>
  );
}
