"use client";

import { useState, useTransition } from "react";
import { UserPlus, ShieldCheck, User, Eye, Wrench, Trash2, HardHat, Check, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  inviteUser,
  removeUser,
  updateOperatorCategories,
  updateUserModules,
} from "@/app/(app)/configuracoes/actions";
import { machineCategoryLabel } from "@/lib/utils";
import { APP_MODULES } from "@/lib/modules";
import { MACHINE_CATEGORIES, type Profile, type UserRole } from "@/lib/types";

/** Módulos que podem ser liberados por usuário (nome curto p/ os botões). */
const MODULE_OPTIONS = APP_MODULES.map((m) => ({ slug: m.slug, name: m.name }));

function moduleLabel(slug: string): string {
  return MODULE_OPTIONS.find((m) => m.slug === slug)?.name ?? slug;
}

const ROLES: { value: UserRole; label: string; desc: string }[] = [
  { value: "admin",       label: "Admin",       desc: "Acesso total"                   },
  { value: "financeiro",  label: "Financeiro",  desc: "Lançamentos e relatórios"       },
  { value: "operador",    label: "Operador",    desc: "Painel de ordens de serviço"    },
  { value: "visualizador",label: "Visualizador",desc: "Somente leitura"                },
];

const ROLE_BADGE: Record<UserRole, string> = {
  admin:        "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400",
  financeiro:   "bg-produmar-100 dark:bg-produmar-900/40 text-produmar-700 dark:text-produmar-400",
  operador:     "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
  visualizador: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
};

const ROLE_ICON: Record<UserRole, React.ComponentType<{ className?: string }>> = {
  admin:        ShieldCheck,
  financeiro:   User,
  operador:     Wrench,
  visualizador: Eye,
};

interface Props {
  users: Profile[];
  currentUserId: string;
}

