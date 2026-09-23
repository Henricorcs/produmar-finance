"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check, Truck, Package, MapPin, Clock, Gauge, Users } from "lucide-react";
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
import { createContact, updateContact, deleteContact } from "@/app/(app)/obras/actions";
import { formatBRLInput, machineCategoryLabel } from "@/lib/utils";
import {
  MACHINE_CATEGORIES,
  PRODUCT_UNITS,
  type Contact,
  type Machine,
  type MachineTrackingType,
  type Product,
  type PickupLocation,
} from "@/lib/types";

interface Props {
  machines: Machine[];
  products: Product[];
  pickupLocations: PickupLocation[];
  contacts: Contact[];
}

type Tab = "machines" | "products" | "locations" | "contacts";

export function CadastrosOperacionaisConfig({ machines, products, pickupLocations, contacts }: Props) {
  const [tab, setTab] = useState<Tab>("machines");

  const tabs: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }>; count: number }[] = [
    { value: "machines",  label: "Máquinas", icon: Truck,   count: machines.length },
    { value: "products",  label: "Produtos", icon: Package, count: products.length },
    { value: "locations", label: "Jazidas",  icon: MapPin,  count: pickupLocations.length },
    { value: "contacts",  label: "Clientes", icon: Users,   count: contacts.length },
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
      {tab === "contacts"  && <ContactsList   contacts={contacts} />}
    </div>
  );
}

// ── Machines ─────────────────────────────────────────────────────────────────

function MachinesList({ machines }: { machines: Machine[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName]   = useState("");
  const [plate, setPlate] = useState("");
  const [category, setCategory] = useState("");
  const [tracking, setTracking] = useState<MachineTrackingType>("hourmeter");

  function reset() {
    setName(""); setPlate(""); setCategory(""); setTracking("hourmeter");
    setEditingId(null); setShowForm(false);
  }

  function startEdit(m: Machine) {
    setEditingId(m.id);
    setName(m.name);
    setPlate(m.plate ?? "");
    setCategory(m.category ?? "");
    setTracking(m.tracking_type ?? "hourmeter");
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      await updateMachine(editingId, { name, plate, category, tracking_type: tracking });
    } else {
      await createMachine({ name, plate, category, tracking_type: tracking });
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
              <div className="flex items-center gap-1.5 mt-0.5">
                {m.category && (
                  <span className="text-[10px] font-medium text-produmar-600 dark:text-produmar-400">
                    {machineCategoryLabel(m.category)}
                  </span>
                )}
                <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                  {m.tracking_type === "km" ? (
                    <><Gauge className="w-2.5 h-2.5" />km</>
                  ) : (
                    <><Clock className="w-2.5 h-2.5" />horímetro</>
                  )}
                </span>
              </div>
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
            autoCapitalize="characters"
            data-caixa="uppercase"
            className="h-9 text-sm"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="placa"
              autoCapitalize="characters"
              data-caixa="uppercase"
              className="h-9 text-sm"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-800 dark:text-slate-100"
            >
              <option value="">categoria…</option>
              {MACHINE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          {/* Tracking type */}
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: "hourmeter", label: "Horímetro", icon: Clock },
              { v: "km",        label: "Km",        icon: Gauge },
            ] as const).map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => setTracking(v)}
                className={`flex items-center justify-center gap-1 h-8 text-[11px] rounded-md border transition-colors ${
                  tracking === v
                    ? "bg-produmar-50 border-produmar-300 text-produmar-700 dark:bg-produmar-900/30 dark:border-produmar-600 dark:text-produmar-400"
                    : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700"
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
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
    setPrice(p.default_price != null ? formatBRLInput(p.default_price) : "");
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
            autoCapitalize="characters"
            data-caixa="uppercase"
            className="h-9 text-sm"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="h-9 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3"
            >
              {PRODUCT_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <Input
              value={price}
              onChange={(e) => setPrice(formatBRLInput(e.target.value))}
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
  const [name, setName]           = useState("");
  const [address, setAddress]     = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [phone, setPhone]         = useState("");

  function reset() {
    setName(""); setAddress(""); setDocNumber(""); setPhone("");
    setEditingId(null); setShowForm(false);
  }

  function startEdit(l: PickupLocation) {
    setEditingId(l.id);
    setName(l.name);
    setAddress(l.address ?? "");
    setDocNumber(l.document ?? "");
    setPhone(l.phone ?? "");
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      await updatePickupLocation(editingId, { name, address, document: docNumber, phone });
    } else {
      await createPickupLocation({ name, address, document: docNumber, phone });
    }
    reset();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remover a jazida "${name}"?`)) return;
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
            Nenhuma jazida cadastrada.
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
              {(l.address || l.document || l.phone) && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                  {[l.address, l.document, l.phone].filter(Boolean).join(" · ")}
                </p>
              )}
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
          Nova jazida
        </Button>
      ) : (
        <form onSubmit={submit} className="space-y-2 p-3 rounded-xl bg-produmar-50/30 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nome (ex: pedreira norte)"
            autoCapitalize="characters"
            data-caixa="uppercase"
            className="h-9 text-sm"
            required
          />
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="endereço (opcional)"
            autoCapitalize="characters"
            data-caixa="uppercase"
            className="h-9 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              placeholder="CNPJ/CPF (opcional)"
              className="h-9 text-sm"
            />
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="telefone (opcional)"
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

// ── Contacts (clientes) ──────────────────────────────────────────────────────

function ContactsList({ contacts }: { contacts: Contact[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName]           = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [phone, setPhone]         = useState("");
  const [email, setEmail]         = useState("");

  function reset() {
    setName(""); setDocNumber(""); setPhone(""); setEmail("");
    setEditingId(null); setShowForm(false);
  }

  function startEdit(c: Contact) {
    setEditingId(c.id);
    setName(c.name);
    setDocNumber(c.document ?? "");
    setPhone(c.phone ?? "");
    setEmail(c.email ?? "");
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      await updateContact(editingId, { name, document: docNumber, phone, email });
    } else {
      await createContact({ name, document: docNumber, phone, email });
    }
    reset();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remover o cliente "${name}"? Obras já cadastradas com ele ficam sem cliente.`)) return;
    await deleteContact(id);
  }

  return (
    <div className="space-y-3">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {contacts.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 py-3">
            Nenhum cliente cadastrado.
          </p>
        )}
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center gap-3 py-2.5">
            <div className="w-8 h-8 rounded-lg bg-produmar-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-slate-800 dark:text-slate-200">
                {c.name}
              </p>
              {(c.document || c.phone || c.email) && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                  {[c.document, c.phone, c.email].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <button onClick={() => startEdit(c)} className="p-1 text-slate-400 hover:text-produmar-600">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => handleDelete(c.id, c.name)} className="p-1 text-slate-400 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {!showForm ? (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" />
          Novo cliente
        </Button>
      ) : (
        <form onSubmit={submit} className="space-y-2 p-3 rounded-xl bg-produmar-50/30 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nome ou razão social"
            autoCapitalize="characters"
            data-caixa="uppercase"
            className="h-9 text-sm"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              placeholder="CNPJ/CPF (opcional)"
              className="h-9 text-sm"
            />
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="telefone (opcional)"
              className="h-9 text-sm"
            />
          </div>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e-mail (opcional — a Cora avisa o cliente do boleto por aqui)"
            className="h-9 text-sm"
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
