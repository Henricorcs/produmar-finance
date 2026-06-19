"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import {
  Plus, X, Truck, Wrench, User, Building2,
  Clock, Gauge, DollarSign, Fuel, Boxes,
  Route, CalendarDays, HardHat, AlertTriangle, Zap,
} from "lucide-react";
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
import { ServiceOrderComprovantes } from "@/components/operador/service-order-comprovantes";
import {
  createServiceOrder,
  updateServiceOrder,
  listServiceOrderAttachments,
  type ServiceOrderItemInput,
} from "@/app/(app)/operacoes/actions";
import { formatBRL, formatHourmeter, isFreightCategory, machineCategoryLabel, osStatusLabel } from "@/lib/utils";
import { PRODUCT_UNITS } from "@/lib/types";
import type {
  Machine,
  PickupLocation,
  Product,
  Profile,
  ProductStockBalance,
  ServiceBillingMode,
  ServiceFreightType,
  ServiceOrder,
  ServiceOrderAttachment,
  ServiceOrderItem,
  ServiceOrderStatus,
  ServiceOrderType,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  order?: (ServiceOrder & { service_order_items?: ServiceOrderItem[] }) | null;
  machines: Machine[];
  operators: Profile[];
  products: Product[];
  pickupLocations: PickupLocation[];
  stockBalances?: ProductStockBalance[];
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

function sanitizeDecimal(raw: string): string {
  // dígitos + uma única vírgula, máx 2 casas.
  // Converte ponto em vírgula (teclados de celular costumam enviar ".").
  const cleaned = raw.replace(/\./g, ",").replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1]?.length > 2) return parts[0] + "," + parts[1].slice(0, 2);
  return cleaned;
}

interface ItemDraft {
  product_id: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
}

function emptyItem(): ItemDraft {
  return { product_id: "", description: "", quantity: "1", unit: "carrada", unit_price: "" };
}

