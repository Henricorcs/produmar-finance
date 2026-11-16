"use client";

import { useState } from "react";
import Link from "next/link";
import { Wallet, Bell, LogOut, User as UserIcon, ChevronDown, AlertTriangle, Clock, Milk, ChevronRight, Ban } from "lucide-react";
import { getInitials, formatBRL, formatDate } from "@/lib/utils";
import { signOutAction } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { BlocoNotas } from "@/components/layout/bloco-notas";
import { BotaoAtualizar } from "@/components/layout/botao-atualizar";
import type { Profile } from "@/lib/types";

type NotifItem = {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  status: string;
  type: string;
  isOverdue: boolean;
};

interface TopbarProps {
  profile: Profile | null;
  notifications?: NotifItem[];
  /** O bloco de notas desta pessoa, do jeito que está no banco (migration 090). */
  nota?: string;
  /** Quando o bloco foi gravado pela última vez (ISO), para o "Salvo às ...". */
  notaEm?: string | null;
  /** Crias bovinas com 8 meses ou mais sem o desmame marcado (migration 145). */
  desmames?: number;
  /** Animais do rebanho marcados para descarte (migration 147). */
  descartes?: number;
}

export function Topbar({
  profile,
  notifications = [],
  nota = "",
  notaEm = null,
  desmames = 0,
  descartes = 0,
}: TopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const overdueCount = notifications.filter((n) => n.isOverdue).length;
  const hasUnread = notifications.length > 0 || desmames > 0 || descartes > 0;
  // Vaqueiro nível 01 (migration 146): o sino é só dos animais (desmame e
  // descarte) — contas a pagar e Configurações não são da conta dele (o
  // middleware nem deixa abrir).
  const ehVaqueiroN1 = profile?.role === "vaqueiro_n1";

  return (
    <header className="produmar-hero text-white pt-safe">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
        {/* Logo leva ao hub de módulos (operador/visualizador são
            redirecionados pelo middleware para suas telas) */}
        <Link href="/inicio" className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 text-produmar-600" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-medium">PRODUMAR</div>
            <div className="text-[11px] text-produmar-200 hidden sm:block">
              Gestão interna
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {/* Bloco de notas — o papelzinho de cada um, em toda tela */}
          <BlocoNotas inicial={nota} atualizadoEm={notaEm} />

          {/* Ao lado dele, o que troca a versão do app depois de uma
              implantação — aqui ele fica à mão em toda tela, e não só no hub */}
          <BotaoAtualizar />

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setNotifOpen(!notifOpen); setMenuOpen(false); }}
              className="relative w-10 h-10 sm:w-9 sm:h-9 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
              aria-label="Notificações"
            >
              <Bell className="w-5 h-5" />
              {hasUnread && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-400 rounded-full border border-white/30" />
              )}
            </button>

            {notifOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} aria-hidden />
                <div className="absolute right-0 mt-2 w-[min(320px,calc(100vw-2rem))] bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl shadow-black/10 overflow-hidden z-50">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Notificações
                    </span>
                    {overdueCount > 0 && (
                      <span className="text-[10px] bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
                        {overdueCount} vencida{overdueCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {/* Alerta de desmame — leva à lista das crias em Animais */}
                  {desmames > 0 && (
                    <a
                      href="/animais?desmame=1"
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-100 dark:bg-amber-900/40">
                        <Milk className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {desmames} {desmames === 1 ? "cria pronta" : "crias prontas"} para desmamar
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          Bezerros com 8 meses ou mais
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    </a>
                  )}

                  {/* Alerta de descarte — leva à lista em Animais (147) */}
                  {descartes > 0 && (
                    <a
                      href="/animais?descarte=1"
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-red-100 dark:bg-red-900/40">
                        <Ban className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {descartes} {descartes === 1 ? "animal" : "animais"} para descarte
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          Marcados na ficha do animal
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    </a>
                  )}

                  {/* List */}
                  {ehVaqueiroN1 ? (
                    desmames === 0 && descartes === 0 && (
                      <div className="px-4 py-8 text-center">
                        <Bell className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-400 dark:text-slate-500">
                          Nenhum aviso agora
                        </p>
                      </div>
                    )
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-400 dark:text-slate-500">
                        Nenhuma conta pendente nos próximos 7 dias
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                      {notifications.map((n) => (
                        <a
                          key={n.id}
                          href="/contas"
                          onClick={() => setNotifOpen(false)}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                            n.isOverdue
                              ? "bg-red-100 dark:bg-red-900/40"
                              : "bg-amber-100 dark:bg-amber-900/40"
                          }`}>
                            {n.isOverdue
                              ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                              : <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                              {n.description}
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                              Venc. {formatDate(n.due_date)}
                              {n.isOverdue && (
                                <span className="ml-1.5 text-red-500 dark:text-red-400 font-medium">
                                  · Vencida
                                </span>
                              )}
                            </p>
                          </div>
                          <span className={`text-sm font-semibold flex-shrink-0 ${
                            n.type === "saida" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                          }`}>
                            {formatBRL(n.amount)}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Footer */}
                  {!ehVaqueiroN1 && (
                    <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-700">
                      <a
                        href="/contas"
                        onClick={() => setNotifOpen(false)}
                        className="text-xs text-produmar-600 dark:text-produmar-400 hover:underline"
                      >
                        Ver todas as contas →
                      </a>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setMenuOpen(!menuOpen); setNotifOpen(false); }}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-white/10 transition-colors"
            >
              <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-xs font-medium text-produmar-700">
                {getInitials(profile?.full_name)}
              </div>
              <span className="text-sm hidden sm:inline max-w-[120px] truncate">
                {profile?.full_name?.split(" ")[0] ?? "Usuário"}
              </span>
              <ChevronDown className="w-4 h-4 hidden sm:inline" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg border border-produmar-100 dark:border-slate-700 shadow-xl shadow-produmar-900/10 overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-produmar-100 dark:border-slate-700">
                    <div className="text-sm font-medium truncate">
                      {profile?.full_name ?? "Usuário"}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {profile?.email}
                    </div>
                    <div className="mt-1.5 inline-block text-[10px] uppercase tracking-wide bg-produmar-50 dark:bg-produmar-900/40 text-produmar-700 dark:text-produmar-300 px-2 py-0.5 rounded">
                      {ehVaqueiroN1 ? "Vaqueiro nível 01" : profile?.role ?? "—"}
                    </div>
                  </div>
                  {!ehVaqueiroN1 && (
                    <a
                      href="/configuracoes"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-produmar-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <UserIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      Configurações
                    </a>
                  )}
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-400 transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      Sair
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
