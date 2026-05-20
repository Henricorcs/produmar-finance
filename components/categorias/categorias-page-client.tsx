"use client";

import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/app/(app)/categorias/actions";
import type { Category } from "@/lib/types";

/* ── preset colors ─────────────────────────────────────── */
const PRESET_COLORS = [
  "#0A4DB8", "#3378F0", "#5A97FF",
  "#10B981", "#059669", "#34D399",
  "#F59E0B", "#D97706", "#FCD34D",
  "#EF4444", "#DC2626", "#F87171",
  "#8B5CF6", "#7C3AED", "#A78BFA",
  "#EC4899", "#DB2777", "#F9A8D4",
  "#14B8A6", "#0D9488", "#2DD4BF",
  "#64748B", "#475569", "#94A3B8",
];

const TYPE_LABELS = { entrada: "Receita", saida: "Despesa" } as const;

/* ── form state ─────────────────────────────────────────── */
interface FormState {
  name: string;
  type: "entrada" | "saida";
  color: string;
}

const DEFAULT_FORM: FormState = {
  name: "",
  type: "saida",
  color: "#0A4DB8",
};

/* ── main component ─────────────────────────────────────── */
export function CategoriasPageClient({
  categories,
}: {
  categories: Category[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterType, setFilterType] = useState<"" | "entrada" | "saida">("");

  const filtered = useMemo(
    () =>
      filterType
        ? categories.filter((c) => c.type === filterType)
        : categories,
    [categories, filterType]
  );

  const entradas = categories.filter((c) => c.type === "entrada").length;
  const saidas = categories.filter((c) => c.type === "saida").length;

  function openCreate() {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setError("");
    setShowForm(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setForm({ name: cat.name, type: cat.type, color: cat.color });
    setError("");
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditing(null);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Informe o nome da categoria.");
      return;
    }
    setLoading(true);
    setError("");

    const result = editing
      ? await updateCategory(editing.id, form)
      : await createCategory(form);

    setLoading(false);

    if ("error" in result) {
      setError(result.error ?? "Erro ao salvar.");
    } else {
      setShowForm(false);
      setEditing(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta categoria? Lançamentos vinculados perderão a categoria."))
      return;
    await deleteCategory(id);
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
            Categorias
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Organize seus lançamentos por categoria
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Nova categoria
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-produmar-100 dark:border-slate-800 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total</p>
          <p className="text-2xl font-medium text-produmar-700 dark:text-produmar-400">
            {categories.length}
          </p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-100 dark:border-emerald-900/50 p-4">
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">Receitas</p>
          <p className="text-2xl font-medium text-emerald-700 dark:text-emerald-400">
            {entradas}
          </p>
        </div>
        <div className="bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-100 dark:border-red-900/50 p-4">
          <p className="text-xs text-red-600 dark:text-red-400 mb-1">Despesas</p>
          <p className="text-2xl font-medium text-red-700 dark:text-red-400">
            {saidas}
          </p>
        </div>
      </div>

      {/* Form inline */}
      {showForm && (
        <Card className="p-5 border-produmar-200 dark:border-produmar-900/50 bg-produmar-50/60 dark:bg-slate-800/60">
          <h2 className="text-sm font-semibold text-produmar-800 dark:text-slate-100 mb-4">
            {editing ? "Editar categoria" : "Nova categoria"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
                Nome
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Energia elétrica, Mensalidade..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-produmar-400"
              />
            </div>

            {/* Type */}
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
                Tipo
              </label>
              <div className="flex gap-2">
                {(["saida", "entrada"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, type: t })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      form.type === t
                        ? t === "entrada"
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-red-600 text-white border-red-600"
                        : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-2">
                Cor
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {PRESET_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setForm({ ...form, color: hex })}
                    className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                    style={{
                      backgroundColor: hex,
                      borderColor:
                        form.color === hex ? "#0f172a" : "transparent",
                      boxShadow:
                        form.color === hex
                          ? `0 0 0 2px white, 0 0 0 4px ${hex}`
                          : "none",
                    }}
                    title={hex}
                  />
                ))}
              </div>
              {/* Custom color input */}
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5 bg-white dark:bg-slate-900"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Cor personalizada
                </span>
                {/* Preview badge */}
                <span
                  className="ml-auto text-[11px] px-2.5 py-1 rounded-full text-white font-semibold"
                  style={{ backgroundColor: form.color }}
                >
                  {form.name || "Prévia"}
                </span>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? "Salvando..." : editing ? "Salvar alterações" : "Criar categoria"}
              </Button>
              <Button type="button" variant="outline" onClick={cancelForm}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
        {([["", "Todas"], ["entrada", "Receitas"], ["saida", "Despesas"]] as const).map(
          ([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterType(val)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filterType === val
                  ? "bg-white dark:bg-slate-700 text-produmar-700 dark:text-produmar-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          )
        )}
      </div>

      {/* List */}
      <Card>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <Tag className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Nenhuma categoria encontrada
            </p>
            <button
              onClick={openCreate}
              className="mt-3 text-xs text-produmar-600 hover:underline"
            >
              + Criar primeira categoria
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors group"
              >
                {/* Color dot */}
                <div
                  className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: cat.color + "22" }}
                >
                  <div
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {cat.name}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-semibold leading-none"
                      style={{ backgroundColor: cat.color }}
                    >
                      {TYPE_LABELS[cat.type]}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                    {cat.color}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={() => openEdit(cat)}
                    title="Editar"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-produmar-600 hover:bg-produmar-50 dark:hover:bg-produmar-900/30 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
                    title="Excluir"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
