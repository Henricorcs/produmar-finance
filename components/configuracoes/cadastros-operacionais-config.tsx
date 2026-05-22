"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check, Truck, Package, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createMachine,
  updateMachine,
  deleteMachine,
  createProduct,
  updateProduct,
  deleteProduct,
  createPickupLocation,
  updatePickupLocation,
  deletePickupLocation,
} from "@/app/(app)/operacoes/actions";
import type { Machine, Product, PickupLocation } from "@/lib/types";

interface Props {
  machines: Machine[];
  products: Product[];
  pickupLocations: PickupLocation[];
}

type Tab = "machines" | "products" | "locations";

export function CadastrosOperacionaisConfig({ machines, products, pickupLocations }: Props) {
  const [tab, setTab] = useState<Tab>("machines");

  const tabs: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }>; count: number }[] = [
    { value: "machines",  label: "Máquinas", icon: Truck,   count: machines.length },
    { value: "products",  label: "Produtos", icon: Package, count: products.length },
    { value: "locations", label: "Locais",   icon: MapPin,  count: pickupLocations.length },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                tab === t.value
                  ? "bg-white dark:bg-slate-700 text-produmar-700 dark:text-produmar-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              <span className="text-[10px] opacity-60">({t.count})</span>
            </button>
          );
        })}
      </div>

      {tab === "machines"  && <MachinesList   machines={machines} />}
      {tab === "products"  && <ProductsList   products={products} />}
      {tab === "locations" && <LocationsList  locations={pickupLocations} />}
    </div>
  );
}

// ── Machines ─────────────────────────────────────────────────────────────────

