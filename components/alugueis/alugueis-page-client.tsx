"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  FileSignature,
  FileText,
  HandCoins,
  Landmark,
  Plus,
  Printer,
  Receipt,
  Search,
  Sofa,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { MonthNav } from "@/components/ui/month-nav";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import { COBRANCA_META, cobrancasDoMes, type CobrancaDoMes } from "@/lib/alugueis";
import { enderecoCurto } from "@/lib/alugueis-contrato";
import { boletoEmAberto, boletoNoBanco, type BaixaDoMes } from "@/lib/alugueis-boletos";
import { actionError } from "@/lib/action-result";
import { conferirPagamentosNoBanco } from "@/app/(app)/alugueis/actions";
import {
  enderecoCurto as enderecoCurtoCompra,
  enderecoDoImovel as enderecoDoImovelCompra,
} from "@/lib/compra-venda-contrato";
import { ImovelDialog } from "./imovel-dialog";
import { ContratoDialog } from "./contrato-dialog";
import { BaixaDialog } from "./baixa-dialog";
import { BoletosDialog } from "./boletos-dialog";
import { ModeloDialog } from "./modelo-dialog";
import { CompraVendaDialog } from "./compra-venda-dialog";
import { ProcuracaoDialog } from "./procuracao-dialog";
import { AnexoMobiliaDialog } from "./anexo-mobilia-dialog";
import { itensValidos, totalDaMobilia } from "@/lib/anexo-mobilia";
import { CodigoDoImovel } from "./alugueis-shared";
import {
  rentalKindLabel,
  type PowerOfAttorney,
  type PropertyBuyer,
  type PropertySaleContract,
  type RentalBoleto,
  type RentalContractTemplate,
  type RentalContractView,
  type RentalFurnitureAnnex,
  type RentalPayment,
  type RentalProperty,
} from "@/lib/types";

interface Props {
  properties: RentalProperty[];
  contracts: RentalContractView[];
  /** As baixas do mês da tela. */
  payments: RentalPayment[];
  template: RentalContractTemplate | null;
  /** Contratos de compra e venda em que a PRODUMAR compra (migration 110). */
  compras?: PropertySaleContract[];
  compraVendaPendente?: boolean;
  /** Compradores cadastrados (migration 115). */
  compradores?: PropertyBuyer[];
  /** Procurações (migration 121) — a mais nova primeiro. */
  procuracoes?: PowerOfAttorney[];
  procuracaoPendente?: boolean;
  /** "tipo:id" dos documentos que já têm o PDF assinado com certificado (123). */
  assinados?: string[];
  /** Boletos do aluguel emitidos na Cora, sem os cancelados (129). */
  boletos?: RentalBoleto[];
  boletosPendente?: boolean;
  /** Anexos de mobília do contrato de aluguel (migration 151) — o mais novo primeiro. */
  anexos?: RentalFurnitureAnnex[];
  anexosPendente?: boolean;
  /** Todas as baixas dadas (de qualquer mês): o boleto pago direto sai quitado. */
  baixas?: BaixaDoMes[];
  month: string;
  migrationPendente?: boolean;
}

type Aba = "mes" | "imoveis" | "compra" | "procuracao" | "mobilia";

