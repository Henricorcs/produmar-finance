"use client";

import { useState, useTransition } from "react";
import { UserPlus, ShieldCheck, User, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteUser, removeUser } from "@/app/(app)/configuracoes/actions";
import type { Profile, UserRole } from "@/lib/types";

const ROLES: { value: UserRole; label: string; desc: string }[] = [
  { value: "admin",       label: "Admin",       desc: "Acesso total"            },
  { value: "financeiro",  label: "Financeiro",  desc: "Lançamentos e relatórios" },
  { value: "visualizador",label: "Visualizador",desc: "Somente leitura"          },
];

const ROLE_BADGE: Record<UserRole, string> = {
  admin:        "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400",
  financeiro:   "bg-produmar-100 dark:bg-produmar-900/40 text-produmar-700 dark:text-produmar-400",
  visualizador: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
};

const ROLE_ICON: Record<UserRole, React.ComponentType<{ className?: string }>> = {
  admin:        ShieldCheck,
  financeiro:   User,
  visualizador: Eye,
};

interface Props {
  users: Profile[];
  currentUserId: string;
}

export function UserManagementClient({ users, currentUserId }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>("financeiro");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    const formData = new FormData(e.currentTarget);
    formData.set("role", selectedRole);

    startTransition(async () => {
      const result = await inviteUser(formData);
      if ("error" in result) {
        setFormError(result.error);
      } else {
        setFormSuccess("Usuário criado com sucesso!");
        setShowForm(false);
        setSelectedRole("financeiro");
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
          return (
            <div key={u.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
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
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${ROLE_BADGE[u.role]}`}
              >
                {ROLES.find((r) => r.value === u.role)?.label ?? u.role}
              </span>
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