export function UserManagementClient({ users, currentUserId }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>("financeiro");
  const [inviteCategories, setInviteCategories] = useState<string[]>([]);
  const [inviteModules, setInviteModules] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingCatsId, setEditingCatsId] = useState<string | null>(null);
  const [catsDraft, setCatsDraft] = useState<string[]>([]);
  const [editingModsId, setEditingModsId] = useState<string | null>(null);
  const [modsDraft, setModsDraft] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [savingCats, startSaveCats] = useTransition();
  const [savingMods, startSaveMods] = useTransition();

  function startEditCats(u: Profile) {
    setEditingModsId(null);
    setEditingCatsId(u.id);
    setCatsDraft(u.allowed_categories ?? []);
  }

  function saveCats(userId: string) {
    startSaveCats(async () => {
      const res = await updateOperatorCategories(userId, catsDraft);
      if ("error" in res) {
        alert(res.error);
        return;
      }
      setEditingCatsId(null);
    });
  }

  function startEditMods(u: Profile) {
    setEditingCatsId(null);
    setEditingModsId(u.id);
    setModsDraft(u.allowed_modules ?? []);
  }

  function saveMods(userId: string) {
    startSaveMods(async () => {
      const res = await updateUserModules(userId, modsDraft);
      if ("error" in res) {
        alert(res.error);
        return;
      }
      setEditingModsId(null);
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    const formData = new FormData(e.currentTarget);
    formData.set("role", selectedRole);
    formData.set(
      "allowed_categories",
      JSON.stringify(selectedRole === "operador" ? inviteCategories : [])
    );
    formData.set(
      "allowed_modules",
      JSON.stringify(selectedRole === "financeiro" ? inviteModules : [])
    );

    startTransition(async () => {
      const result = await inviteUser(formData);
      if ("error" in result) {
        setFormError(result.error);
      } else {
        setFormSuccess("Usuário criado com sucesso!");
        setShowForm(false);
        setSelectedRole("financeiro");
        setInviteCategories([]);
        setInviteModules([]);
        (e.target as HTMLFormElement).reset();
      }
    });
  }

  async function handleDelete(userId: string, name: string) {
    if (!confirm(`Remover o usuário "${name}"? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(userId);
    const result = await removeUser(userId);
    setDeletingId(null);
    if ("error" in result) alert(result.error);
  }

  return (
    <div className="space-y-4">
      {/* User list */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {users.map((u) => {
          const Icon = ROLE_ICON[u.role];
          const isMe = u.id === currentUserId;
          const isOperador = u.role === "operador";
          const isFinanceiro = u.role === "financeiro";
          const cats = u.allowed_categories ?? [];
          const mods = u.allowed_modules ?? [];
          return (
            <div key={u.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-produmar-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {u.full_name || u.email}
                    </p>
                    {isMe && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                        (você)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{u.email}</p>
                  {isOperador && editingCatsId !== u.id && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 truncate mt-0.5">
                      {cats.length > 0
                        ? cats.map(machineCategoryLabel).join(", ")
                        : "Todos os veículos"}
                    </p>
                  )}
                  {isFinanceiro && editingModsId !== u.id && (
                    <p className="text-[10px] text-produmar-600 dark:text-produmar-400 truncate mt-0.5">
                      {mods.length > 0
                        ? mods.map(moduleLabel).join(", ")
                        : "Todos os módulos"}
                    </p>
                  )}
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${ROLE_BADGE[u.role]}`}
                >
                  {ROLES.find((r) => r.value === u.role)?.label ?? u.role}
                </span>
                {isOperador && (
                  <button
                    onClick={() => (editingCatsId === u.id ? setEditingCatsId(null) : startEditCats(u))}
                    title="Editar veículos / máquinas"
                    className="p-1 text-slate-300 dark:text-slate-600 hover:text-produmar-600 dark:hover:text-produmar-400 transition-colors flex-shrink-0"
                  >
                    <HardHat className="w-3.5 h-3.5" />
                  </button>
                )}
                {isFinanceiro && (
                  <button
                    onClick={() => (editingModsId === u.id ? setEditingModsId(null) : startEditMods(u))}
                    title="Editar módulos liberados"
                    className="p-1 text-slate-300 dark:text-slate-600 hover:text-produmar-600 dark:hover:text-produmar-400 transition-colors flex-shrink-0"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                )}
                {!isMe && (
                  <button
                    onClick={() => handleDelete(u.id, u.full_name ?? u.email)}
                    disabled={deletingId === u.id}
                    title="Remover usuário"
                    className="p-1 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-40 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Editor de categorias do operador */}
              {isOperador && editingCatsId === u.id && (
                <div className="mt-2 ml-11 space-y-2 rounded-lg border border-produmar-100 dark:border-slate-700 bg-produmar-50/30 dark:bg-slate-800/40 p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {MACHINE_CATEGORIES.map((c) => {
                      const active = catsDraft.includes(c.value);
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() =>
                            setCatsDraft((prev) =>
                              prev.includes(c.value)
                                ? prev.filter((x) => x !== c.value)
                                : [...prev, c.value]
                            )
                          }
                          className={`px-2.5 h-8 rounded-full text-xs font-medium border transition-colors ${
                            active
                              ? "bg-produmar-600 border-produmar-600 text-white"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      Em branco = sem veículo (ex.: serviço rápido).
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingCatsId(null)}
                        className="px-3 h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Cancelar
                      </button>
                      <Button type="button" size="sm" disabled={savingCats} onClick={() => saveCats(u.id)}>
                        <Check className="w-3 h-3" />
                        {savingCats ? "Salvando…" : "Salvar"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Editor de módulos liberados (financeiro) */}
              {isFinanceiro && editingModsId === u.id && (
                <div className="mt-2 ml-11 space-y-2 rounded-lg border border-produmar-100 dark:border-slate-700 bg-produmar-50/30 dark:bg-slate-800/40 p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {MODULE_OPTIONS.map((m) => {
                      const active = modsDraft.includes(m.slug);
                      return (
                        <button
                          key={m.slug}
                          type="button"
                          onClick={() =>
                            setModsDraft((prev) =>
                              prev.includes(m.slug)
                                ? prev.filter((x) => x !== m.slug)
                                : [...prev, m.slug]
                            )
                          }
                          className={`px-2.5 h-8 rounded-full text-xs font-medium border transition-colors ${
                            active
                              ? "bg-produmar-600 border-produmar-600 text-white"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      Em branco = acesso a todos os módulos.
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingModsId(null)}
                        className="px-3 h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Cancelar
                      </button>
                      <Button type="button" size="sm" disabled={savingMods} onClick={() => saveMods(u.id)}>
                        <Check className="w-3 h-3" />
                        {savingMods ? "Salvando…" : "Salvar"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Success message */}
      {formSuccess && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 px-3 py-2 rounded-lg">
          {formSuccess}
        </p>
      )}

      {/* Add user button / form */}
      {!showForm ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShowForm(true);
            setFormSuccess(null);
            setFormError(null);
          }}
          className="w-full"
        >
          <UserPlus className="w-4 h-4" />
          Adicionar usuário
        </Button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 border border-produmar-100 dark:border-slate-700 rounded-xl p-4 bg-produmar-50/30 dark:bg-slate-800/40"
        >
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Novo usuário
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv_name" className="text-xs">Nome completo</Label>
              <Input
                id="inv_name"
                name="full_name"
                placeholder="ex: João Silva"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv_email" className="text-xs">Email *</Label>
              <Input
                id="inv_email"
                name="email"
                type="email"
                placeholder="email@empresa.com"
                required
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv_password" className="text-xs">Senha provisória *</Label>
            <Input
              id="inv_password"
              name="password"
              type="password"
              placeholder="mínimo 6 caracteres"
              required
              minLength={6}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Perfil de acesso</Label>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setSelectedRole(r.value)}
                  className={`py-2 px-2 text-xs rounded-lg border font-medium transition-colors text-center leading-tight ${
                    selectedRole === r.value
                      ? "bg-produmar-50 border-produmar-300 text-produmar-700 dark:bg-produmar-900/30 dark:border-produmar-600 dark:text-produmar-400"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="block font-semibold">{r.label}</span>
                  <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                    {r.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Categorias liberadas — só para operador (opcional) */}
          {selectedRole === "operador" && (
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <HardHat className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Veículos / máquinas que ele opera
                <span className="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {MACHINE_CATEGORIES.map((c) => {
                  const active = inviteCategories.includes(c.value);
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() =>
                        setInviteCategories((prev) =>
                          prev.includes(c.value)
                            ? prev.filter((x) => x !== c.value)
                            : [...prev, c.value]
                        )
                      }
                      className={`px-2.5 h-8 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? "bg-produmar-600 border-produmar-600 text-white"
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                Opcional. Deixe em branco para quem não opera veículo (ex.: só faz
                serviço rápido). Marque só para limitar aos veículos que ele usa.
              </p>
            </div>
          )}

          {/* Módulos liberados — só para financeiro (opcional) */}
          {selectedRole === "financeiro" && (
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5 text-produmar-600 dark:text-produmar-400" />
                Módulos que ele pode acessar
                <span className="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {MODULE_OPTIONS.map((m) => {
                  const active = inviteModules.includes(m.slug);
                  return (
                    <button
                      key={m.slug}
                      type="button"
                      onClick={() =>
                        setInviteModules((prev) =>
                          prev.includes(m.slug)
                            ? prev.filter((x) => x !== m.slug)
                            : [...prev, m.slug]
                        )
                      }
                      className={`px-2.5 h-8 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? "bg-produmar-600 border-produmar-600 text-white"
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                Opcional. Deixe em branco para liberar todos os módulos. Marque só
                para limitar (ex.: apenas Obras e Patrimônio).
              </p>
            </div>
          )}

          {formError && (
            <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormError(null);
              }}
              className="flex-1 py-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <Button type="submit" disabled={pending} size="sm" className="flex-1">
              {pending ? "Criando..." : "Criar usuário"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