function todayStr(): string {
  // Data local do navegador (toISOString seria UTC e erra depois das 21h BRT).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// ── Component ────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function ServiceOrderDialog({
  open,
  onClose,
  order,
  machines,
  operators,
  products,
  pickupLocations,
  stockBalances = [],
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Common form state
  const [type, setType] = useState<ServiceOrderType>("entrega_material");
  const [freightType, setFreightType] = useState<ServiceFreightType>("cliente");
  const [status, setStatus] = useState<ServiceOrderStatus>("pendente");

  const [clientName, setClientName]         = useState("");
  const [clientDocument, setClientDocument] = useState("");
  const [clientPhone, setClientPhone]       = useState("");

  const [machineId, setMachineId]                   = useState("");
  const [assignedTo, setAssignedTo]                 = useState("");
  const [pickupLocationId, setPickupLocationId]     = useState("");
  const [deliveryAddress, setDeliveryAddress]       = useState("");
  const [serviceDescription, setServiceDescription] = useState("");

  const [deliveryDate, setDeliveryDate] = useState("");
  const [receivedBy, setReceivedBy]     = useState("");
  const [notes, setNotes]               = useState("");

  // prestacao_servico — horímetro
  const [hourmeterStart, setHourmeterStart] = useState("");
  const [hourmeterEnd, setHourmeterEnd]     = useState("");
  const [hourlyRate, setHourlyRate]         = useState(""); // BRL formatted

  // prestacao_servico — km ou sem máquina
  const [kmStart, setKmStart]                       = useState("");
  const [kmEnd, setKmEnd]                           = useState("");
  const [flatServiceAmount, setFlatServiceAmount]   = useState(""); // BRL formatted

  // prestacao_servico — custos internos (não somam no total)
  const [serviceCost, setServiceCost] = useState(""); // gasto no serviço
  const [fuelCost, setFuelCost]       = useState(""); // abastecimento

  // entrega_material
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);

  // entrega_material — cobrança do frete
  const [billingMode, setBillingMode]   = useState<ServiceBillingMode | "">("");
  const [freightValue, setFreightValue] = useState(""); // BRL formatted
  const [tripsCount, setTripsCount]     = useState(""); // nº de viagens (diária)

  // Local lists for optimistic insertion
  const [localMachines, setLocalMachines]     = useState<Machine[]>(machines);
  const [localProducts, setLocalProducts]     = useState<Product[]>(products);
  const [localLocations, setLocalLocations]   = useState<PickupLocation[]>(pickupLocations);

  // Comprovantes da OS (foto do recibo / PDF) — carregados ao editar.
  const [attachments, setAttachments] = useState<ServiceOrderAttachment[]>([]);

  // Quick-create dialogs
  const [mchDialogOpen, setMchDialogOpen] = useState(false);
  const [prdDialogOpen, setPrdDialogOpen] = useState(false);
  const [locDialogOpen, setLocDialogOpen] = useState(false);
  const [prdDialogIdx, setPrdDialogIdx]   = useState<number | null>(null);

  useEffect(() => setLocalMachines(machines),     [machines]);
  useEffect(() => setLocalProducts(products),     [products]);
  useEffect(() => setLocalLocations(pickupLocations), [pickupLocations]);

  // Comprovantes da OS — carrega ao abrir a edição (best-effort no servidor).
  useEffect(() => {
    if (!open || !order) {
      setAttachments([]);
      return;
    }
    let active = true;
    listServiceOrderAttachments(order.id).then((res) => {
      if (active) setAttachments((res.attachments as ServiceOrderAttachment[]) ?? []);
    });
    return () => {
      active = false;
    };
  }, [open, order]);

  // Saldo de estoque por produto (para avisar quando faltar material)
  const stockMap = useMemo(() => {
    const m = new Map<string, { quantity: number; unit: string }>();
    for (const b of stockBalances) {
      m.set(b.product_id, { quantity: Number(b.current_quantity), unit: b.unit });
    }
    return m;
  }, [stockBalances]);

  // Hydrate / reset
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
      setAssignedTo(order.assigned_to ?? "");
      setPickupLocationId(order.pickup_location_id ?? "");
      setDeliveryAddress(order.delivery_address ?? "");
      setServiceDescription(order.service_description ?? "");
      setDeliveryDate(order.delivery_date ?? "");
      setHourmeterStart(order.hourmeter_start?.toFixed(1).replace(".", ",") ?? "");
      setHourmeterEnd(order.hourmeter_end?.toFixed(1).replace(".", ",") ?? "");
      setKmStart(order.km_start?.toString().replace(".", ",") ?? "");
      setKmEnd(order.km_end?.toString().replace(".", ",") ?? "");
      setHourlyRate(order.hourly_rate != null ? formatBRLInput(order.hourly_rate) : "");
      setServiceCost(order.service_cost != null ? formatBRLInput(order.service_cost) : "");
      setFuelCost(order.fuel_cost != null ? formatBRLInput(order.fuel_cost) : "");
      setReceivedBy(order.received_by ?? "");
      setNotes(order.notes ?? "");
      setBillingMode(order.billing_mode ?? "");
      setFreightValue(order.freight_value != null ? formatBRLInput(order.freight_value) : "");
      setTripsCount(order.trips_count?.toString() ?? "");
      // A linha de frete (is_freight) é gerenciada pelos campos de cobrança —
      // só os materiais entram na lista de itens editáveis.
      const materialItems = (order.service_order_items ?? []).filter((it) => !it.is_freight);
      setItems(
        materialItems.length > 0
          ? materialItems.map((it) => ({
              product_id: it.product_id ?? "",
              description: it.description ?? "",
              quantity: formatQty(it.quantity),
              unit: it.unit ?? "carrada",
              unit_price: formatBRLInput(it.unit_price),
            }))
          : [emptyItem()]
      );
      // Para edição: serviço sem horímetro/taxa OU serviço rápido → usa o total
      // como valor flat.
      if (
        (order.type === "prestacao_servico" &&
          order.hourly_rate == null &&
          order.total_amount > 0) ||
        (order.type === "servico_rapido" && order.total_amount > 0)
      ) {
        setFlatServiceAmount(formatBRLInput(order.total_amount));
      } else {
        setFlatServiceAmount("");
      }
    } else {
      setType("entrega_material");
      setFreightType("cliente");
      setStatus("pendente");
      setClientName(""); setClientDocument(""); setClientPhone("");
      setMachineId(""); setAssignedTo(""); setPickupLocationId("");
      setDeliveryAddress(""); setServiceDescription("");
      setDeliveryDate(todayStr());
      setHourmeterStart(""); setHourmeterEnd("");
      setKmStart(""); setKmEnd("");
      setHourlyRate(""); setFlatServiceAmount("");
      setServiceCost(""); setFuelCost("");
      setReceivedBy(""); setNotes("");
      setBillingMode(""); setFreightValue(""); setTripsCount("");
      setItems([emptyItem()]);
    }
    setError(null);
  }, [open, order]);

  // ── Selected machine & pricing mode ──────────────────────────────────────
  const selectedMachine = useMemo(
    () => localMachines.find((m) => m.id === machineId) ?? null,
    [localMachines, machineId]
  );

  // Operador para quem a OS vai ser enviada (técnico).
  const selectedOperator = useMemo(
    () => operators.find((op) => op.id === assignedTo) ?? null,
    [operators, assignedTo]
  );

  // Máquinas disponíveis para escolher:
  //  • Frete → só caminhão/caçamba (regra de negócio).
  //  • Operador selecionado com categorias liberadas → só as dele.
  //  • A máquina já escolhida nunca some da lista (edição não a perde).
  const availableMachines = useMemo(() => {
    const allowed = selectedOperator?.allowed_categories ?? [];
    const restrictByOperator = allowed.length > 0;
    let list = localMachines.filter((m) => {
      if (type === "frete" && !isFreightCategory(m.category)) return false;
      if (restrictByOperator && !(m.category && allowed.includes(m.category))) return false;
      return true;
    });
    if (machineId && !list.some((m) => m.id === machineId)) {
      const cur = localMachines.find((m) => m.id === machineId);
      if (cur) list = [cur, ...list];
    }
    return list;
  }, [localMachines, type, selectedOperator, machineId]);

  // Avisos quando a máquina escolhida contraria as regras (não bloqueia a UI,
  // mas o servidor recusa frete fora de caminhão/caçamba).
  const machineNotFreight =
    type === "frete" && !!selectedMachine && !isFreightCategory(selectedMachine.category);
  const machineNotInOperator =
    !!selectedMachine &&
    !!selectedOperator &&
    (selectedOperator.allowed_categories?.length ?? 0) > 0 &&
    !(selectedMachine.category && selectedOperator.allowed_categories.includes(selectedMachine.category));

  const machineIsKm        = selectedMachine?.tracking_type === "km";
  const machineIsHourmeter = !!selectedMachine && selectedMachine.tracking_type !== "km";
  const useHourBasedPricing =
    type === "prestacao_servico" && machineIsHourmeter;
  // Serviço rápido: tarefa/errand interna, sem máquina/cobrança/material.
  const isQuick = type === "servico_rapido";

  // ── Computed values ──────────────────────────────────────────────────────
  const hoursWorked = useMemo(() => {
    const s = parseFloat(hourmeterStart.replace(",", "."));
    const e = parseFloat(hourmeterEnd.replace(",", "."));
    if (isNaN(s) || isNaN(e) || e <= s) return 0;
    return e - s;
  }, [hourmeterStart, hourmeterEnd]);

  const kmDelta = useMemo(() => {
    const s = parseFloat(kmStart.replace(",", "."));
    const e = parseFloat(kmEnd.replace(",", "."));
    if (isNaN(s) || isNaN(e) || e <= s) return 0;
    return e - s;
  }, [kmStart, kmEnd]);

  // Frete: diária soma direto (valor fixo); viagem/km só quando o fechamento
  // (nº de viagens / km rodado) já é conhecido — senão fica pendente.
  const freightPreview = useMemo(() => {
    if (type !== "frete" || !billingMode) return { value: 0, pending: false };
    const rate = parseBRLToNumber(freightValue);
    if (billingMode === "diaria") return { value: rate, pending: false };
    if (billingMode === "km") {
      return kmDelta > 0
        ? { value: kmDelta * rate, pending: false }
        : { value: 0, pending: true };
    }
    const trips = parseInt(tripsCount, 10);
    return !isNaN(trips) && trips >= 1
      ? { value: trips * rate, pending: false }
      : { value: 0, pending: true };
  }, [type, billingMode, freightValue, kmDelta, tripsCount]);

  const total = useMemo(() => {
    if (type === "prestacao_servico") {
      if (useHourBasedPricing) return hoursWorked * parseBRLToNumber(hourlyRate);
      return parseBRLToNumber(flatServiceAmount);
    }
    if (type === "servico_rapido") return parseBRLToNumber(flatServiceAmount);
    const materials = items.reduce(
      (s, it) => s + parseQty(it.quantity) * parseBRLToNumber(it.unit_price), 0
    );
    return materials + freightPreview.value;
  }, [type, useHourBasedPricing, hoursWorked, hourlyRate, flatServiceAmount, items, freightPreview]);

  // Lucro estimado = total - custos internos (apenas para visualização)
  const internalCosts = parseBRLToNumber(serviceCost) + parseBRLToNumber(fuelCost);
  const estimatedProfit = total - internalCosts;

  // ── Item helpers ─────────────────────────────────────────────────────────
  function setItem(idx: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function pickProduct(idx: number, productId: string) {
    const product = localProducts.find((p) => p.id === productId);
    setItem(idx, {
      product_id: productId,
      unit: product?.unit ?? "carrada",
      unit_price:
        product?.default_price != null && !items[idx].unit_price
          ? formatBRLInput(product.default_price)
          : items[idx].unit_price,
    });
  }

  function addItem() { setItems((prev) => [...prev, emptyItem()]); }
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
    if (prdDialogIdx !== null) pickProduct(prdDialogIdx, p.id);
    setPrdDialogIdx(null);
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Regra de negócio: frete só em caminhão/caçamba.
    if (machineNotFreight) {
      setError("Só caminhão e caçamba podem fazer frete. Troque o veículo ou o tipo da OS.");
      return;
    }

    let itemsPayload: ServiceOrderItemInput[];

    if (type === "prestacao_servico") {
      if (useHourBasedPricing) {
        const isInterno = freightType === "interno";
        const rate = parseBRLToNumber(hourlyRate);
        // Valor da hora é obrigatório para cliente; opcional no consumo interno.
        if (!isInterno && rate <= 0) {
          setError("Informe o valor da hora");
          return;
        }
        if (hoursWorked > 0) {
          // OS já com horímetro inicial E final (ex.: edição de OS já fechada)
          // → item calculado direto.
          itemsPayload = [{
            product_id: null,
            description: `PRESTAÇÃO DE SERVIÇO — ${hoursWorked.toFixed(2).replace(".", ",")}H × R$ ${hourlyRate}/H`,
            quantity: Number(hoursWorked.toFixed(2)),
            unit: "h",
            unit_price: rate,
          }];
        } else {
          // Horímetro final (e o inicial, quando não informado aqui) será
          // preenchido pelo técnico ao fechar a OS. O inicial e a taxa ficam nas
          // colunas próprias (hourmeter_start / hourly_rate); o item é só um
          // placeholder com total 0 até o fechamento recalcular horas × valor.
          itemsPayload = [{
            product_id: null,
            // Descrição genérica: a descrição real fica em service_description
            // (evita duplicar o texto na impressão/cartão).
            description: isInterno
              ? "CONSUMO INTERNO — AGUARDANDO FECHAMENTO"
              : "PRESTAÇÃO DE SERVIÇO — AGUARDANDO FECHAMENTO",
            quantity: 1,
            unit: "ud",
            unit_price: 0,
          }];
        }
      } else {
        const isInterno = freightType === "interno";
        const amount = parseBRLToNumber(flatServiceAmount);
        // Consumo interno não cobra — o valor é opcional. Cliente exige valor.
        if (!isInterno && amount <= 0) {
          setError(machineIsKm
            ? "Informe o valor do serviço / aluguel"
            : "Informe o valor do serviço");
          return;
        }
        itemsPayload = [{
          product_id: null,
          // Descrição genérica: a descrição real fica em service_description.
          description: isInterno && amount <= 0 ? "CONSUMO INTERNO" : "PRESTAÇÃO DE SERVIÇO",
          quantity: 1,
          unit: "ud",
          unit_price: amount,
        }];
      }
    } else if (type === "frete") {
      if (!billingMode) {
        setError("Escolha como o frete é cobrado: por viagem, por km ou por diária");
        return;
      }
      const rate = parseBRLToNumber(freightValue);
      if (isClient && rate <= 0) {
        setError(
          billingMode === "viagem"
            ? "Informe o valor da viagem"
            : billingMode === "km"
              ? "Informe o valor do km"
              : "Informe o valor da diária"
        );
        return;
      }

      // Materiais de OS antigas convertidas para frete ficam preservados
      // (não aparecem na tela, mas continuam somando no total).
      itemsPayload = items
        .filter((it) => it.product_id || it.description.trim())
        .map((it) => ({
          product_id: it.product_id || null,
          description: it.description,
          quantity: parseQty(it.quantity),
          unit: it.unit,
          unit_price: parseBRLToNumber(it.unit_price),
        }));

      // Linha de frete (is_freight): diária tem valor fechado e entra já no
      // cadastro; viagem/km entram quando o fechamento é conhecido (edição de
      // OS finalizada) — senão o técnico fecha e o sistema calcula.
      const rateLabel = rate.toFixed(2).replace(".", ",");
      if (billingMode === "diaria") {
        itemsPayload.push({
          product_id: null,
          description: "FRETE — DIÁRIA",
          quantity: 1,
          unit: "diária",
          unit_price: rate,
          is_freight: true,
        });
      } else if (billingMode === "km" && kmDelta > 0) {
        const km = Number(kmDelta.toFixed(1));
        const kmLabel = km.toFixed(1).replace(".", ",");
        itemsPayload.push({
          product_id: null,
          description: rate > 0
            ? `FRETE — ${kmLabel} KM × R$ ${rateLabel}/KM`
            : `FRETE — ${kmLabel} KM`,
          quantity: km,
          unit: "km",
          unit_price: rate,
          is_freight: true,
        });
      } else if (billingMode === "viagem") {
        const trips = parseInt(tripsCount, 10);
        if (!isNaN(trips) && trips >= 1) {
          const tripsLabel = `${trips} ${trips === 1 ? "VIAGEM" : "VIAGENS"}`;
          itemsPayload.push({
            product_id: null,
            description: rate > 0
              ? `FRETE — ${tripsLabel} × R$ ${rateLabel}/VIAGEM`
              : `FRETE — ${tripsLabel}`,
            quantity: trips,
            unit: "viagem",
            unit_price: rate,
            is_freight: true,
          });
        }
      }
    } else if (type === "servico_rapido") {
      // Serviço rápido: 1 item carrega a tarefa e o valor (0 se não informado).
      // O total = valor (custo interno). O comprovante é anexado pelo operador.
      const amount = parseBRLToNumber(flatServiceAmount);
      itemsPayload = [{
        product_id: null,
        description: serviceDescription.trim() || "SERVIÇO RÁPIDO",
        quantity: 1,
        unit: "ud",
        unit_price: amount,
      }];
    } else {
      // Entrega de material: só materiais (a cobrança de frete é o tipo "Frete").
      itemsPayload = items
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

      // OS antiga de entrega que tinha cobrança de frete (antes do tipo "frete"
      // existir): a UI de cobrança não aparece nesse tipo, então preservamos a
      // linha de frete já gravada para não zerar o total ao salvar.
      if (order?.billing_mode) {
        const existingFreight = (order.service_order_items ?? []).find((it) => it.is_freight);
        if (existingFreight) {
          itemsPayload.push({
            product_id: null,
            description: existingFreight.description,
            quantity: Number(existingFreight.quantity),
            unit: existingFreight.unit,
            unit_price: Number(existingFreight.unit_price),
            is_freight: true,
          });
        }
      }
    }

    const payload = {
      type,
      freight_type: freightType,
      status,
      client_name: freightType === "cliente" ? clientName : null,
      client_document: freightType === "cliente" ? clientDocument : null,
      client_phone: freightType === "cliente" ? clientPhone : null,
      machine_id: machineId || null,
      assigned_to: assignedTo || null,
      pickup_location_id: pickupLocationId || null,
      delivery_address: deliveryAddress,
      service_description: serviceDescription,
      // Frete não tem previsão de entrega — a data real entra no fechamento.
      // Na edição preserva a data já gravada (hidratada no estado).
      delivery_date:
        type === "frete" && !order ? null : deliveryDate || null,
      hourmeter_start:
        type === "prestacao_servico" && useHourBasedPricing && hourmeterStart.trim()
          ? parseFloat(hourmeterStart.replace(",", "."))
          : null,
      hourmeter_end:
        type === "prestacao_servico" && useHourBasedPricing && hourmeterEnd.trim()
          ? parseFloat(hourmeterEnd.replace(",", "."))
          : null,
      km_start: kmStart.trim() ? parseFloat(kmStart.replace(",", ".")) : null,
      km_end: kmEnd.trim() ? parseFloat(kmEnd.replace(",", ".")) : null,
      hourly_rate:
        type === "prestacao_servico" && useHourBasedPricing && hourlyRate.trim()
          ? parseBRLToNumber(hourlyRate)
          : null,
      service_cost:
        type === "prestacao_servico" && serviceCost.trim()
          ? parseBRLToNumber(serviceCost)
          : null,
      fuel_cost:
        type === "prestacao_servico" && fuelCost.trim()
          ? parseBRLToNumber(fuelCost)
          : null,
      received_by: receivedBy.trim() || null,
      // Keyed no billingMode (não no type): em "frete" vem da UI; em entrega
      // legada com cobrança vem hidratado da OS — preserva nos dois casos.
      billing_mode: billingMode || null,
      freight_value:
        billingMode && freightValue.trim() ? parseBRLToNumber(freightValue) : null,
      trips_count: (() => {
        if (billingMode !== "viagem") return null;
        const t = parseInt(tripsCount, 10);
        return !isNaN(t) && t >= 1 ? t : null;
      })(),
      // Preserva a hora de saída registrada pelo técnico (a edição do
      // escritório não mexe nesse campo).
      start_time: order?.start_time ?? null,
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
        <DialogContent
          className="max-w-2xl max-h-[92vh] overflow-y-auto"
          onInteractOutside={(e) => {
            // Não fecha a OS quando um sub-dialog (criar carro/local/produto)
            // está aberto — a interação com o sub-dialog dispara este evento.
            if (mchDialogOpen || prdDialogOpen || locDialogOpen) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">
              {order ? `Editar OS #${order.order_number}` : "Nova ordem de serviço"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Type toggle */}
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  { v: "entrega_material",  label: "Entrega de material",  icon: Truck },
                  { v: "frete",             label: "Frete",                icon: Route },
                  { v: "prestacao_servico", label: "Prestação de serviço", icon: Wrench },
                  { v: "servico_rapido",    label: "Serviço rápido",       icon: Zap },
                ] as const).map(({ v, label, icon: Icon }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setType(v);
                      // Serviço rápido é sempre uma tarefa interna.
                      if (v === "servico_rapido") setFreightType("interno");
                    }}
                    className={`flex flex-col items-center justify-center gap-1 py-2.5 text-sm rounded-lg border font-medium transition-colors ${
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

            {/* Cobrança do frete (só tipo frete) */}
            {type === "frete" && (
              <div className="space-y-1.5">
                <Label>Como é cobrado? *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { v: "viagem", label: "Por viagem", icon: Route },
                    { v: "km",     label: "Por km",     icon: Gauge },
                    { v: "diaria", label: "Por diária", icon: CalendarDays },
                  ] as const).map(({ v, label, icon: Icon }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setBillingMode(v)}
                      className={`flex flex-col items-center justify-center gap-1 py-2.5 text-sm rounded-lg border font-medium transition-colors ${
                        billingMode === v
                          ? "bg-produmar-50 border-produmar-300 text-produmar-700 dark:bg-produmar-900/30 dark:border-produmar-600 dark:text-produmar-400"
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>

                {billingMode && (
                  <div className="rounded-xl border border-produmar-100 dark:border-produmar-900/40 bg-produmar-50/40 dark:bg-produmar-950/20 p-3 space-y-2 !mt-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-produmar-700 dark:text-produmar-400 flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5" />
                        {billingMode === "viagem"
                          ? "Valor da viagem"
                          : billingMode === "km"
                            ? "Valor do km"
                            : "Valor da diária"}
                        {isClient ? " *" : ""}
                      </Label>
                      {!isClient && (
                        <span className="text-[10px] text-slate-400">opcional</span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
                      <Input
                        value={freightValue}
                        onChange={(e) => setFreightValue(formatBRLInput(e.target.value))}
                        placeholder="0,00"
                        inputMode="decimal"
                        autoComplete="off"
                        className="pl-9 tabular-nums"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {billingMode === "viagem"
                        ? "Total = nº de viagens × valor. O técnico marca cada viagem que fizer e o sistema soma no fechamento."
                        : billingMode === "km"
                          ? "Total = km rodado × valor do km. O técnico anota o km inicial e o final ao fechar."
                          : "Valor fechado da diária. O técnico anota o km e a hora na saída e o km no fim do dia."}
                    </p>

                    {/* Fechamento (edição/correção pelo escritório) — sempre
                        disponível ao editar um frete, para o escritório poder
                        finalizar quando o técnico não fechou pelo painel. */}
                    {order && (
                      <div className="pt-1 space-y-2">
                        <p className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500">
                          Fechamento (preenchido pelo técnico)
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-500">KM inicial</Label>
                            <Input
                              value={kmStart}
                              onChange={(e) => setKmStart(sanitizeDecimal(e.target.value))}
                              placeholder="0,0"
                              inputMode="decimal"
                              autoComplete="off"
                              className="h-9 text-sm tabular-nums"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-500">KM final</Label>
                            <Input
                              value={kmEnd}
                              onChange={(e) => setKmEnd(sanitizeDecimal(e.target.value))}
                              placeholder="0,0"
                              inputMode="decimal"
                              autoComplete="off"
                              className="h-9 text-sm tabular-nums"
                            />
                          </div>
                          {billingMode === "viagem" && (
                            <div className="space-y-1">
                              <Label className="text-[10px] text-slate-500">Nº de viagens</Label>
                              <Input
                                value={tripsCount}
                                onChange={(e) => setTripsCount(e.target.value.replace(/\D/g, ""))}
                                placeholder="0"
                                inputMode="numeric"
                                autoComplete="off"
                                className="h-9 text-sm tabular-nums"
                              />
                            </div>
                          )}
                        </div>
                        {kmDelta > 0 && (
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            Total rodado:{" "}
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {kmDelta.toFixed(1).replace(".", ",")} km
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Freight type — serviço rápido é sempre interno (sem este seletor) */}
            {!isQuick && (
            <div className="space-y-1.5">
              <Label>Para quem é? *</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { v: "cliente", label: "Cliente externo", icon: User },
                  {
                    v: "interno",
                    // "Consumo interno" só faz sentido em entrega; frete e serviço são só "Interno"
                    label: type === "entrega_material" ? "Consumo interno" : "Interno",
                    icon: Building2,
                  },
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
            )}

            {/* Client info */}
            {isClient && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="client_name">Nome do cliente *</Label>
                  <Input
                    id="client_name"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value.toUpperCase())}
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

            {/* Operador (enviar a OS para o técnico) */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <HardHat className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Enviar para
              </Label>
              <SearchableSelect
                items={operators}
                value={assignedTo}
                onChange={setAssignedTo}
                getId={(op) => op.id}
                getLabel={(op) => op.full_name || op.email}
                renderItem={(op) => (
                  <div className="min-w-0">
                    <span className="truncate block">{op.full_name || op.email}</span>
                    {/* Categorias só fazem sentido em OS com máquina — no serviço
                        rápido (sem veículo) viram ruído, então não mostramos. */}
                    {!isQuick && op.allowed_categories?.length > 0 && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate block">
                        {op.allowed_categories.map(machineCategoryLabel).join(", ")}
                      </span>
                    )}
                  </div>
                )}
                placeholder="Ninguém (aparece para todos)"
                searchPlaceholder="Buscar operador..."
                emptyMessage="Nenhum operador cadastrado"
              />
              {!isQuick && selectedOperator && (selectedOperator.allowed_categories?.length ?? 0) > 0 && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 pl-1">
                  {selectedOperator.full_name || selectedOperator.email} opera:{" "}
                  {selectedOperator.allowed_categories.map(machineCategoryLabel).join(", ")}
                </p>
              )}
            </div>

            {/* ── SERVIÇO RÁPIDO: o que fazer + valor (opcional) ──────── */}
            {isQuick && (
              <div className="space-y-3 p-3 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
                <div className="space-y-1.5">
                  <Label htmlFor="quick_task" className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    Serviço *
                  </Label>
                  <Textarea
                    id="quick_task"
                    value={serviceDescription}
                    onChange={(e) => setServiceDescription(e.target.value.toUpperCase())}
                    placeholder="ex: comprar 1l de diesel no posto e levar para a oficina"
                    rows={2}
                    className="uppercase placeholder:normal-case placeholder:lowercase"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-produmar-600 dark:text-produmar-400" />
                      Valor previsto
                    </Label>
                    <span className="text-[10px] text-slate-400">opcional</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
                    <Input
                      value={flatServiceAmount}
                      onChange={(e) => setFlatServiceAmount(formatBRLInput(e.target.value))}
                      placeholder="0,00"
                      inputMode="decimal"
                      autoComplete="off"
                      className="pl-9 tabular-nums"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    O funcionário pode confirmar/ajustar esse valor e anexar o comprovante ao finalizar.
                  </p>
                </div>
              </div>
            )}

            {/* Machine */}
            {!isQuick && (
            <div className="space-y-1.5">
              <Label>Máquina / veículo</Label>
              <SearchableSelect
                items={availableMachines}
                value={machineId}
                onChange={setMachineId}
                getId={(m) => m.id}
                getLabel={(m) => (m.plate ? `${m.name} (${m.plate})` : m.name)}
                renderItem={(m) => (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate">
                      {m.name}{m.plate ? ` (${m.plate})` : ""}
                      {m.category ? (
                        <span className="text-[10px] text-slate-400 ml-1.5">
                          {machineCategoryLabel(m.category)}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0 flex items-center gap-0.5">
                      {m.tracking_type === "km" ? (
                        <><Gauge className="w-3 h-3" />km</>
                      ) : (
                        <><Clock className="w-3 h-3" />h</>
                      )}
                    </span>
                  </div>
                )}
                placeholder={type === "frete" ? "Só caminhão / caçamba..." : "Selecione uma máquina..."}
                searchPlaceholder="Buscar máquina ou placa..."
                emptyMessage={
                  type === "frete"
                    ? "Nenhum caminhão / caçamba disponível"
                    : "Nenhuma máquina encontrada"
                }
                onCreateNew={() => setMchDialogOpen(true)}
                createNewLabel="Cadastrar nova máquina"
              />
              {selectedMachine && !machineNotFreight && !machineNotInOperator && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 pl-1 flex items-center gap-1">
                  {selectedMachine.category && (
                    <span className="text-slate-500 dark:text-slate-400">
                      {machineCategoryLabel(selectedMachine.category)} ·
                    </span>
                  )}
                  {selectedMachine.tracking_type === "km" ? (
                    <><Gauge className="w-3 h-3" />Medido por km (hodômetro)</>
                  ) : (
                    <><Clock className="w-3 h-3" />Medido por horímetro</>
                  )}
                </p>
              )}
              {machineNotFreight && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 pl-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  Frete é só para caminhão / caçamba. Troque o veículo ou o tipo da OS.
                </p>
              )}
              {machineNotInOperator && !machineNotFreight && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 pl-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  Este veículo não está nas categorias de{" "}
                  {selectedOperator?.full_name || selectedOperator?.email}.
                </p>
              )}
            </div>
            )}

            {/* Locations — serviço rápido não tem local de retirada/entrega */}
            {!isQuick && (type !== "prestacao_servico" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Local de retirada</Label>
                  <SearchableSelect
                    items={localLocations}
                    value={pickupLocationId}
                    onChange={setPickupLocationId}
                    getId={(l) => l.id}
                    getLabel={(l) => l.name}
                    placeholder="Onde foi retirado..."
                    searchPlaceholder="Buscar local..."
                    emptyMessage="Nenhum local cadastrado"
                    onCreateNew={() => setLocDialogOpen(true)}
                    createNewLabel="Cadastrar novo local"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="delivery_addr">Local de entrega</Label>
                  <Input
                    id="delivery_addr"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value.toUpperCase())}
                    placeholder="endereço de entrega"
                    className="uppercase placeholder:normal-case placeholder:lowercase"
                    autoCapitalize="characters"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="delivery_addr">Local de execução do serviço</Label>
                <Input
                  id="delivery_addr"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value.toUpperCase())}
                  placeholder="onde o serviço foi feito"
                  className="uppercase placeholder:normal-case placeholder:lowercase"
                  autoCapitalize="characters"
                />
              </div>
            ))}

            {/* Service description (prestacao_servico only) */}
            {type === "prestacao_servico" && (
              <div className="space-y-1.5">
                <Label htmlFor="srv_desc">Descrição do serviço</Label>
                <Textarea
                  id="srv_desc"
                  value={serviceDescription}
                  onChange={(e) => setServiceDescription(e.target.value.toUpperCase())}
                  placeholder="ex: terraplanagem do terreno"
                  rows={2}
                  className="uppercase placeholder:normal-case placeholder:lowercase"
                />
              </div>
            )}

            {/* ── ITENS (entrega_material) ──────────────────────────── */}
            {type === "entrega_material" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Materiais</Label>
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
                  {/* Sugestões rápidas de unidade (carrada é o padrão) */}
                  <datalist id="os-units">
                    {PRODUCT_UNITS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                  {items.map((it, idx) => {
                    const lineTotal = parseQty(it.quantity) * parseBRLToNumber(it.unit_price);
                    return (
                      <div
                        key={idx}
                        className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 bg-slate-50/40 dark:bg-slate-800/40"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
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
                              placeholder="carrada"
                              list="os-units"
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

                        {/* Atalhos de fração — só quando a unidade é carrada */}
                        {it.unit.toLowerCase().includes("carrada") && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {[
                              { label: "½ carrada", value: 0.5 },
                              { label: "1 carrada", value: 1 },
                              { label: "1½ carrada", value: 1.5 },
                              { label: "2 carradas", value: 2 },
                              { label: "3 carradas", value: 3 },
                            ].map((opt) => {
                              const active = parseQty(it.quantity) === opt.value;
                              return (
                                <button
                                  key={opt.label}
                                  type="button"
                                  onClick={() => setItem(idx, { quantity: formatQty(opt.value) })}
                                  className={`px-2.5 h-7 rounded-full text-[11px] font-medium border transition-colors ${
                                    active
                                      ? "bg-produmar-600 border-produmar-600 text-white"
                                      : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Saldo de estoque do material */}
                        {it.product_id && stockMap.has(it.product_id) && (() => {
                          const bal = stockMap.get(it.product_id)!;
                          const insufficient = parseQty(it.quantity) > bal.quantity;
                          return (
                            <p
                              className={`flex items-center gap-1 text-[11px] ${
                                insufficient
                                  ? "text-red-600 dark:text-red-400 font-medium"
                                  : "text-slate-500 dark:text-slate-400"
                              }`}
                            >
                              <Boxes className="w-3 h-3 flex-shrink-0" />
                              {insufficient
                                ? `Estoque insuficiente — disponível: ${fmtNum(bal.quantity)} ${bal.unit}`
                                : `Em estoque: ${fmtNum(bal.quantity)} ${bal.unit}`}
                            </p>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── PRECIFICAÇÃO DE SERVIÇO ──────────────────────────── */}
            {type === "prestacao_servico" && (
              <div className="space-y-3">

                {/* Horímetro OU km da máquina */}
                {selectedMachine && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      {selectedMachine.tracking_type === "km" ? (
                        <><Gauge className="w-3.5 h-3.5" />Hodômetro (km)</>
                      ) : (
                        <><Clock className="w-3.5 h-3.5" />Horímetro</>
                      )}
                    </p>
                    {selectedMachine.tracking_type === "km" ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-500">KM inicial</Label>
                          <Input
                            value={kmStart}
                            onChange={(e) => setKmStart(sanitizeDecimal(e.target.value))}
                            placeholder="0,0"
                            inputMode="decimal"
                            autoComplete="off"
                            className="h-9 text-sm tabular-nums"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-500">KM final</Label>
                          <Input
                            value={kmEnd}
                            onChange={(e) => setKmEnd(sanitizeDecimal(e.target.value))}
                            placeholder="0,0"
                            inputMode="decimal"
                            autoComplete="off"
                            className="h-9 text-sm tabular-nums"
                          />
                        </div>
                        {kmDelta > 0 && (
                          <p className="col-span-2 text-[11px] text-slate-500 tabular-nums">
                            Total rodado:{" "}
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {kmDelta.toFixed(1).replace(".", ",")} km
                            </span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-500">Horímetro inicial</Label>
                          <Input
                            value={hourmeterStart}
                            onChange={(e) => setHourmeterStart(formatHourmeter(e.target.value))}
                            placeholder="0,0"
                            inputMode="decimal"
                            autoComplete="off"
                            className="h-9 text-sm tabular-nums"
                          />
                        </div>
                        {order?.hourmeter_end != null ? (
                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-500">Horímetro final</Label>
                            <Input
                              value={hourmeterEnd}
                              onChange={(e) => setHourmeterEnd(formatHourmeter(e.target.value))}
                              placeholder="0,0"
                              inputMode="decimal"
                              autoComplete="off"
                              className="h-9 text-sm tabular-nums"
                            />
                          </div>
                        ) : (
                          <div className="flex items-end pb-1">
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight">
                              Horímetro final será preenchido pelo técnico ao fechar a OS.
                              Se deixar o inicial em branco, o técnico informa os dois.
                            </p>
                          </div>
                        )}
                        {hoursWorked > 0 && (
                          <p className="col-span-2 text-[11px] text-slate-500 tabular-nums">
                            Horas trabalhadas:{" "}
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {hoursWorked.toFixed(2).replace(".", ",")}h
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Valor da hora OU valor flat — só cliente externo. O serviço
                    interno não cobra horas; conta só os custos internos. */}
                {isClient && (
                <div className="rounded-xl border border-produmar-100 dark:border-produmar-900/40 bg-produmar-50/40 dark:bg-produmar-950/20 p-3 space-y-2">
                  {useHourBasedPricing ? (
                    <>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-produmar-700 dark:text-produmar-400 flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5" />
                          Valor por hora *
                        </Label>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
                        <Input
                          value={hourlyRate}
                          onChange={(e) => setHourlyRate(formatBRLInput(e.target.value))}
                          placeholder="0,00"
                          inputMode="decimal"
                          autoComplete="off"
                          className="pl-9 tabular-nums"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-produmar-700 dark:text-produmar-400 flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5" />
                          {machineIsKm ? "Valor do serviço / aluguel" : "Valor do serviço"} *
                        </Label>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
                        <Input
                          value={flatServiceAmount}
                          onChange={(e) => setFlatServiceAmount(formatBRLInput(e.target.value))}
                          placeholder="0,00"
                          inputMode="decimal"
                          autoComplete="off"
                          className="pl-9 tabular-nums"
                        />
                      </div>
                      {machineIsKm && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Veículo de km não usa cálculo por hora — informe o valor combinado (diária, aluguel ou fechado).
                        </p>
                      )}
                    </>
                  )}
                </div>
                )}

                {/* Custos internos */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Custos internos
                    <span className="text-[10px] text-slate-400 ml-1.5 font-normal">
                      (não somam no total cobrado)
                    </span>
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500 flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        Gasto no serviço
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                        <Input
                          value={serviceCost}
                          onChange={(e) => setServiceCost(formatBRLInput(e.target.value))}
                          placeholder="0,00"
                          inputMode="decimal"
                          autoComplete="off"
                          className="pl-8 h-9 text-sm tabular-nums"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Fuel className="w-3 h-3" />
                        Abastecimento
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                        <Input
                          value={fuelCost}
                          onChange={(e) => setFuelCost(formatBRLInput(e.target.value))}
                          placeholder="0,00"
                          inputMode="decimal"
                          autoComplete="off"
                          className="pl-8 h-9 text-sm tabular-nums"
                        />
                      </div>
                    </div>
                  </div>
                  {internalCosts > 0 && total > 0 && (
                    <p className="text-[11px] text-slate-500 tabular-nums pt-1">
                      Lucro estimado:{" "}
                      <span className={`font-semibold ${estimatedProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                        {formatBRL(estimatedProfit)}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Total */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Total{" "}
                {type === "prestacao_servico"
                  ? "do serviço"
                  : type === "frete"
                    ? "do frete"
                    : "da OS"}
              </span>
              {useHourBasedPricing && total === 0 ? (
                <span className="text-sm font-medium text-slate-400 dark:text-slate-500 italic">
                  A calcular ao fechar
                </span>
              ) : (
                <div className="text-right">
                  <span
                    className={`text-lg font-bold tabular-nums ${
                      isClient
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {formatBRL(total)}
                  </span>
                  {freightPreview.pending && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      {billingMode === "km"
                        ? "+ frete por km no fechamento"
                        : "+ frete das viagens no fechamento"}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Dates + status — frete não tem previsão de entrega */}
            <div className={`grid grid-cols-1 gap-3 ${type === "frete" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
              <div className="space-y-1.5">
                <Label className="text-xs">Data do lançamento</Label>
                <div className="h-10 px-3 flex items-center text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 tabular-nums">
                  {order
                    ? new Date(order.issue_date + "T12:00:00").toLocaleDateString("pt-BR")
                    : new Date().toLocaleDateString("pt-BR")}
                </div>
              </div>
              {type !== "frete" && (
                <div className="space-y-1.5">
                  <Label htmlFor="delivery_date">
                    {type === "prestacao_servico"
                      ? "Data do serviço"
                      : isQuick
                        ? "Data"
                        : "Previsão de entrega"} *
                  </Label>
                  <Input
                    id="delivery_date"
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ServiceOrderStatus)}>
                  <SelectTrigger>
                    <SelectValue>{osStatusLabel(status, type)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="entregue">
                      {osStatusLabel("entregue", type)}
                    </SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Recebido por */}
            {status === "entregue" && (
              <div className="space-y-1.5">
                <Label htmlFor="received_by">Recebido por</Label>
                <Input
                  id="received_by"
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value.toUpperCase())}
                  placeholder="nome de quem recebeu"
                  className="uppercase placeholder:normal-case placeholder:lowercase"
                  autoComplete="off"
                />
              </div>
            )}

            {/* Serviço / observação — entrega e frete (vira o título do
                cartão, ex.: "FRETE DE AREIA"). Na prestação de serviço a
                "Descrição do serviço" já cobre, e o serviço rápido usa o campo
                "O que precisa ser feito?", então não duplicamos aqui. */}
            {type !== "prestacao_servico" && !isQuick && (
              <div className="space-y-1.5">
                <Label htmlFor="notes">Serviço</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.toUpperCase())}
                  placeholder={type === "frete" ? "ex: FRETE DE AREIA PARA OBRA..." : "ex: FRETE, ENTREGA..."}
                  rows={2}
                  className="uppercase placeholder:normal-case placeholder:lowercase"
                />
              </div>
            )}

            {/* Comprovantes — só ao editar (a OS já existe). Útil sobretudo no
                serviço rápido: foto do recibo anexada pelo funcionário. */}
            {order && (
              <div className="pt-1">
                <ServiceOrderComprovantes
                  key={order.id}
                  orderId={order.id}
                  attachments={attachments}
                />
              </div>
            )}

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
