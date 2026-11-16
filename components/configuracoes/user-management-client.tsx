"use client";

import { useState, useTransition } from "react";
import { UserPlus, ShieldCheck, User, Eye, Wrench, Trash2, HardHat, Check, LayoutGrid, Beef, PackageOpen, Landmark, Trees, Smartphone, UserCog, RefreshCw, KeyRound } from "lucide-react";
import { DadosDeAcesso, gerarSenha, type AcessoCriado } from "@/components/configuracoes/dados-de-acesso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  inviteUser,
  removeUser,
  trocarSenhaDoUsuario,
  updateOperatorCategories,
  updateUserModules,
  updateUserRole,
} from "@/app/(app)/configuracoes/actions";
import { machineCategoryLabel } from "@/lib/utils";
import { actionError } from "@/lib/action-result";
import Link from "next/link";
import { APP_MODULES } from "@/lib/modules";
import { EXTRA_PERMISSIONS } from "@/lib/module-access";
import { MACHINE_CATEGORIES, type Profile, type UserRole } from "@/lib/types";

/**
 * O que dá para liberar no cadastro do usuário: os módulos (tela inteira, com
 * card no hub) e, no fim, as permissões avulsas — que liberam só um pedaço de
 * uma tela que a pessoa já alcança, sem mudar o resto do acesso dela.
 */
const MODULE_OPTIONS = [
  ...APP_MODULES.map((m) => ({ slug: m.slug, name: m.name })),
  ...EXTRA_PERMISSIONS.map((p) => ({ slug: p.slug, name: p.name })),
];

function moduleLabel(slug: string): string {
  return MODULE_OPTIONS.find((m) => m.slug === slug)?.name ?? slug;
}

const ROLES: { value: UserRole; label: string; desc: string }[] = [
  { value: "admin",       label: "Admin",       desc: "Acesso total"                   },
  { value: "financeiro",  label: "Financeiro",  desc: "Lançamentos e relatórios"       },
  { value: "operador",    label: "Operador",    desc: "Painel de ordens de serviço"    },
  { value: "encarregado", label: "Encarregado", desc: "Painel de OS + os módulos liberados" },
  { value: "visualizador",label: "Visualizador",desc: "Somente leitura"                },
  { value: "vaqueiro",    label: "Vaqueiro",    desc: "Só o nascimento de bezerro"     },
  { value: "vaqueiro_n1", label: "Vaqueiro nível 01", desc: "A tela de Animais, só bovinos: vacina, pesa, parto e lote" },
  { value: "tecnico",     label: "Encarregado de obra", desc: "Material, cerca e os colaboradores liberados" },
  { value: "prefeitura",  label: "Prefeitura",  desc: "Só as notas da prefeitura: lança e dá baixa" },
  { value: "chacaras",    label: "Chácaras",    desc: "Só a agenda das chácaras: reserva e dá baixa" },
];

const ROLE_BADGE: Record<UserRole, string> = {
  admin:        "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400",
  financeiro:   "bg-produmar-100 dark:bg-produmar-900/40 text-produmar-700 dark:text-produmar-400",
  operador:     "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
  encarregado:  "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400",
  visualizador: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  vaqueiro:     "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
  tecnico:      "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400",
  prefeitura:   "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400",
  chacaras:     "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
  vaqueiro_n1:  "bg-lime-100 dark:bg-lime-900/40 text-lime-700 dark:text-lime-400",
};

