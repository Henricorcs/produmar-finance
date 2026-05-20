"use client";

import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/app/(app)/categorias/actions";
import type { Category } from "@/lib/types";

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

interface FormState {
  name: string;
  type: "entrada" | "saida";
  color: string;
}

const DEFAULT_FORM: FormState = { name: "", type: "saida", color: "#0A4DB8" };

export function CategoriasConfig({ categories }: { categories: Category[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterType, setFilterType] = useState<"" | "entrada" | "saida">("");

  const filtered = useMemo(
    () => (filterType ? categories.filter((c) => c.type === filterType) : categories),
    [categories, filterType]
  );

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
    if (!form.name.trim()) { setError("Informe o nome."); return; }
    setLoading(true);
    setError("");
    const result = editing
      ? await updateCategory(editing.id, form)
      : await createCategory(form);
    setLoading(false);
    if ("error" in result) { setError(result.error ?? "Erro ao salvar."); } else { cancelForm(); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir categoria? Lançamentos vinculados perderão a categoria.")) return;
    await deleteCategory(id);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        {/* Filter pills */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {([["", "Todas"], ["entrada", "Receitas"], ["saida", "Despesas"]] as const).map(
            ([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterType(val)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
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

        {!showForm && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5" />
            Nova
          </Button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="rounded-xl border border-produmar-100 dark:border-slate-700 bg-produmar-50/60 dark:bg-slate-800/60 p-4 space-y-4">
          <p className="text-sm font-semibold text-produmar-800 dark:text-slate-100">
            {editing ? "Editar categoria" : "Nova categoria"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Name */}
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome da categoria"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-produmar-400"
            />

            {/* Type */}
            <div className="flex gap-2">
              {(["saida", "entrada"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, type: t })}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    form.type === t
                      ? t === "entrada"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-red-600 text-white border-red-600"
                      : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            {/* Colors */}
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Cor</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESET_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setForm({ ...form, color: hex })}
                    className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110"
                    style={{
                      backgroundColor: hex,
                      borderColor: form.color === hex ? "#0f172a" : "transparent",
                      boxShadow: form.color === hex ? `0 0 0 2px white, 0 0 0 3px ${hex}` : "none",
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5 bg-white dark:bg-slate-900"
                />
                <span className="text-xs text-slate-400">Personalizada</span>
                <span
                  className="ml-auto text-[10px] px-2 py-0.5 rounded-full text-white font-semibold"
                  style={{ backgroundColor: form.color }}
                >
                  {form.name || "Prévia"}
                </span>
              </div>
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={loading} className="flex-1">
                {loading ? "Salvando..." : editing ? "Salvar" : "Criar"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={cancelForm}>
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">
          Nenhuma categoria.{" "}
          <button onClick={openCreate} className="text-produmar-600 hover:underline">
            Criar agora
          </button>
        </p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
          {filtered.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors group"
            >
              {/* Color swatch */}
              <div
                className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: cat.color + "22" }}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
              </div>

              {/* Name + type */}
              <div className="flex-1 min-w-0 flex items-center gap-2">
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

              {/* Actions */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEdit(cat)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-produmar-600 hover:bg-produmar-50 dark:hover:bg-produmar-900/30 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(cat.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