const ABAS = [
  { value: "mes" as const, label: "Aluguéis do mês" },
  { value: "imoveis" as const, label: "Imóveis" },
  { value: "compra" as const, label: "Compra e venda" },
  { value: "procuracao" as const, label: "Procurações" },
  { value: "mobilia" as const, label: "Anexo mobília" },
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
  compras = [],
  compraVendaPendente = false,
  compradores = [],
  procuracoes = [],
  procuracaoPendente = false,
  assinados = [],
  boletos = [],
  boletosPendente = false,
  anexos = [],
  anexosPendente = false,
  baixas = [],
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
  const [compraOpen, setCompraOpen] = useState(false);
  const [editCompra, setEditCompra] = useState<PropertySaleContract | null>(null);
  const [procuracaoOpen, setProcuracaoOpen] = useState(false);
  const [editProcuracao, setEditProcuracao] = useState<PowerOfAttorney | null>(null);
  /** Procuração nova a partir de quem foi escolhido na busca ("aluguel:<id>" / "venda:<id>"). */
  const [origemDaProcuracao, setOrigemDaProcuracao] = useState<string | null>(null);
  const [anexoOpen, setAnexoOpen] = useState(false);
  const [editAnexo, setEditAnexo] = useState<RentalFurnitureAnnex | null>(null);
  const [contratoDoAnexo, setContratoDoAnexo] = useState<string | null>(null);
  // os boletos de qual contrato estão abertos, e o recado de quando acabou de salvar
  const [boletosDe, setBoletosDe] = useState<string | null>(null);
  const [recadoBoletos, setRecadoBoletos] = useState<string | null>(null);

  /** O boleto de cada contrato + mês ("id|2026-11-01"). */
  const boletoDoMes = useMemo(() => {
    const map = new Map<string, RentalBoleto>();
    // o avulso (entrada, caução) não é boleto de mês
    for (const b of boletos) if (!b.avulso) map.set(`${b.contract_id}|${b.competencia}`, b);
    return map;
  }, [boletos]);

  function abrirBoletos(contractId: string, recado: string | null = null) {
    setRecadoBoletos(recado);
    setBoletosDe(contractId);
  }

  // ── pagamento no banco → baixa no sistema ──
  // O webhook da Cora já dá a baixa na hora. Ao abrir a tela, o sistema
  // confere também na Cora os boletos em aberto no banco, para pegar o
  // pagamento cujo aviso se perdeu.
  const temBoletoNoBanco = useMemo(
    () => boletos.some((b) => boletoNoBanco(b) && boletoEmAberto(b)),
    [boletos]
  );
  const [conferindo, setConferindo] = useState(false);
  const [recadoBanco, setRecadoBanco] = useState<string | null>(null);

  async function conferirNoBanco(agora: boolean) {
    setConferindo(true);
    if (agora) setRecadoBanco(null);
    const r = await conferirPagamentosNoBanco(agora);
    setConferindo(false);
    const falha = actionError(r);
    if (falha) {
      if (agora) setRecadoBanco(falha);
      return;
    }
    const baixados = r && "baixados" in r ? r.baixados ?? 0 : 0;
    if (baixados > 0) {
      setRecadoBanco(
        `${baixados} pagamento${baixados === 1 ? "" : "s"} recebido${baixados === 1 ? "" : "s"} no banco e baixado${baixados === 1 ? "" : "s"} agora.`
      );
      router.refresh();
    } else if (agora) {
      setRecadoBanco("Conferido no banco: nenhum pagamento novo.");
    }
  }

  useEffect(() => {
    if (temBoletoNoBanco) void conferirNoBanco(false);
    // só ao abrir a tela
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const q = semAcento(search.trim());
    if (!q) return cobrancas;
    return cobrancas.filter(
      (c) =>
        String(c.contract.property_code) === q ||
        semAcento(
          `${c.contract.tenant_name} ${c.contract.property_name ?? ""} ${c.contract.property_street ?? ""}`
        ).includes(q)
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
    const q = semAcento(search.trim());
    return properties.filter((p) => {
      if (!p.active && !contratoDoImovel.has(p.id)) return false;
      if (!q) return true;
      return (
        String(p.code) === q ||
        semAcento(
          `${p.name ?? ""} ${p.street ?? ""} ${p.district ?? ""} ${contratoDoImovel.get(p.id)?.tenant_name ?? ""}`
        ).includes(q)
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
                        {boletoDoMes.has(`${c.contract.id}|${c.competencia}`) && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-produmar-50 text-produmar-700 dark:bg-produmar-900/30 dark:text-produmar-300">
                            BOLETO
                          </span>
                        )}
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

          {(temBoletoNoBanco || recadoBanco) && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => conferirNoBanco(true)}
                disabled={conferindo}
                className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1 disabled:opacity-50"
              >
                <Landmark className="w-3.5 h-3.5" />
                {conferindo ? "Conferindo no banco..." : "Conferir pagamentos no banco"}
              </button>
              {recadoBanco && (
                <span className="text-[11px] text-slate-600 dark:text-slate-300">{recadoBanco}</span>
              )}
            </div>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            O aluguel de cada mês nasce do contrato — não precisa lançar cobrança. Toque
            na linha para dar baixa quando o inquilino pagar. Boleto gerado no banco, quando
            pago, é baixado sozinho.
          </p>
        </>
      ) : aba === "imoveis" ? (
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
                      {contrato && (
                        <button
                          type="button"
                          onClick={() => abrirBoletos(contrato.id)}
                          className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1"
                        >
                          <Receipt className="w-3 h-3" />
                          Boletos
                        </button>
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
      ) : aba === "mobilia" ? (
        <AnexosLista
          anexos={anexos}
          assinados={assinados}
          contratos={contracts}
          busca={search}
          pendente={anexosPendente}
          onAbrir={(a, contratoId = null) => {
            setEditAnexo(a);
            setContratoDoAnexo(a ? null : contratoId);
            setAnexoOpen(true);
          }}
        />
      ) : aba === "procuracao" ? (
        <ProcuracoesLista
          procuracoes={procuracoes}
          assinados={assinados}
          busca={search}
          pendente={procuracaoPendente}
          contratos={contracts}
          compras={compras}
          onAbrir={(p, origem = null) => {
            setEditProcuracao(p);
            setOrigemDaProcuracao(p ? null : origem);
            setProcuracaoOpen(true);
          }}
        />
      ) : (
        <ComprasLista
          compras={compras}
          assinados={assinados}
          compradores={compradores}
          busca={search}
          pendente={compraVendaPendente}
          onAbrir={(c) => {
            setEditCompra(c);
            setCompraOpen(true);
          }}
        />
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
        onSalvo={(id, recado) => abrirBoletos(id, recado)}
      />
      <BoletosDialog
        contrato={boletosDe ? contracts.find((c) => c.id === boletosDe) ?? null : null}
        boletos={boletos.filter((b) => b.contract_id === boletosDe)}
        baixas={baixas.filter((p) => p.contract_id === boletosDe)}
        mensagem={recadoBoletos}
        pendente={boletosPendente}
        onClose={() => setBoletosDe(null)}
      />
      <BaixaDialog
        cobranca={baixa}
        onClose={() => setBaixa(null)}
        mesLabel={mesLabel}
        boleto={baixa ? boletoDoMes.get(`${baixa.contract.id}|${baixa.competencia}`) ?? null : null}
      />
      <ModeloDialog
        open={modeloOpen}
        onClose={() => setModeloOpen(false)}
        template={template}
      />
      <CompraVendaDialog
        open={compraOpen}
        onClose={() => setCompraOpen(false)}
        contrato={editCompra}
        compradores={compradores}
        modeloAluguel={template?.body ?? null}
      />
      <ProcuracaoDialog
        open={procuracaoOpen}
        onClose={() => setProcuracaoOpen(false)}
        procuracao={editProcuracao}
        procuracoes={procuracoes}
        imoveis={properties}
        contratos={contracts}
        compras={compras}
        origemInicial={origemDaProcuracao}
      />
      <AnexoMobiliaDialog
        open={anexoOpen}
        onClose={() => setAnexoOpen(false)}
        anexo={editAnexo}
        anexos={anexos}
        contratos={contracts}
        modeloAluguel={template?.body ?? null}
        contratoInicial={contratoDoAnexo}
      />
    </div>
  );
}

/** Para a busca: maiúsculo e sem acento ("Ana" acha "ANÁ"). */
function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

/** Um nome já cadastrado que a busca achou. */
type ItemCadastrado = { chave: string; codigo?: number; nome: string; detalhe: string; acao?: string };

/**
 * NOMES JÁ CADASTRADOS, logo abaixo da busca: digitou uma letra, quem já está
 * no sistema aparece para escolher com um toque.
 */
function Cadastrados({
  titulo,
  vazio,
  acao,
  itens,
  onEscolher,
}: {
  titulo: string;
  vazio: string;
  /** O que o toque faz (ex.: "Fazer procuração"); cada item pode trocar o seu. */
  acao: string;
  itens: ItemCadastrado[];
  onEscolher: (chave: string) => void;
}) {
  return (
    <div className="rounded-xl border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      <p className="px-3 pt-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {titulo}
      </p>
      {itens.length === 0 ? (
        <p className="px-3 pb-3 text-sm text-slate-500 dark:text-slate-400">{vazio}</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {itens.map((it) => (
            <li key={it.chave}>
              <button
                type="button"
                onClick={() => onEscolher(it.chave)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-produmar-50 active:bg-produmar-50 dark:hover:bg-slate-800"
              >
                {it.codigo != null && <CodigoDoImovel code={it.codigo} />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {it.nome}
                  </span>
                  <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">{it.detalhe}</span>
                </span>
                <span className="flex-shrink-0 text-[11px] font-medium text-produmar-600 dark:text-produmar-400">
                  {it.acao ?? acao}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Aba ANEXO MOBÍLIA: o imóvel alugado mobiliado. Cada anexo sai do contrato de
 * aluguel (locatário e imóvel vêm dele) com a lista de móveis e eletrodomésticos.
 */
function AnexosLista({
  anexos,
  assinados,
  contratos,
  busca,
  pendente,
  onAbrir,
}: {
  anexos: RentalFurnitureAnnex[];
  /** "anexo_mobilia:<id>" dos que têm o PDF assinado guardado. */
  assinados: string[];
  contratos: RentalContractView[];
  busca: string;
  pendente: boolean;
  /** `contratoId`: anexo novo que já começa com esse contrato (veio da busca). */
  onAbrir: (a: RentalFurnitureAnnex | null, contratoId?: string | null) => void;
}) {
  const contratoDe = (a: RentalFurnitureAnnex) => contratos.find((c) => c.id === a.contract_id) ?? null;
  const q = semAcento(busca.trim());
  const visiveis = q
    ? anexos.filter((a) => {
        const c = contratoDe(a);
        return semAcento(
          `${c?.tenant_name ?? ""} ${c?.property_code ?? ""} ${c?.property_street ?? ""} ${a.property_label ?? ""}`
        ).includes(q);
      })
    : anexos;

  /** O anexo mais novo de cada contrato: o inquilino achado abre o que já tem. */
  const anexoDoContrato = new Map<string, RentalFurnitureAnnex>();
  for (const a of anexos) {
    const atual = anexoDoContrato.get(a.contract_id);
    if (!atual || (a.created_at ?? "") > (atual.created_at ?? "")) anexoDoContrato.set(a.contract_id, a);
  }

  /**
   * Digitou na busca: os inquilinos já cadastrados (pelo nome, nº ou rua do
   * contrato de aluguel) aparecem para escolher com um toque — os ativos primeiro.
   */
  const achados = q
    ? contratos
        .filter(
          (c) =>
            semAcento(`${c.tenant_name ?? ""} ${c.property_name ?? ""} ${c.property_street ?? ""}`).includes(q) ||
            String(c.property_code) === q
        )
        .sort((a, b) =>
          a.status === b.status
            ? (a.tenant_name ?? "").localeCompare(b.tenant_name ?? "", "pt-BR")
            : a.status === "ativo"
              ? -1
              : 1
        )
        .slice(0, 12)
    : [];

  return (
    <>
      {pendente && (
        <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Rode a migration 151 no Supabase para guardar os anexos de mobília.</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => onAbrir(null)}>
          <Plus className="w-4 h-4" />
          Novo anexo de mobília
        </Button>
      </div>

      {q && (
        <div className="rounded-xl border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <p className="px-3 pt-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Inquilinos cadastrados
          </p>
          {achados.length === 0 ? (
            <p className="px-3 pb-3 text-sm text-slate-500 dark:text-slate-400">
              Nenhum contrato de aluguel com esse nome.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {achados.map((c) => {
                const jaTem = anexoDoContrato.get(c.id) ?? null;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onAbrir(jaTem, c.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-produmar-50 active:bg-produmar-50 dark:hover:bg-slate-800"
                    >
                      <CodigoDoImovel code={c.property_code} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {c.tenant_name}
                        </span>
                        <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">
                          {enderecoCurto(c) || c.property_name || "Sem endereço"}
                          {c.status !== "ativo" ? " · contrato encerrado" : ""}
                        </span>
                      </span>
                      <span className="flex-shrink-0 text-[11px] font-medium text-produmar-600 dark:text-produmar-400">
                        {jaTem ? "Abrir anexo" : "Fazer anexo"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {visiveis.length === 0 ? (
        !q && (
          <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
            <Sofa className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 px-6">
              Nenhum anexo ainda. Para casa ou kitnet mobiliada: escolha o contrato de aluguel e confira a lista de
              móveis e eletrodomésticos.
            </p>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visiveis.map((a) => {
            const c = contratoDe(a);
            const itens = itensValidos(a.items);
            const total = totalDaMobilia(itens);
            return (
              <div
                key={a.id}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {c && <CodigoDoImovel code={c.property_code} />}
                      {a.property_label && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {a.property_label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {c?.tenant_name ?? "Contrato apagado"}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                      {c ? enderecoCurto(c) || c.property_name || "Sem endereço" : "—"}
                    </p>
                  </div>
                  {total > 0 && (
                    <span className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100 flex-shrink-0">
                      {formatBRL(total)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {itens.length} {itens.length === 1 ? "item" : "itens"}
                  {a.signed_at ? ` · assinatura em ${formatDate(a.signed_at)}` : ""}
                  <SeloAssinado ok={assinados.includes(`anexo_mobilia:${a.id}`)} />
                </p>
                <div className="flex items-center gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => onAbrir(a)}
                    className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1"
                  >
                    <FileSignature className="w-3 h-3" />
                    Editar
                  </button>
                  {c && (
                    <a
                      href={`/imprimir/anexo-mobilia/${a.id}`}
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
    </>
  );
}

/**
 * Aba PROCURAÇÕES: a troca de titularidade da conta de energia e afins. Cada
 * uma sai impressa ou em PDF; a "em branco" sai só com as linhas.
 */
function ProcuracoesLista({
  procuracoes,
  assinados,
  contratos,
  compras,
  busca,
  pendente,
  onAbrir,
}: {
  procuracoes: PowerOfAttorney[];
  assinados: string[];
  contratos: RentalContractView[];
  compras: PropertySaleContract[];
  busca: string;
  pendente: boolean;
  /** `origem`: procuração nova que já começa com esse outorgante (veio da busca). */
  onAbrir: (p: PowerOfAttorney | null, origem?: string | null) => void;
}) {
  const q = semAcento(busca.trim());
  const visiveis = q
    ? procuracoes.filter((p) =>
        semAcento(
          `${p.grantor_name ?? ""} ${p.attorney_name ?? ""} ${p.account_number ?? ""} ${p.grantor_street ?? ""}`
        ).includes(q)
      )
    : procuracoes;

  /** Quantas procurações cada outorgante já tem (pelo nome). */
  const jaTem = (nome: string | null | undefined) =>
    procuracoes.filter((p) => semAcento(p.grantor_name ?? "") === semAcento(nome ?? "")).length;

  /**
   * Digitou na busca: os nomes já cadastrados — inquilinos dos aluguéis e
   * vendedores da compra e venda — aparecem para escolher com um toque; a
   * procuração nova já sai com o outorgante preenchido.
   */
  const achados: ItemCadastrado[] = q
    ? [
        ...contratos
          .filter(
            (c) =>
              semAcento(`${c.tenant_name ?? ""} ${c.property_name ?? ""} ${c.property_street ?? ""}`).includes(q) ||
              String(c.property_code) === q
          )
          .sort((a, b) =>
            a.status === b.status
              ? (a.tenant_name ?? "").localeCompare(b.tenant_name ?? "", "pt-BR")
              : a.status === "ativo"
                ? -1
                : 1
          )
          .map((c) => ({
            chave: `aluguel:${c.id}`,
            codigo: c.property_code,
            nome: c.tenant_name,
            detalhe: [
              "Inquilino",
              enderecoCurto(c) || c.property_name,
              c.status !== "ativo" ? "contrato encerrado" : null,
              jaTem(c.tenant_name) ? `já tem ${jaTem(c.tenant_name)} procuração(ões)` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          })),
        ...compras
          .filter((c) => c.seller_name && semAcento(`${c.seller_name} ${enderecoCompra(c)}`).includes(q))
          .map((c) => ({
            chave: `venda:${c.id}`,
            nome: c.seller_name!,
            detalhe: [
              "Vendedor",
              enderecoCompra(c),
              jaTem(c.seller_name) ? `já tem ${jaTem(c.seller_name)} procuração(ões)` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          })),
      ].slice(0, 12)
    : [];

  return (
    <>
      {pendente && (
        <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Rode a migration 121 no Supabase para guardar as procurações. A procuração em
            branco já pode ser impressa.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => onAbrir(null)}>
          <Plus className="w-4 h-4" />
          Nova procuração
        </Button>
        <a
          href="/imprimir/procuracao/em-branco"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-produmar-200 text-sm font-medium text-produmar-700 dark:border-slate-700 dark:text-produmar-400"
        >
          <Printer className="w-4 h-4" />
          Imprimir em branco
        </a>
      </div>

      {q && (
        <Cadastrados
          titulo="Nomes cadastrados"
          vazio="Nenhum inquilino ou vendedor com esse nome."
          acao="Fazer procuração"
          itens={achados}
          onEscolher={(chave) => onAbrir(null, chave)}
        />
      )}

      {visiveis.length === 0 ? (
        !q && (
          <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
            <FileSignature className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 px-6">
              Nenhuma procuração ainda. Use para trocar a titularidade da conta de energia na EQUATORIAL.
            </p>
          </div>
        )
      ) : (
        <>
        {q && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Procurações já feitas
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visiveis.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
                  OUTORGANTE
                </p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {p.grantor_name || "A preencher"}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                  {[p.company, p.account_number ? `conta contrato ${p.account_number}` : null]
                    .filter(Boolean)
                    .join(" · ") || "Sem conta contrato"}
                </p>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Procurador:{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {p.attorney_name || "—"}
                </span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {p.signed_at ? `Assinatura em ${formatDate(p.signed_at)}` : "Sem data de assinatura"}
                <SeloAssinado ok={assinados.includes(`procuracao:${p.id}`)} />
              </p>
              <div className="flex items-center gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onAbrir(p)}
                  className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1"
                >
                  <FileSignature className="w-3 h-3" />
                  Editar
                </button>
                <a
                  href={`/imprimir/procuracao/${p.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1"
                >
                  <Printer className="w-3 h-3" />
                  Imprimir
                </a>
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </>
  );
}

/**
 * Aba COMPRA E VENDA: os contratos em que a PRODUMAR compra um imóvel. Cada
 * um sai impresso pronto; o "em branco" sai só com as linhas, para preencher
 * à caneta na hora.
 */
function ComprasLista({
  compras,
  assinados,
  compradores,
  busca,
  pendente,
  onAbrir,
}: {
  compras: PropertySaleContract[];
  assinados: string[];
  compradores: PropertyBuyer[];
  busca: string;
  pendente: boolean;
  onAbrir: (c: PropertySaleContract | null) => void;
}) {
  const q = semAcento(busca.trim());
  const visiveis = q
    ? compras.filter((c) =>
        semAcento(`${c.seller_name ?? ""} ${enderecoCompra(c)} ${c.property_registration ?? ""}`).includes(q)
      )
    : compras;

  return (
    <>
      {pendente && (
        <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Rode a migration 110 no Supabase para guardar os contratos de compra e venda. O
            contrato em branco já pode ser impresso.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => onAbrir(null)}>
          <Plus className="w-4 h-4" />
          Novo contrato de compra e venda
        </Button>
        <a
          href="/imprimir/compra-venda/em-branco"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-produmar-200 text-sm font-medium text-produmar-700 dark:border-slate-700 dark:text-produmar-400"
        >
          <Printer className="w-4 h-4" />
          Imprimir em branco
        </a>
      </div>

      {visiveis.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
          <Landmark className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 px-6">
            {compras.length === 0
              ? "Nenhum contrato de compra e venda ainda. A PRODUMAR entra sempre como compradora — preencha o vendedor e o imóvel."
              : "Nenhum contrato com esse filtro."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visiveis.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
                    VENDEDOR
                  </p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {c.seller_name || "A preencher"}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                    {[c.property_kind, enderecoCompra(c)].filter(Boolean).join(" · ") ||
                      "Imóvel sem endereço"}
                  </p>
                </div>
                {Number(c.price) > 0 && (
                  <span className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100 flex-shrink-0">
                    {formatBRL(Number(c.price))}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Comprador:{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {c.buyer_id
                    ? compradores.find((b) => b.id === c.buyer_id)?.name ?? "—"
                    : "PRODUMAR SERVIÇOS LTDA"}
                </span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {c.signed_at ? `Assinatura em ${formatDate(c.signed_at)}` : "Sem data de assinatura"}
                <SeloAssinado ok={assinados.includes(`compra_venda:${c.id}`)} />
                {c.property_registration ? ` · matrícula ${c.property_registration}` : ""}
              </p>
              <div className="flex items-center gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onAbrir(c)}
                  className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1"
                >
                  <FileSignature className="w-3 h-3" />
                  Editar
                </button>
                <a
                  href={`/imprimir/compra-venda/${c.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1"
                >
                  <Printer className="w-3 h-3" />
                  Imprimir
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Contrato particular com testemunhas: vale entre as partes e permite cobrar na
        Justiça. A propriedade só passa para a PRODUMAR com a escritura pública e o
        registro no cartório de imóveis.
      </p>
    </>
  );
}

/** "✓ Assinado" no cartão: o PDF assinado com certificado já está guardado (123). */
function SeloAssinado({ ok }: { ok: boolean }) {
  if (!ok) return null;
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
      ✓ Assinado
    </span>
  );
}

/** Endereço do imóvel comprado, curto, para a lista e para a busca. */
function enderecoCompra(c: PropertySaleContract): string {
  return enderecoCurtoCompra(enderecoDoImovelCompra(c), c.property_address);
}