const ROLE_ICON: Record<UserRole, React.ComponentType<{ className?: string }>> = {
  admin:        ShieldCheck,
  financeiro:   User,
  operador:     Wrench,
  encarregado:  UserCog,
  visualizador: Eye,
  vaqueiro:     Beef,
  tecnico:      PackageOpen,
  prefeitura:   Landmark,
  chacaras:     Trees,
  vaqueiro_n1:  Beef,
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
  /** A senha do usuário novo — já vem gerada, e aparece no recado depois de criar. */
  const [senhaNova, setSenhaNova] = useState("");
  const [acessoCriado, setAcessoCriado] = useState<AcessoCriado | null>(null);
  /** Trocar a senha de quem já existe: a linha aberta, a senha nova e o recado depois. */
  const [senhaDeId, setSenhaDeId] = useState<string | null>(null);
  const [senhaDraft, setSenhaDraft] = useState("");
  const [senhaErro, setSenhaErro] = useState<string | null>(null);
  const [senhaTrocada, setSenhaTrocada] = useState<{ userId: string; acesso: AcessoCriado } | null>(null);
  const [trocandoSenha, startTrocaSenha] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingCatsId, setEditingCatsId] = useState<string | null>(null);
  const [catsDraft, setCatsDraft] = useState<string[]>([]);
  const [editingModsId, setEditingModsId] = useState<string | null>(null);
  const [modsDraft, setModsDraft] = useState<string[]>([]);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<UserRole>("financeiro");
  const [pending, startTransition] = useTransition();
  const [savingCats, startSaveCats] = useTransition();
  const [savingMods, startSaveMods] = useTransition();
  const [savingRole, startSaveRole] = useTransition();

  function abrirNovaSenha(u: Profile) {
    setEditingCatsId(null);
    setEditingModsId(null);
    setEditingRoleId(null);
    setSenhaTrocada(null);
    setSenhaErro(null);
    setSenhaDeId(u.id);
    setSenhaDraft(gerarSenha());
  }

  function confirmarNovaSenha(u: Profile) {
    setSenhaErro(null);
    const senha = senhaDraft.trim();
    startTrocaSenha(async () => {
      const err = actionError(await trocarSenhaDoUsuario(u.id, senha));
      if (err) {
        setSenhaErro(err);
        return;
      }
      setSenhaDeId(null);
      setSenhaTrocada({
        userId: u.id,
        acesso: {
          nome: u.full_name ?? "",
          email: u.email,
          senha,
          perfil: ROLES.find((r) => r.value === u.role)?.label ?? u.role,
        },
      });
    });
  }

  function startEditCats(u: Profile) {
    setEditingModsId(null);
    setEditingRoleId(null);
    setEditingCatsId(u.id);
    setCatsDraft(u.allowed_categories ?? []);
  }

  /** Trocar o perfil de acesso (ex.: promover um financeiro a admin). */
  function startEditRole(u: Profile) {
    setEditingCatsId(null);
    setEditingModsId(null);
    setEditingRoleId(u.id);
    setRoleDraft(u.role);
  }

  function saveRole(userId: string) {
    startSaveRole(async () => {
      const err = actionError(await updateUserRole(userId, roleDraft));
      if (err) {
        alert(err);
        return;
      }
      setEditingRoleId(null);
    });
  }

  function saveCats(userId: string) {
    startSaveCats(async () => {
      const err = actionError(await updateOperatorCategories(userId, catsDraft));
      if (err) {
        alert(err);
        return;
      }
      setEditingCatsId(null);
    });
  }

  function startEditMods(u: Profile) {
    setEditingCatsId(null);
    setEditingRoleId(null);
    setEditingModsId(u.id);
    setModsDraft(u.allowed_modules ?? []);
  }

  function saveMods(userId: string) {
    startSaveMods(async () => {
      const err = actionError(await updateUserModules(userId, modsDraft));
      if (err) {
        alert(err);
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
      JSON.stringify(
        selectedRole === "operador" || selectedRole === "encarregado"
          ? inviteCategories
          : []
      )
    );
    formData.set(
      "allowed_modules",
      JSON.stringify(
        selectedRole === "financeiro" ||
          selectedRole === "operador" ||
          selectedRole === "encarregado"
          ? inviteModules
          : []
      )
    );

    const criado: AcessoCriado = {
      nome: String(formData.get("full_name") ?? ""),
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      senha: String(formData.get("password") ?? "").trim(),
      perfil: ROLES.find((r) => r.value === selectedRole)?.label ?? selectedRole,
    };

    startTransition(async () => {
      const err = actionError(await inviteUser(formData));
      if (err) {
        setFormError(err);
      } else {
        setAcessoCriado(criado);
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
    const err = actionError(await removeUser(userId));
    setDeletingId(null);
    if (err) alert(err);
  }

  return (
    <div className="space-y-4">
      {/* User list */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {users.map((u) => {
          const Icon = ROLE_ICON[u.role];
          const isMe = u.id === currentUserId;
          // O encarregado recebe OS como o operador E mexe nos módulos
          // liberados para ele — por isso aparece nos dois lugares.
          const isEncarregado = u.role === "encarregado";
          const isOperador = u.role === "operador" || isEncarregado;
          const isTecnico = u.role === "tecnico";
          const isFinanceiro = u.role === "financeiro";
          /**
           * VER COMO ELE: o admin abre a tela do operador (ou do encarregado de obra) para
           * conferir se a OS chegou, sem precisar da senha da pessoa. É só
           * leitura — a tela abre com uma faixa avisando e não aceita toque.
           */
          const espiar = isOperador
            ? `/operador?ver=${u.id}`
            : isTecnico
              ? `/tecnico?ver=${u.id}`
              : u.role === "vaqueiro_n1"
                ? // a tela de Animais como ele vê: só bovinos (146)
                  "/animais?ver=vaqueiro_n1"
                : null;
          const canHaveModules = isFinanceiro || isOperador;
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
                  {canHaveModules && editingModsId !== u.id && (
                    <p className="text-[10px] text-produmar-600 dark:text-produmar-400 truncate mt-0.5">
                      {mods.length > 0
                        ? mods.map(moduleLabel).join(", ")
                        : isOperador
                          ? "Só painel de OS"
                          : "Todos os módulos"}
                    </p>
                  )}
                </div>
                {/* O selo do perfil é o botão de mudar a permissão */}
                {isMe ? (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${ROLE_BADGE[u.role]}`}
                  >
                    {ROLES.find((r) => r.value === u.role)?.label ?? u.role}
                  </span>
                ) : (
                  <button
                    onClick={() => (editingRoleId === u.id ? setEditingRoleId(null) : startEditRole(u))}
                    title="Mudar permissão"
                    className={`text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0 transition-opacity hover:opacity-80 ${ROLE_BADGE[u.role]}`}
                  >
                    {ROLES.find((r) => r.value === u.role)?.label ?? u.role}
                  </button>
                )}
                {espiar && !isMe && (
                  <Link
                    href={espiar}
                    title={`Ver a tela de ${u.full_name || u.email}`}
                    className="p-1 text-slate-300 dark:text-slate-600 hover:text-produmar-600 dark:hover:text-produmar-400 transition-colors flex-shrink-0"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </Link>
                )}
                {isOperador && (
                  <button
                    onClick={() => (editingCatsId === u.id ? setEditingCatsId(null) : startEditCats(u))}
                    title="Editar veículos / máquinas"
                    className="p-1 text-slate-300 dark:text-slate-600 hover:text-produmar-600 dark:hover:text-produmar-400 transition-colors flex-shrink-0"
                  >
                    <HardHat className="w-3.5 h-3.5" />
                  </button>
                )}
                {canHaveModules && (
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
                    onClick={() => (senhaDeId === u.id ? setSenhaDeId(null) : abrirNovaSenha(u))}
                    title="Nova senha"
                    className="p-1 text-slate-300 dark:text-slate-600 hover:text-produmar-600 dark:hover:text-produmar-400 transition-colors flex-shrink-0"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
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

              {/* Nova senha: gera, confirma e mostra o recado para mandar */}
              {!isMe && senhaDeId === u.id && (
                <div className="mt-2 ml-11 space-y-2 rounded-lg border border-produmar-100 dark:border-slate-700 bg-produmar-50/30 dark:bg-slate-800/40 p-3">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Nova senha para {u.full_name || u.email}
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={senhaDraft}
                      onChange={(e) => setSenhaDraft(e.target.value)}
                      aria-label="Nova senha"
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      semDitado
                      className="h-9 text-sm font-semibold tracking-wide"
                    />
                    <button
                      type="button"
                      onClick={() => setSenhaDraft(gerarSenha())}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Outra
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    A senha antiga deixa de valer na hora. Depois de trocar, aparece o recado para mandar.
                  </p>
                  {senhaErro && <p className="text-xs text-red-600 dark:text-red-400">{senhaErro}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSenhaDeId(null)}
                      disabled={trocandoSenha}
                      className="flex-1 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      Cancelar
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1"
                      disabled={trocandoSenha || senhaDraft.trim().length < 6}
                      onClick={() => confirmarNovaSenha(u)}
                    >
                      {trocandoSenha ? "Trocando..." : "Trocar a senha"}
                    </Button>
                  </div>
                </div>
              )}
              {senhaTrocada?.userId === u.id && (
                <div className="mt-2 ml-11">
                  <DadosDeAcesso
                    acesso={senhaTrocada.acesso}
                    titulo={`Senha nova — mande o acesso para ${u.full_name || u.email}`}
                    onFechar={() => setSenhaTrocada(null)}
                  />
                </div>
              )}

              {/* Editor do perfil de acesso (admin, financeiro, operador...) */}
              {!isMe && editingRoleId === u.id && (
                <div className="mt-2 ml-11 space-y-2 rounded-lg border border-produmar-100 dark:border-slate-700 bg-produmar-50/30 dark:bg-slate-800/40 p-3">
                  <div className="grid grid-cols-2 gap-1.5">
                    {ROLES.map((r) => {
                      const active = roleDraft === r.value;
                      return (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => setRoleDraft(r.value)}
                          className={`py-2 px-2 text-xs rounded-lg border font-medium transition-colors text-left leading-tight ${
                            active
                              ? "bg-produmar-600 border-produmar-600 text-white"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          <span className="block font-semibold">{r.label}</span>
                          <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                            {r.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {roleDraft === "admin"
                        ? "Admin acessa tudo, inclusive esta tela."
                        : "Vale na hora — ele já entra com o novo acesso."}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingRoleId(null)}
                        className="px-3 h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Cancelar
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={savingRole || roleDraft === u.role}
                        onClick={() => saveRole(u.id)}
                      >
                        <Check className="w-3 h-3" />
                        {savingRole ? "Salvando…" : "Salvar"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

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

              {/* Editor de módulos liberados (financeiro / operador) */}
              {canHaveModules && editingModsId === u.id && (
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
                      {isOperador
                        ? "Em branco = só painel de OS."
                        : "Em branco = acesso a todos os módulos."}
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
      {acessoCriado && (
        <DadosDeAcesso acesso={acessoCriado} onFechar={() => setAcessoCriado(null)} />
      )}

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
            setAcessoCriado(null);
            setSenhaNova(gerarSenha());
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
            <Label htmlFor="inv_password" className="text-xs">Senha (já gerada — pode trocar)</Label>
            <div className="flex gap-2">
              <Input
                id="inv_password"
                name="password"
                type="text"
                value={senhaNova}
                onChange={(e) => setSenhaNova(e.target.value)}
                placeholder="mínimo 6 caracteres"
                required
                minLength={6}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                semDitado
                className="h-9 text-sm font-semibold tracking-wide"
              />
              <button
                type="button"
                onClick={() => setSenhaNova(gerarSenha())}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Outra
              </button>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Depois de criar, aparece o recado com o site, o login e a senha para mandar para a pessoa.
            </p>
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
          {(selectedRole === "operador" || selectedRole === "encarregado") && (
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

          {/* Módulos liberados — para financeiro e operador (opcional) */}
          {(selectedRole === "financeiro" ||
            selectedRole === "operador" ||
            selectedRole === "encarregado") && (
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
                {selectedRole === "operador" || selectedRole === "encarregado"
                  ? "Opcional. O operador sempre tem o Painel de OS. Marque módulos extras (ex.: Obras) para liberar além do painel."
                  : "Opcional. Deixe em branco para liberar todos os módulos. Marque só para limitar (ex.: apenas Obras e Patrimônio)."}
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
