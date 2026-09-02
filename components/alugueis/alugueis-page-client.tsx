"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  FileSignature,
  FileText,
  HandCoins,
  Plus,
  Printer,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { MonthNav } from "@/components/ui/month-nav";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import { COBRANCA_META, cobrancasDoMes, type CobrancaDoMes } from "@/lib/alugueis";
import { enderecoCurto } from "@/lib/alugueis-contrato";
import { ImovelDialog } from "./imovel-dialog";
import { ContratoDialog } from "./contrato-dialog";
import { BaixaDialog } from "./baixa-dialog";
import { ModeloDialog } from "./modelo-dialog";
import { CodigoDoImovel } from "./alugueis-shared";
import {
  rentalKindLabel,
  type RentalContractTemplate,
  type RentalContractView,
  type RentalPayment,
  type RentalProperty,
} from "@/lib/types";

interface Props {
  properties: RentalProperty[];
  contracts: RentalContractView[];
  /** As baixas do mês da tela. */
  payments: RentalPayment[];
  template: RentalContractTemplate | null;
  month: string;
  migrationPendente?: boolean;
}

type Aba = "mes" | "imoveis";

const ABAS = [
  { value: "mes" as const, label: "Aluguéis do mês" },
  { value: "imoveis" as const, label: "Imóveis" },
];

/**
 * ALUGUÉIS — os imóveis, os contratos e o aluguel de cada mês.
 *
 * A primeira aba é a do dia a dia: quem vence quando, quem já pagou e quem está
 * atrasado, com a baixa a um toque. A segunda é o cadastro: o imóvel com o
 * código que o sistema deu e o contrato de cada um, que sai impresso preenchido.
 */