function MachinesList({ machines }: { machines: Machine[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName]   = useState("");
  const [plate, setPlate] = useState("");
  const [type, setType]   = useState("");

  function reset() {
    setName(""); setPlate(""); setType(""); setEditingId(null); setShowForm(false);
  }

  function startEdit(m: Machine) {
    setEditingId(m.id);
    setName(m.name);
    setPlate(m.plate ?? "");
    setType(m.type ?? "");
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      await updateMachine(editingId, { name, plate, type });
    } else {
      await createMachine({ name, plate, type });
    }
    reset();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remover a máquina "${name}"?`)) return;
    await deleteMachine(id);
  }

  async function handleToggleActive(m: Machine) {
    await updateMachine(m.id, { active: !m.active });
  }

  return (
    <div className="space-y-3">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {machines.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 py-3">
            Nenhuma máquina cadastrada.
          </p>
        )}
        {machines.map((m) => (
          <div key={m.id} className="flex items-center gap-3 py-2.5">
            <div className="w-8 h-8 rounded-lg bg-produmar-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
              <Truck className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${m.active ? "text-slate-800 dark:text-slate-200" : "text-slate-400 line-through"}`}>
                {m.name}
                {m.plate && <span className="text-xs text-slate-400 ml-1.5">({m.plate})</span>}
              </p>
              {m.type && <p className="text-[10px] text-slate-400">{m.type}</p>}
            </div>
            <button
              onClick={() => handleToggleActive(m)}
              title={m.active ? "Desativar" : "Ativar"}
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                m.active
                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-400"
              }`}
            >
              {m.active ? "Ativa" : "Inativa"}
            </button>
            <button onClick={() => startEdit(m)} className="p-1 text-slate-400 hover:text-produmar-600">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => handleDelete(m.id, m.name)} className="p-1 text-slate-400 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {!showForm ? (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" />
          Nova máquina
        </Button>
      ) : (
        <form onSubmit={submit} className="space-y-2 p-3 rounded-xl bg-produmar-50/30 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nome (ex: caminhão 01)"
            className="h-9 text-sm uppercase placeholder:normal-case placeholder:lowercase"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="placa"
              className="h-9 text-sm uppercase placeholder:normal-case placeholder:lowercase"
            />
            <Input
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="tipo"
              className="h-9 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="flex-1 h-9 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50">
              <X className="w-3 h-3 inline mr-1" /> Cancelar
            </button>
            <Button type="submit" size="sm" className="flex-1">
              <Check className="w-3 h-3" />
              {editingId ? "Salvar" : "Adicionar"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Products ─────────────────────────────────────────────────────────────────

function ProductsList({ products }: { products: Product[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName]   = useState("");
  const [unit, setUnit]   = useState("m³");
  const [price, setPrice] = useState("");

  function reset() {
    setName(""); setUnit("m³"); setPrice(""); setEditingId(null); setShowForm(false);
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setName(p.name);
    setUnit(p.unit);
    setPrice(p.default_price != null ? p.default_price.toFixed(2).replace(".", ",") : "");
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const default_price = price.trim()
      ? parseFloat(price.replace(/\./g, "").replace(",", "."))
      : null;
    if (editingId) {
      await updateProduct(editingId, { name, unit, default_price });
    } else {
      await createProduct({ name, unit, default_price });
    }
    reset();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remover o produto "${name}"?`)) return;
    await deleteProduct(id);
  }

  async function handleToggleActive(p: Product) {
    await updateProduct(p.id, { active: !p.active });
  }

  return (
    <div className="space-y-3">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {products.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 py-3">
            Nenhum produto cadastrado.
          </p>
        )}
        {products.map((p) => (
          <div key={p.id} className="flex items-center gap-3 py-2.5">
            <div className="w-8 h-8 rounded-lg bg-produmar-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
              <Package className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${p.active ? "text-slate-800 dark:text-slate-200" : "text-slate-400 line-through"}`}>
                {p.name}
                <span className="text-xs text-slate-400 ml-1.5">/ {p.unit}</span>
              </p>
              {p.default_price != null && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                  R$ {p.default_price.toFixed(2).replace(".", ",")} / {p.unit}
                </p>
              )}
            </div>
            <button
              onClick={() => handleToggleActive(p)}
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                p.active
                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-400"
              }`}
            >
              {p.active ? "Ativo" : "Inativo"}
            </button>
            <button onClick={() => startEdit(p)} className="p-1 text-slate-400 hover:text-produmar-600">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => handleDelete(p.id, p.name)} className="p-1 text-slate-400 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {!showForm ? (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" />
          Novo produto
        </Button>
      ) : (
        <form onSubmit={submit} className="space-y-2 p-3 rounded-xl bg-produmar-50/30 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nome (ex: areia, brita 1)"
            className="h-9 text-sm uppercase placeholder:normal-case placeholder:lowercase"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="h-9 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3"
            >
              {["m³", "tonelada", "ud", "h", "km"].map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="preço médio (opcional)"
              className="h-9 text-sm"
              inputMode="decimal"
              autoComplete="off"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="flex-1 h-9 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50">
              <X className="w-3 h-3 inline mr-1" /> Cancelar
            </button>
            <Button type="submit" size="sm" className="flex-1">
              <Check className="w-3 h-3" />
              {editingId ? "Salvar" : "Adicionar"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Locations ────────────────────────────────────────────────────────────────

function LocationsList({ locations }: { locations: PickupLocation[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName]       = useState("");
  const [address, setAddress] = useState("");

  function reset() {
    setName(""); setAddress(""); setEditingId(null); setShowForm(false);
  }

  function startEdit(l: PickupLocation) {
    setEditingId(l.id);
    setName(l.name);
    setAddress(l.address ?? "");
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      await updatePickupLocation(editingId, { name, address });
    } else {
      await createPickupLocation({ name, address });
    }
    reset();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remover o local "${name}"?`)) return;
    await deletePickupLocation(id);
  }

  async function handleToggleActive(l: PickupLocation) {
    await updatePickupLocation(l.id, { active: !l.active });
  }

  return (
    <div className="space-y-3">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {locations.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 py-3">
            Nenhum local cadastrado.
          </p>
        )}
        {locations.map((l) => (
          <div key={l.id} className="flex items-center gap-3 py-2.5">
            <div className="w-8 h-8 rounded-lg bg-produmar-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${l.active ? "text-slate-800 dark:text-slate-200" : "text-slate-400 line-through"}`}>
                {l.name}
              </p>
              {l.address && <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{l.address}</p>}
            </div>
            <button
              onClick={() => handleToggleActive(l)}
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                l.active
                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-400"
              }`}
            >
              {l.active ? "Ativo" : "Inativo"}
            </button>
            <button onClick={() => startEdit(l)} className="p-1 text-slate-400 hover:text-produmar-600">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => handleDelete(l.id, l.name)} className="p-1 text-slate-400 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {!showForm ? (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" />
          Novo local
        </Button>
      ) : (
        <form onSubmit={submit} className="space-y-2 p-3 rounded-xl bg-produmar-50/30 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nome (ex: pedreira norte)"
            className="h-9 text-sm uppercase placeholder:normal-case placeholder:lowercase"
            required
          />
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="endereço (opcional)"
            className="h-9 text-sm uppercase placeholder:normal-case placeholder:lowercase"
          />
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="flex-1 h-9 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50">
              <X className="w-3 h-3 inline mr-1" /> Cancelar
            </button>
            <Button type="submit" size="sm" className="flex-1">
              <Check className="w-3 h-3" />
              {editingId ? "Salvar" : "Adicionar"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
