"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { Plus, X, Truck, Wrench, User, Building2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { QuickCreateMachineDialog } from "./quick-create-machine-dialog";
import { QuickCreateProductDialog } from "./quick-create-product-dialog";
import { QuickCreateLocationDialog } from "./quick-create-location-dialog";
import {
  createServiceOrder,
  updateServiceOrder,
  type ServiceOrderItemInput,
} from "@/app/(app)/operacoes/actions";
import { formatBRL } from "@/lib/utils";
import type {
  Machine,
  PickupLocation,
  Product,
  ServiceFreightType,
  ServiceOrder,
  ServiceOrderItem,
  ServiceOrderStatus,
  ServiceOrderType,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  order?: (ServiceOrder & { service_order_items?: ServiceOrderItem[] }) | null;
  machines: Machine[];
  products: Product[];
  pickupLocations: PickupLocation[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseBRLToNumber(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function formatBRLInput(raw: string | number): string {
  let digits: string;
  if (typeof raw === "number") digits = String(Math.round(raw * 100));
  else digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQty(raw: string | number): string {
  if (typeof raw === "number") return raw.toString().replace(".", ",");
  // Allow digits + one comma; cap at 3 decimals
  const cleaned = raw.replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1]?.length > 3) return parts[0] + "," + parts[1].slice(0, 3);
  return cleaned;
}

function parseQty(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

interface ItemDraft {
  product_id: string;
  description: string;
  quantity: string;       // BR formatted "1,5"
  unit: string;
  unit_price: string;     // BR formatted "120,00"
}

function emptyItem(): ItemDraft {
  return { product_id: "", description: "", quantity: "1", unit: "m³", unit_price: "" };
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Component ────────────────────────────────────────────────────────────────

export function ServiceOrderDialog({
  open,
  onClose,
  order,
  machines,
  products,
  pickupLocations,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [type, setType] = useState<ServiceOrderType>("entrega_material");
  const [freightType, setFreightType] = useState<ServiceFreightType>("cliente");
  const [status, setStatus] = useState<ServiceOrderStatus>("pendente");

  const [clientName, setClientName]         = useState("");
  const [clientDocument, setClientDocument] = useState("");
  const [clientPhone, setClientPhone]       = useState("");

  const [machineId, setMachineId]                 = useState("");
  const [pickupLocationId, setPickupLocationId]   = useState("");
  const [deliveryAddress, setDeliveryAddress]     = useState("");
  const [serviceDescription, setServiceDescription] = useState("");

  const [deliveryDate, setDeliveryDate]       = useState("");
  const [hourmeterStart, setHourmeterStart]   = useState("");
  const [hourmeterEnd, setHourmeterEnd]       = useState("");
  const [receivedBy, setReceivedBy]           = useState("");
  const [notes, setNotes]                     = useState("");

  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);

  // Local lists for optimistic insertion of new entities
  const [localMachines, setLocalMachines]     = useState<Machine[]>(machines);
  const [localProducts, setLocalProducts]     = useState<Product[]>(products);
  const [localLocations, setLocalLocations]   = useState<PickupLocation[]>(pickupLocations);

  // Quick-create dialogs
  const [mchDialogOpen, setMchDialogOpen] = useState(false);
  const [prdDialogOpen, setPrdDialogOpen] = useState(false);
  const [locDialogOpen, setLocDialogOpen] = useState(false);
  const [prdDialogIdx, setPrdDialogIdx]   = useState<number | null>(null);

  // Sync local lists when props change
  useEffect(() => setLocalMachines(machines),     [machines]);
  useEffect(() => setLocalProducts(products),     [products]);
  useEffect(() => setLocalLocations(pickupLocations), [pickupLocations]);

  // Hydrate from `order` when editing or reset when creating
  useEffect(() => {
    if (!open) return;
    if (order) {
      setType(order.type);
      setFreightType(order.freight_type);
      setStatus(order.status);
      setClientName(order.client_name ?? "");
      setClientDocument(order.client_document ?? "");
      setClientPhone(order.client_phone ?? "");
      setMachineId(order.machine_id ?? "");
      setPickupLocationId(order.pickup_location_id ?? "");
      setDeliveryAddress(order.delivery_address ?? "");
      setServiceDescription(order.service_description ?? "");
      setDeliveryDate(order.delivery_date ?? "");
      setHourmeterStart(order.hourmeter_start?.toString().replace(".", ",") ?? "");
      setHourmeterEnd(order.hourmeter_end?.toString().replace(".", ",") ?? "");
      setReceivedBy(order.received_by ?? "");
      setNotes(order.notes ?? "");
      setItems(
        (order.service_order_items ?? []).length > 0
          ? order.service_order_items!.map((it) => ({
              product_id: it.product_id ?? "",
              description: it.description ?? "",
              quantity: formatQty(it.quantity),
              unit: it.unit ?? "m³",
              unit_price: formatBRLInput(it.unit_price),
            }))
          : [emptyItem()]
      );
    } else {
      setType("entrega_material");
      setFreightType("cliente");
      setStatus("pendente");
      setClientName("");
      setClientDocument("");
      setClientPhone("");
      setMachineId("");
      setPickupLocationId("");
      setDeliveryAddress("");
      setServiceDescription("");
      setDeliveryDate(todayStr());
      setHourmeterStart("");
      setHourmeterEnd("");
      setReceivedBy("");
      setNotes("");
      setItems([emptyItem()]);
    }
    setError(null);
  }, [open, order]);

  // ── Item helpers ─────────────────────────────────────────────────────────

  function setItem(idx: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function pickProduct(idx: number, productId: string) {
    const product = localProducts.find((p) => p.id === productId);
    setItem(idx, {
      product_id: productId,
      unit: product?.unit ?? "m³",
      unit_price:
        product?.default_price != null && !items[idx].unit_price
          ? formatBRLInput(product.default_price)
          : items[idx].unit_price,
    });
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(idx: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  // ── Quick-create callbacks ───────────────────────────────────────────────

  function handleMachineCreated(m: Machine) {
    setLocalMachines((prev) => [...prev.filter((x) => x.id !== m.id), m].sort((a, b) => a.name.localeCompare(b.name)));
    setMachineId(m.id);
  }
  function handleLocationCreated(loc: PickupLocation) {
    setLocalLocations((prev) => [...prev.filter((x) => x.id !== loc.id), loc].sort((a, b) => a.name.localeCompare(b.name)));
    setPickupLocationId(loc.id);
  }
  function handleProductCreated(p: Product) {
    setLocalProducts((prev) => [...prev.filter((x) => x.id !== p.id), p].sort((a, b) => a.name.localeCompare(b.name)));
    if (prdDialogIdx !== null) {
      pickProduct(prdDialogIdx, p.id);
    }
    setPrdDialogIdx(null);
  }

  // ── Total ────────────────────────────────────────────────────────────────

  const total = useMemo(() => {
    return items.reduce((s, it) => s + parseQty(it.quantity) * parseBRLToNumber(it.unit_price), 0);
  }, [items]);

  // ── Submit ───────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const itemsPayload: ServiceOrderItemInput[] = items
      .filter((it) => it.product_id || it.description.trim())
      .map((it) => ({
        product_id: it.product_id || null,
        description: it.description,
        quantity: parseQty(it.quantity),
        unit: it.unit,
        unit_price: parseBRLToNumber(it.unit_price),
      }));

    if (itemsPayload.length === 0) {
      setError("Adicione ao menos um item");
      return;
    }

    const payload = {
      type,
      freight_type: freightType,
      status,
      client_name: freightType === "cliente" ? clientName : null,
      client_document: freightType === "cliente" ? clientDocument : null,
      client_phone: freightType === "cliente" ? clientPhone : null,
      machine_id: machineId || null,
      pickup_location_id: pickupLocationId || null,
      delivery_address: deliveryAddress,
      service_description: serviceDescription,
      delivery_date: deliveryDate || null,
      hourmeter_start:
        type === "prestacao_servico" && hourmeterStart.trim()
          ? parseFloat(hourmeterStart.replace(",", "."))
          : null,
      hourmeter_end:
        type === "prestacao_servico" && hourmeterEnd.trim()
          ? parseFloat(hourmeterEnd.replace(",", "."))
          : null,
      received_by: receivedBy.trim() || null,
      notes,
      items: itemsPayload,
    };

    startTransition(async () => {
      const result = order
        ? await updateServiceOrder(order.id, payload)
        : await createServiceOrder(payload);
      if (result && "error" in result) setError(result.error ?? "Erro ao salvar");
      else onClose();
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const isClient = freightType === "cliente";

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">
              {order ? `Editar OS #${order.order_number}` : "Nova ordem de serviço"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Type toggle */}
            <div className="space-y-1.5">
              <Label>O que é? *</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { v: "entrega_material",  label: "Entrega de material", icon: Truck },
                  { v: "prestacao_servico", label: "Prestação de serviço", icon: Wrench },
                ] as const).map(({ v, label, icon: Icon }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setType(v)}
                    className={`flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg border font-medium transition-colors ${
                      type === v
                        ? "bg-produmar-50 border-produmar-300 text-produmar-700 dark:bg-produmar-900/30 dark:border-produmar-600 dark:text-produmar-400"
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Freight type toggle */}
            <div className="space-y-1.5">
              <Label>Para quem é? *</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { v: "cliente", label: "Cliente externo", icon: User },
                  { v: "interno", label: "Consumo interno", icon: Building2 },
                ] as const).map(({ v, label, icon: Icon }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setFreightType(v)}
                    className={`flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg border font-medium transition-colors ${
                      freightType === v
                        ? v === "cliente"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-700/50 dark:text-emerald-400"
                          : "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-700/50 dark:text-amber-400"
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Client info (only when cliente) */}
            {isClient && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="client_name">Nome do cliente *</Label>
                  <Input
                    id="client_name"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="ex: construtora silva"
                    className="uppercase placeholder:normal-case placeholder:lowercase"
                    autoCapitalize="characters"
                    required={isClient}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="client_doc">CPF/CNPJ</Label>
                  <Input
                    id="client_doc"
                    value={clientDocument}
                    onChange={(e) => setClientDocument(e.target.value)}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="client_phone">Telefone</Label>
                  <Input
                    id="client_phone"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="(99) 99999-9999"
                  />
                </div>
              </div>
            )}

            {/* Machine */}
            <div className="space-y-1.5">
              <Label>Máquina / veículo</Label>
              <SearchableSelect
                items={localMachines}
                value={machineId}
                onChange={setMachineId}
                getId={(m) => m.id}
                getLabel={(m) => (m.plate ? `${m.name} (${m.plate})` : m.name)}
                placeholder="Selecione uma máquina..."
                searchPlaceholder="Buscar máquina ou placa..."
                emptyMessage="Nenhuma máquina encontrada"
                onCreateNew={() => setMchDialogOpen(true)}
                createNewLabel="Cadastrar nova máquina"
              />
            </div>

            {/* Pickup location + delivery address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Local de retirada</Label>
                <SearchableSelect
                  items={localLocations}
                  value={pickupLocationId}
                  onChange={setPickupLocationId}
                  getId={(l) => l.id}
                  getLabel={(l) => l.name}
                  placeholder="Selecione um local..."
                  searchPlaceholder="Buscar local..."
                  emptyMessage="Nenhum local cadastrado"
                  onCreateNew={() => setLocDialogOpen(true)}
                  createNewLabel="Cadastrar novo local"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="delivery_addr">Endereço de entrega</Label>
                <Input
                  id="delivery_addr"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="onde será entregue"
                  className="uppercase placeholder:normal-case placeholder:lowercase"
                  autoCapitalize="characters"
                />
              </div>
            </div>

            {/* Service description + hourmeter (only for prestacao_servico) */}
            {type === "prestacao_servico" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="srv_desc">Descrição do serviço</Label>
                  <Textarea
                    id="srv_desc"
                    value={serviceDescription}
                    onChange={(e) => setServiceDescription(e.target.value)}
                    placeholder="ex: terraplanagem do terreno, 8 horas"
                    rows={2}
                    className="uppercase placeholder:normal-case placeholder:lowercase"
                  />
                </div>

                {/* Horímetro */}
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                  <div className="col-span-2">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
                      Horímetro da máquina
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hmt_start" className="text-xs">Inicial (h)</Label>
                    <Input
                      id="hmt_start"
                      value={hourmeterStart}
                      onChange={(e) => setHourmeterStart(e.target.value.replace(/[^\d,]/g, ""))}
                      placeholder="0,0"
                      inputMode="decimal"
                      autoComplete="off"
                      className="tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hmt_end" className="text-xs">Final (h)</Label>
                    <Input
                      id="hmt_end"
                      value={hourmeterEnd}
                      onChange={(e) => setHourmeterEnd(e.target.value.replace(/[^\d,]/g, ""))}
                      placeholder="0,0"
                      inputMode="decimal"
                      autoComplete="off"
                      className="tabular-nums"
                    />
                  </div>
                  {hourmeterStart && hourmeterEnd && (
                    <p className="col-span-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      Total trabalhado:{" "}
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {(
                          parseFloat(hourmeterEnd.replace(",", ".")) -
                          parseFloat(hourmeterStart.replace(",", "."))
                        ).toFixed(1).replace(".", ",")}h
                      </span>
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{type === "entrega_material" ? "Materiais" : "Itens cobrados"}</Label>
                <button
                  type="button"
                  onClick={addItem}
                  className="text-xs text-produmar-600 hover:text-produmar-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Adicionar item
                </button>
              </div>

              <div className="space-y-2">
                {items.map((it, idx) => {
                  const lineTotal = parseQty(it.quantity) * parseBRLToNumber(it.unit_price);
                  return (
                    <div
                      key={idx}
                      className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 bg-slate-50/40 dark:bg-slate-800/40"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          {type === "entrega_material" ? (
                            <SearchableSelect
                              items={localProducts}
                              value={it.product_id}
                              onChange={(id) => pickProduct(idx, id)}
                              getId={(p) => p.id}
                              getLabel={(p) => p.name}
                              renderItem={(p) => (
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                  <span className="truncate">{p.name}</span>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                                    {p.unit}
                                  </span>
                                </div>
                              )}
                              placeholder="Selecione produto..."
                              searchPlaceholder="Buscar produto..."
                              emptyMessage="Nenhum produto"
                              onCreateNew={() => { setPrdDialogIdx(idx); setPrdDialogOpen(true); }}
                              createNewLabel="Cadastrar produto"
                            />
                          ) : (
                            <Input
                              value={it.description}
                              onChange={(e) => setItem(idx, { description: e.target.value })}
                              placeholder="descrição do item / serviço"
                              className="uppercase placeholder:normal-case placeholder:lowercase"
                            />
                          )}
                        </div>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="p-1.5 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                            title="Remover item"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4 sm:col-span-3 space-y-1">
                          <Label className="text-[10px] text-slate-500 dark:text-slate-400">Quantidade</Label>
                          <Input
                            value={it.quantity}
                            onChange={(e) => setItem(idx, { quantity: formatQty(e.target.value) })}
                            placeholder="0"
                            inputMode="decimal"
                            autoComplete="off"
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-2 space-y-1">
                          <Label className="text-[10px] text-slate-500 dark:text-slate-400">Un.</Label>
                          <Input
                            value={it.unit}
                            onChange={(e) => setItem(idx, { unit: e.target.value })}
                            placeholder="m³"
                            autoComplete="off"
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="col-span-5 sm:col-span-4 space-y-1">
                          <Label className="text-[10px] text-slate-500 dark:text-slate-400">Valor unit. (R$)</Label>
                          <Input
                            value={it.unit_price}
                            onChange={(e) => setItem(idx, { unit_price: formatBRLInput(e.target.value) })}
                            placeholder="0,00"
                            inputMode="decimal"
                            autoComplete="off"
                            className="h-9 text-sm tabular-nums"
                          />
                        </div>
                        <div className="col-span-12 sm:col-span-3 space-y-1 sm:text-right">
                          <Label className="text-[10px] text-slate-500 dark:text-slate-400">Subtotal</Label>
                          <p className="h-9 flex items-center sm:justify-end text-sm font-semibold text-produmar-700 dark:text-produmar-400 tabular-nums">
                            {formatBRL(lineTotal)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Total da OS
                </span>
                <span
                  className={`text-lg font-bold tabular-nums ${
                    isClient
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {formatBRL(total)}
                </span>
              </div>
            </div>

            {/* Dates + status */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data do lançamento</Label>
                <div className="h-10 px-3 flex items-center text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 tabular-nums">
                  {order
                    ? new Date(order.issue_date).toLocaleDateString("pt-BR")
                    : new Date().toLocaleDateString("pt-BR")}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="delivery_date">Data de entrega *</Label>
                <Input
                  id="delivery_date"
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ServiceOrderStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="entregue">Entregue</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Recebido por (visível quando status = entregue) */}
            {status === "entregue" && (
              <div className="space-y-1.5">
                <Label htmlFor="received_by">Recebido por</Label>
                <Input
                  id="received_by"
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  placeholder="nome de quem recebeu"
                  className="uppercase placeholder:normal-case placeholder:lowercase"
                  autoComplete="off"
                />
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="observações opcionais..."
                rows={2}
                className="uppercase placeholder:normal-case placeholder:lowercase"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : order ? "Salvar alterações" : "Lançar OS"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <QuickCreateMachineDialog
        open={mchDialogOpen}
        onClose={() => setMchDialogOpen(false)}
        onCreated={handleMachineCreated}
      />
      <QuickCreateProductDialog
        open={prdDialogOpen}
        onClose={() => { setPrdDialogOpen(false); setPrdDialogIdx(null); }}
        onCreated={handleProductCreated}
      />
      <QuickCreateLocationDialog
        open={locDialogOpen}
        onClose={() => setLocDialogOpen(false)}
        onCreated={handleLocationCreated}
      />
    </>
  );
}