export function AlugueisPageClient({
  properties,
  contracts,
  payments,
  template,
  month,
  migrationPendente = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [aba, setAba] = useState<Aba>("mes");
  const [search, setSearch] = useState("");

  const [imovelDialogOpen, setImovelDialogOpen] = useState(false);
  const [editImovel, setEditImovel] = useState<RentalProperty | null>(null);
  const [contratoDialogOpen, setContratoDialogOpen] = useState(false);
  const [editContrato, setEditContrato] = useState<RentalContractView | null>(null);
  const [presetPropertyId, setPresetPropertyId] = useState<string | null>(null);
  const [baixa, setBaixa] = useState<CobrancaDoMes | null>(null);
  const [modeloOpen, setModeloOpen] = useState(false);

  const [year, monthNum] = month.split("-").map(Number);
  const mesLabel = new Date(year, monthNum - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  function navigateMonth(dir: -1 | 1) {
    const d = new Date(year, monthNum - 1 + dir, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    startTransition(() => router.push(`${pathname}?m=${m}`));
  }

  /** As cobranças do mês — nascem do contrato, não do banco. */
  const cobrancas = useMemo(
    () => cobrancasDoMes(contracts, payments, year, monthNum - 1),
    [contracts, payments, year, monthNum]
  );

  const filtradas = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return cobrancas;
    return cobrancas.filter(
      (c) =>
        c.contract.tenant_name.toUpperCase().includes(q) ||
        String(c.contract.property_code) === q ||
        (c.contract.property_name ?? "").toUpperCase().includes(q) ||
        (c.contract.property_street ?? "").toUpperCase().includes(q)
    );
  }, [cobrancas, search]);

  const totais = useMemo(() => {
    let aReceber = 0;
    let recebido = 0;
    let vencido = 0;
    for (const c of filtradas) {
      recebido += c.payment?.paid_at ? Number(c.payment.paid_amount) : 0;
      if (c.status !== "pago") aReceber += c.emAberto;
      if (c.status === "vencido") vencido += c.emAberto;
    }
    return { aReceber, recebido, vencido };
  }, [filtradas]);

  /** O contrato ativo de cada imóvel — é o que o card mostra. */
  const contratoDoImovel = useMemo(() => {
    const map = new Map<string, RentalContractView>();
    for (const c of contracts) {
      if (c.status !== "ativo") continue;
      const atual = map.get(c.property_id);
      if (!atual || c.start_date > atual.start_date) map.set(c.property_id, c);
    }
    return map;
  }, [contracts]);

  const imoveisVisiveis = useMemo(() => {
    const q = search.trim().toUpperCase();
    return properties.filter((p) => {
      if (!p.active && !contratoDoImovel.has(p.id)) return false;
      if (!q) return true;
      return (
        String(p.code) === q ||
        (p.name ?? "").toUpperCase().includes(q) ||
        (p.street ?? "").toUpperCase().includes(q) ||
        (p.district ?? "").toUpperCase().includes(q) ||
        (contratoDoImovel.get(p.id)?.tenant_name ?? "").toUpperCase().includes(q)
      );
    });
  }, [properties, search, contratoDoImovel]);

  function abrirImovel(p: RentalProperty | null) {
    setEditImovel(p);
    setImovelDialogOpen(true);
  }

  function abrirContrato(c: RentalContractView | null, propertyId?: string | null) {
    setEditContrato(c);
    setPresetPropertyId(c?.property_id ?? propertyId ?? null);
    setContratoDialogOpen(true);
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
            Aluguéis
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Os imóveis, os contratos e o aluguel de cada mês
          </p>
        </div>
        <Button variant="outline" className="flex-shrink-0" onClick={() => abrirImovel(null)}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Imóvel</span>
        </Button>
      </div>

      <FilterTabs tabs={ABAS} active={aba} onChange={setAba} />

      {migrationPendente && (
        <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Rode a migration 078 no Supabase para o módulo Aluguéis começar a guardar
            imóveis, contratos e pagamentos.
          </span>
        </p>
      )}

      {/* Busca — serve para as duas abas */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por inquilino, código ou rua..."
          className="w-full h-11 sm:h-10 pl-9 pr-3 rounded-lg border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-produmar-500"
        />
      </div>

      {aba === "mes" ? (
        <>
          <MonthNav
            label={mesLabel}
            onPrev={() => navigateMonth(-1)}
            onNext={() => navigateMonth(1)}
          />

          <div className="grid grid-cols-3 gap-2">
            <SummaryStatCard
              tone="emerald"
              icon={HandCoins}
              label="Recebido"
              amount={totais.recebido}
            />
            <SummaryStatCard
              tone="amber"
              icon={CalendarClock}
              label="A receber"
              amount={totais.aReceber}
            />
            <SummaryStatCard
              tone="red"
              icon={TriangleAlert}
              label="Vencido"
              amount={totais.vencido}
            />
          </div>

          {filtradas.length === 0 ? (
            <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              <CalendarClock className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 px-6">
                {contracts.length === 0
                  ? "Nenhum contrato cadastrado ainda. Cadastre o imóvel e depois o contrato — o aluguel de cada mês aparece aqui sozinho."
                  : "Nenhum aluguel neste mês."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {filtradas.map((c) => {
                const meta = COBRANCA_META[c.status];
                return (
                  <button
                    key={c.contract.id}
                    type="button"
                    onClick={() => setBaixa(c)}
                    className="w-full flex items-start gap-2.5 px-3 py-3 bg-white dark:bg-slate-900 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <CodigoDoImovel code={c.contract.property_code} />
                        <span
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                            meta.chip
                          )}
                        >
                          {meta.label.toUpperCase()}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {c.contract.tenant_name}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {c.contract.property_name || enderecoCurto(c.contract)} · vence{" "}
                        {formatDate(c.due_date)}
                        {c.payment?.paid_at ? ` · pago em ${formatDate(c.payment.paid_at)}` : ""}
                        {c.payment?.method ? ` · ${c.payment.method}` : ""}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          c.status === "pago"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : c.status === "vencido"
                              ? "text-red-700 dark:text-red-400"
                              : "text-slate-700 dark:text-slate-200"
                        )}
                      >
                        {formatBRL(c.amount)}
                      </p>
                      {c.status === "parcial" && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 tabular-nums">
                          falta {formatBRL(c.emAberto)}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            O aluguel de cada mês nasce do contrato — não precisa lançar cobrança. Toque
            na linha para dar baixa quando o inquilino pagar.
          </p>
        </>
      ) : (
        <>
          {imoveisVisiveis.length === 0 ? (
            <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              <Building2 className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {properties.length === 0
                  ? "Nenhum imóvel cadastrado ainda."
                  : "Nenhum imóvel com esse filtro."}
              </p>
              {properties.length === 0 && (
                <Button className="mt-3" onClick={() => abrirImovel(null)}>
                  <Plus className="w-4 h-4" />
                  Cadastrar o primeiro
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {imoveisVisiveis.map((p) => {
                const contrato = contratoDoImovel.get(p.id) ?? null;
                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <CodigoDoImovel code={p.code} />
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            {rentalKindLabel(p.kind)}
                          </span>
                          {!p.active && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              INATIVO
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {p.name || p.street || "Imóvel"}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                          {enderecoCurto({
                            property_street: p.street,
                            property_number: p.number,
                            property_district: p.district,
                          }) || "Sem endereço"}
                        </p>
                      </div>
                      {contrato && (
                        <span className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100 flex-shrink-0">
                          {formatBRL(Number(contrato.monthly_amount))}
                        </span>
                      )}
                    </div>

                    {contrato ? (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {contrato.tenant_name}
                        </span>{" "}
                        · vence dia {contrato.due_day}
                        {contrato.end_date ? ` · até ${formatDate(contrato.end_date)}` : ""}
                      </p>
                    ) : (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        Sem contrato ativo — o imóvel não gera aluguel no mês.
                      </p>
                    )}

                    <div className="flex items-center gap-3 pt-1 border-t border-slate-100 dark:border-slate-800 flex-wrap">
                      <button
                        type="button"
                        onClick={() => abrirImovel(p)}
                        className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400"
                      >
                        Editar imóvel
                      </button>
                      <button
                        type="button"
                        onClick={() => abrirContrato(contrato, p.id)}
                        className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1"
                      >
                        <FileSignature className="w-3 h-3" />
                        {contrato ? "Contrato" : "Novo contrato"}
                      </button>
                      {contrato && (
                        <a
                          href={`/imprimir/contrato/${contrato.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1"
                        >
                          <Printer className="w-3 h-3" />
                          Imprimir
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => setModeloOpen(true)}
            className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1.5 underline underline-offset-2"
          >
            <FileText className="w-3.5 h-3.5" />
            Modelo do contrato
          </button>
        </>
      )}

      <ImovelDialog
        open={imovelDialogOpen}
        onClose={() => setImovelDialogOpen(false)}
        imovel={editImovel}
      />
      <ContratoDialog
        open={contratoDialogOpen}
        onClose={() => setContratoDialogOpen(false)}
        contrato={editContrato}
        presetPropertyId={presetPropertyId}
        properties={properties}
      />
      <BaixaDialog cobranca={baixa} onClose={() => setBaixa(null)} mesLabel={mesLabel} />
      <ModeloDialog
        open={modeloOpen}
        onClose={() => setModeloOpen(false)}
        template={template}
      />
    </div>
  );
}
