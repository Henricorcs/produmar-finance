"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Fence,
  HardHat,
  MapPin,
  MapPinned,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  User,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate, formatQty, servicoConta } from "@/lib/utils";
import { deleteSupplyObra, getSupplyObraExtrato } from "@/app/(app)/almoxarifado/actions";
import { num } from "@/components/almoxarifado/supply-shared";
import type {
  SupplyFenceRunView,
  SupplyObraDespesa,
  SupplyObraExtrato,
  SupplyObraSector,
  SupplyObraServicoView,
  SupplyObraUsage,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  obra: SupplyObraUsage | null;
  /** Setores de TODAS as obras — o diálogo filtra os desta. */
  sectors?: SupplyObraSector[];
  /** Metros de cerca de TODAS as obras — o diálogo filtra os desta (063). */
  fenceRuns?: SupplyFenceRunView[];
  /** Serviços contratados de TODAS as obras — filtra os desta (069). */
  servicos?: SupplyObraServicoView[];
  onEdit: (obra: SupplyObraUsage) => void;
  /** Abre o cadastro de setores e serviços já nesta obra. */
  onManageSectors: (obra: SupplyObraUsage) => void;
  /**
   * Abre o lançamento de despesa desta obra — null lança uma nova, uma despesa
   * abre para correção. Quem cuida do diálogo é a lista: aqui ele fecharia por
   * cima deste e os dois se atropelariam.
   */
  onDespesa: (obra: SupplyObraUsage, despesa: SupplyObraDespesa | null) => void;
}

/** Os recortes de tempo do extrato — o que o dono pergunta no dia a dia. */
type Periodo = "tudo" | "mes" | "mes_passado" | "ano";

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "tudo", label: "Tudo" },
  { value: "mes", label: "Este mês" },
  { value: "mes_passado", label: "Mês passado" },
  { value: "ano", label: "Este ano" },
];

/** Prefixo "AAAA-MM" / "AAAA" de hoje — comparar texto evita fuso horário. */
function prefixoDoPeriodo(p: Periodo): string | null {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  if (p === "ano") return String(ano);
  if (p === "mes") return `${ano}-${String(mes + 1).padStart(2, "0")}`;
  if (p === "mes_passado") {
    const d = new Date(ano, mes - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

export function SupplyObraDetailDialog({
  open,
  onClose,
  obra,
  sectors = [],
  fenceRuns = [],
  servicos = [],
  onEdit,
  onManageSectors,
  onDespesa,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [extrato, setExtrato] = useState<SupplyObraExtrato[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("tudo");

  const obraId = obra?.id ?? null;

  // troca de obra (ou fechou): limpa o que estava na tela
  useEffect(() => {
    setExtrato([]);
    setErro(null);
    setPeriodo("tudo");
  }, [open, obraId]);

  // O gasto inteiro da obra — material, diárias e despesas — vem da view 067.
  // Recarrega toda vez que o diálogo reabre: é assim que a despesa recém-salva
  // aparece, já que lançar despesa fecha este diálogo e volta para ele.
  useEffect(() => {
    if (!open || !obraId) return;
    let cancelled = false;
    setLoading(true);
    getSupplyObraExtrato(obraId).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if ("error" in r) {
        setErro(r.error ?? "Não foi possível carregar o extrato");
        return;
      }
      setErro(null);
      setExtrato((r.extrato ?? []) as SupplyObraExtrato[]);
    });
    return () => {
      cancelled = true;
    };
  }, [open, obraId]);

  /** Os setores desta obra — é o que o técnico vê em "Setor aplicado". */
  const obraSectors = useMemo(
    () => sectors.filter((x) => x.obra_id === obra?.id),
    [sectors, obra?.id]
  );

  /**
   * A cerca desta obra: quanto andou e quanto custou, por setor. Numa obra de
   * cerca é este o número que interessa — o material é só o meio.
   */
  const cerca = useMemo(() => {
    const meus = fenceRuns.filter((r) => r.obra_id === obra?.id);
    const porSetor = new Map<string, { nome: string; metros: number; valor: number }>();
    for (const r of meus) {
      const key = r.sector_id ?? "sem";
      const cur = porSetor.get(key) ?? {
        nome: r.sector_name ?? "Sem setor",
        metros: 0,
        valor: 0,
      };
      cur.metros += num(r.meters);
      cur.valor += num(r.total_value);
      porSetor.set(key, cur);
    }
    return {
      metros: meus.reduce((s, r) => s + num(r.meters), 0),
      valor: meus.reduce((s, r) => s + num(r.total_value), 0),
      setores: [...porSetor.values()].sort((a, b) => b.metros - a.metros),
    };
  }, [fenceRuns, obra?.id]);

  /**
   * Os serviços contratados nesta obra, agrupados por setor. É a resposta de
   * "quanto já combinei de mão de obra em cada pedaço da obra" — e, dentro de
   * cada um, quem faz e por qual contratação.
   */
  const servicosDaObra = useMemo(() => {
    const meus = servicos.filter((s) => s.obra_id === obra?.id);
    const porSetor = new Map<
      string,
      { nome: string; valor: number; itens: SupplyObraServicoView[] }
    >();
    for (const s of meus) {
      const key = s.sector_id ?? "sem";
      const cur = porSetor.get(key) ?? {
        nome: s.sector_name ?? "Sem setor",
        valor: 0,
        itens: [],
      };
      cur.valor += num(s.total_value);
      cur.itens.push(s);
      porSetor.set(key, cur);
    }
    return {
      total: meus.reduce((s, v) => s + num(v.total_value), 0),
      setores: [...porSetor.values()].sort((a, b) => b.valor - a.valor),
    };
  }, [servicos, obra?.id]);

  /** O extrato do recorte escolhido — é sobre ele que tudo abaixo é somado. */
  const linhas = useMemo(() => {
    const prefixo = prefixoDoPeriodo(periodo);
    if (!prefixo) return extrato;
    return extrato.filter((l) => (l.entry_date ?? "").startsWith(prefixo));
  }, [extrato, periodo]);

  /** Quanto o período custou, separando as quatro origens. */
  const totalPeriodo = useMemo(() => {
    let material = 0;
    let maoDeObra = 0;
    let despesas = 0;
    let servicoValor = 0;
    for (const l of linhas) {
      if (l.kind === "diaria") maoDeObra += num(l.value);
      else if (l.kind === "despesa") despesas += num(l.value);
      else if (l.kind === "servico") servicoValor += num(l.value);
      else material += num(l.value);
    }
    return {
      material,
      maoDeObra,
      despesas,
      servicos: servicoValor,
      total: material + maoDeObra + despesas + servicoValor,
    };
  }, [linhas]);

  /**
   * O relatório da despesa avulsa: quanto foi por categoria. É onde se vê que
   * o combustível pesou mais que o material, por exemplo.
   */
  const porCategoria = useMemo(() => {
    const map = new Map<string, { nome: string; valor: number; qtd: number }>();
    for (const l of linhas) {
      if (l.kind !== "despesa") continue;
      const nome = (l.category ?? "").trim() || "Sem categoria";
      const cur = map.get(nome) ?? { nome, valor: 0, qtd: 0 };
      cur.valor += num(l.value);
      cur.qtd += 1;
      map.set(nome, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.valor - a.valor);
  }, [linhas]);

  /** Consumo somado por material — o que mais pesou na obra. */
  const porMaterial = useMemo(() => {
    const map = new Map<
      string,
      { nome: string; unit: string; qty: number; value: number }
    >();
    for (const l of linhas) {
      if (l.kind !== "material") continue;
      const cur = map.get(l.description) ?? {
        nome: l.description,
        unit: l.unit ?? "",
        qty: 0,
        value: 0,
      };
      cur.qty += num(l.quantity);
      cur.value += num(l.value);
      map.set(l.description, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value || b.qty - a.qty);
  }, [linhas]);

  /**
   * Quem mexeu na obra: quanto de material cada um pegou e quantos dias
   * trabalhou. É a resposta de "quem usou o material".
   */
  const porPessoa = useMemo(() => {
    const map = new Map<
      string,
      {
        nome: string;
        material: number;
        dias: number;
        maoDeObra: number;
        servicos: number;
        servicoValor: number;
      }
    >();
    for (const l of linhas) {
      // a despesa fica de fora: ali "quem" é o fornecedor, não quem trabalhou
      if (l.kind === "despesa") continue;
      const nome = (l.person ?? "").trim() || "Sem nome";
      const cur = map.get(nome) ?? {
        nome,
        material: 0,
        dias: 0,
        maoDeObra: 0,
        servicos: 0,
        servicoValor: 0,
      };
      if (l.kind === "diaria") {
        cur.dias += num(l.quantity);
        cur.maoDeObra += num(l.value);
      } else if (l.kind === "servico") {
        cur.servicos += 1;
        cur.servicoValor += num(l.value);
      } else {
        cur.material += num(l.value);
      }
      map.set(nome, cur);
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        b.material + b.maoDeObra + b.servicoValor -
        (a.material + a.maoDeObra + a.servicoValor)
    );
  }, [linhas]);

  if (!obra) return null;

  /** A linha do extrato virada despesa de novo, para abrir na edição. */
  function despesaDaLinha(l: SupplyObraExtrato): SupplyObraDespesa {
    return {
      id: l.id,
      obra_id: l.obra_id,
      expense_date: l.entry_date,
      category: l.category,
      description: l.description,
      amount: num(l.value),
      person: l.person,
      photo_path: l.photo_path,
      notes: l.notes,
      created_by: null,
      created_at: l.created_at,
    };
  }

  function abrirDespesa(l: SupplyObraExtrato | null) {
    onDespesa(obra!, l ? despesaDaLinha(l) : null);
  }

  function handleDelete() {
    const o = obra!;
    if (
      !confirm(
        `Excluir a obra "${o.name}"? As saídas e as diárias já lançadas NÃO são apagadas — elas ficam sem obra. As despesas avulsas e os serviços contratados desta obra são apagados junto.`
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteSupplyObra(o.id);
      if (r && "error" in r) {
        alert(r.error);
        return;
      }
      onClose();
    });
  }

  const custoTotal = num(obra.total_cost ?? obra.total_value);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100 pr-8">{obra.name}</DialogTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {obra.local_name && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 flex items-center gap-1">
                <MapPinned className="w-3 h-3" />
                {obra.local_name}
              </span>
            )}
            {obra.client && <p className="text-[11px] text-slate-400">{obra.client}</p>}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* O que a obra custou — as duas metades */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">
              Custo da obra
            </p>
            {/* números da view: não piscam zero enquanto o extrato carrega */}
            <p className="mt-1.5 text-3xl font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
              {formatBRL(custoTotal)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-left">
              <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 px-2 py-1.5">
                <p className="text-[10px] text-orange-700 dark:text-orange-400 uppercase tracking-wide">
                  Material
                </p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                  {formatBRL(num(obra.total_value))}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {num(obra.movements_count)}{" "}
                  {num(obra.movements_count) === 1 ? "saída" : "saídas"}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1.5">
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                  Diárias
                </p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                  {formatBRL(num(obra.labor_value))}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {num(obra.days_count)} {num(obra.days_count) === 1 ? "diária" : "diárias"}
                </p>
              </div>
              {/* Serviço combinado com o profissional — empreita ou metro (069) */}
              <div className="rounded-lg bg-teal-50 dark:bg-teal-900/20 px-2 py-1.5">
                <p className="text-[10px] text-teal-700 dark:text-teal-400 uppercase tracking-wide">
                  Serviços
                </p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                  {formatBRL(num(obra.service_value))}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {num(obra.services_count)}{" "}
                  {num(obra.services_count) === 1 ? "empreita/metro" : "empreitas/metros"}
                </p>
              </div>
              <div className="rounded-lg bg-violet-50 dark:bg-violet-900/20 px-2 py-1.5">
                <p className="text-[10px] text-violet-700 dark:text-violet-400 uppercase tracking-wide">
                  Despesas
                </p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                  {formatBRL(num(obra.expense_value))}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {num(obra.expenses_count)}{" "}
                  {num(obra.expenses_count) === 1 ? "lançamento" : "lançamentos"}
                </p>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onManageSectors(obra!)}
              >
                <HardHat className="w-4 h-4" />
                Serviços
              </Button>
              <Button type="button" className="flex-1" onClick={() => abrirDespesa(null)}>
                <Plus className="w-4 h-4" />
                Despesa
              </Button>
            </div>

            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              O material sai no Estoque e a diária em Colaboradores, as duas escolhendo
              esta obra. O serviço por empreita ou por metro é combinado no setor, e a
              despesa — compra direta, combustível, frete — é lançada aqui.
            </p>
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}

          {/* Recorte de tempo — vale para tudo que vem abaixo */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {PERIODOS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriodo(p.value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  periodo === p.value
                    ? "bg-produmar-600 border-produmar-600 text-white"
                    : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {periodo !== "tudo" && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 flex items-baseline justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {linhas.length === 1 ? "1 lançamento" : `${linhas.length} lançamentos`} no
                período
              </span>
              <span className="text-base font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                {formatBRL(totalPeriodo.total)}
              </span>
            </div>
          )}

          {/* Cerca: metro feito por setor (o técnico lança só o metro) */}
          {cerca.metros > 0 && periodo === "tudo" && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Fence className="w-3.5 h-3.5 text-lime-600" />
                Cerca feita
              </p>
              <div className="rounded-xl border border-lime-200 dark:border-lime-900/50 bg-lime-50/60 dark:bg-lime-950/20 px-3 py-2.5 flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                  {formatQty(cerca.metros)} m
                </span>
                <span className="text-sm font-semibold text-produmar-700 dark:text-produmar-400 tabular-nums">
                  {formatBRL(cerca.valor)}
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                {cerca.setores.map((s) => (
                  <div key={s.nome} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 truncate">
                      {s.nome}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums flex-shrink-0">
                      {formatQty(s.metros)} m
                    </span>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0 w-24 text-right">
                      {formatBRL(s.valor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Serviços combinados por setor: empreita e metro (migration 069) */}
          {servicosDaObra.total > 0 && periodo === "tudo" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <HardHat className="w-3.5 h-3.5 text-teal-600" />
                  Serviços contratados
                </p>
                <button
                  type="button"
                  onClick={() => onManageSectors(obra!)}
                  className="min-h-[36px] px-2 text-[11px] font-medium text-teal-600 dark:text-teal-400 hover:underline"
                >
                  + Serviço
                </button>
              </div>
              <div className="rounded-xl border border-teal-200 dark:border-teal-900/50 bg-teal-50/60 dark:bg-teal-950/20 px-3 py-2.5 flex items-baseline justify-between gap-2">
                <span className="text-xs text-teal-800 dark:text-teal-300">
                  A pagar aos profissionais
                </span>
                <span className="text-lg font-bold text-teal-700 dark:text-teal-300 tabular-nums">
                  {formatBRL(servicosDaObra.total)}
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                {servicosDaObra.setores.map((s) => (
                  <div key={s.nome} className="px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      <span className="flex-1 min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                        {s.nome}
                      </span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0">
                        {formatBRL(s.valor)}
                      </span>
                    </div>
                    {s.itens.map((sv) => (
                      <p
                        key={sv.id}
                        className="text-[11px] text-slate-400 dark:text-slate-500 pl-5 truncate tabular-nums"
                      >
                        {sv.service_type} · {servicoConta(sv).completo}
                        {sv.worker_name ? ` · ${sv.worker_name}` : ""}
                        {sv.acerto_id ? " · pago" : ""}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quem mexeu na obra */}
          {porPessoa.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                Quem trabalhou / pegou material
              </p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                {porPessoa.map((p) => (
                  <div key={p.nome} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {p.nome}
                      </p>
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        {[
                          p.dias > 0
                            ? `${formatQty(p.dias)} ${p.dias === 1 ? "dia" : "dias"}`
                            : null,
                          p.servicos > 0
                            ? `${p.servicos} ${p.servicos === 1 ? "serviço" : "serviços"}`
                            : null,
                          p.material > 0 ? `${formatBRL(p.material)} em material` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0">
                      {formatBRL(p.material + p.maoDeObra + p.servicoValor)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Consumo por material */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Consumo por material
            </p>
            {porMaterial.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                {loading ? "Carregando..." : "Nenhum material saiu para esta obra no período."}
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                {porMaterial.map((r) => (
                  <div key={r.nome} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {r.nome}
                      </p>
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        {formatQty(r.qty)} {r.unit}
                      </p>
                    </div>
                    {r.value > 0 && (
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0">
                        {formatBRL(r.value)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Relatório da despesa avulsa: em que o dinheiro foi embora */}
          {porCategoria.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-violet-500" />
                Despesas por categoria
              </p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                {porCategoria.map((c) => (
                  <div key={c.nome} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {c.nome}
                      </p>
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        {c.qtd} {c.qtd === 1 ? "lançamento" : "lançamentos"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0">
                      {formatBRL(c.valor)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* O extrato: cada gasto, na ordem em que aconteceu */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Extrato de gastos
              </p>
              <button
                type="button"
                onClick={() => abrirDespesa(null)}
                className="min-h-[36px] px-2 text-[11px] font-medium text-violet-600 dark:text-violet-400 hover:underline"
              >
                + Despesa
              </button>
            </div>
            {linhas.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                {loading ? "Carregando..." : "Nenhum gasto lançado no período."}
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 max-h-72 overflow-y-auto">
                {linhas.map((l) => {
                  const ehDespesa = l.kind === "despesa";
                  return (
                    <div
                      key={`${l.kind}-${l.id}`}
                      // só a despesa é editável aqui: o material é do Estoque e a
                      // diária é do módulo Colaboradores, cada um se acerta na sua
                      onClick={ehDespesa ? () => abrirDespesa(l) : undefined}
                      role={ehDespesa ? "button" : undefined}
                      tabIndex={ehDespesa ? 0 : undefined}
                      onKeyDown={
                        ehDespesa
                          ? (e) => {
                              if (e.key !== "Enter" && e.key !== " ") return;
                              e.preventDefault();
                              abrirDespesa(l);
                            }
                          : undefined
                      }
                      className={`flex items-center gap-2.5 px-3 py-2 ${
                        ehDespesa
                          ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                          : ""
                      }`}
                    >
                      <span
                        className={`w-1.5 h-9 rounded-full flex-shrink-0 ${
                          l.kind === "diaria"
                            ? "bg-emerald-400"
                            : l.kind === "servico"
                              ? "bg-teal-400"
                              : ehDespesa
                                ? "bg-violet-400"
                                : "bg-orange-400"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                          {l.kind === "material"
                            ? `${formatQty(num(l.quantity))} ${l.unit ?? ""} · ${l.description}`
                            : l.description}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                          {l.photo_path && <Paperclip className="w-3 h-3 flex-shrink-0" />}
                          <span className="truncate">
                            {formatDate(l.entry_date)}
                            {l.category ? ` · ${l.category}` : ""}
                            {l.person ? ` · ${l.person}` : ""}
                            {l.detail ? ` · ${l.detail}` : ""}
                          </span>
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0">
                        {formatBRL(num(l.value))}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Toque numa despesa para corrigir ou apagar. Material e diária se acertam
              nas telas de Estoque e Colaboradores; o serviço, em &quot;Serviços&quot;.
            </p>
          </div>

          {/* Setores: o subcadastro que o técnico escolhe na tela dele */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Setores desta obra
              </p>
              <button
                type="button"
                onClick={() => onManageSectors(obra!)}
                className="min-h-[36px] px-2 text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
              >
                {obraSectors.length > 0 ? "Setores e serviços" : "Cadastrar setores"}
              </button>
            </div>

            {obraSectors.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {obraSectors.map((s) => (
                  <span
                    key={s.id}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300"
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Nenhum setor ainda — é o que o técnico escolhe em &quot;Setor aplicado&quot;,
                e é onde se define o serviço feito e quanto se paga por ele.
              </p>
            )}
          </div>

          {obra.notes && (
            <p className="text-xs text-slate-500 dark:text-slate-400 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
              {obra.notes}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onEdit(obra)}>
              <Pencil className="w-4 h-4" />
              Editar
            </Button>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="h-10 px-4 rounded-md border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors"
            >
              <Trash2 className="w-4 h-4 inline" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Card da obra na lista — local, cliente e quanto ela já custou. */
export function SupplyObraCard({
  obra,
  onOpen,
}: {
  obra: SupplyObraUsage;
  onOpen: () => void;
}) {
  const custo = num(obra.total_cost ?? obra.total_value);

  /**
   * De onde vem o custo. Cada parte vai com o NOME junto: a bolinha colorida
   * sozinha não dizia nada — quem olhava via dois valores soltos e não sabia
   * qual era material e qual era diária.
   */
  const partes = [
    {
      nome: "Material",
      valor: num(obra.total_value),
      cor: "bg-orange-400",
      texto: "text-orange-600 dark:text-orange-400",
    },
    {
      nome: "Diárias",
      valor: num(obra.labor_value),
      cor: "bg-emerald-400",
      texto: "text-emerald-600 dark:text-emerald-400",
    },
    {
      nome: "Serviços",
      valor: num(obra.service_value),
      cor: "bg-teal-400",
      texto: "text-teal-600 dark:text-teal-400",
    },
    {
      nome: "Despesas",
      valor: num(obra.expense_value),
      cor: "bg-violet-400",
      texto: "text-violet-600 dark:text-violet-400",
    },
  ].filter((p) => p.valor > 0);

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 cursor-pointer transition-all hover:shadow-md hover:border-produmar-200 dark:hover:border-produmar-800 active:bg-slate-50 dark:active:bg-slate-800/60"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
          <HardHat className="w-4 h-4 text-orange-600 dark:text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
            {obra.name}
          </p>
          {obra.client && (
            <p className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
              <User className="w-3 h-3" />
              {obra.client}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
            {formatBRL(custo)}
          </p>
          {/* o número grande também precisa dizer do que é: antes vinha
              "0 materiais" embaixo de uma obra que só teve diária */}
          <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wide">
            custo da obra
          </p>
        </div>
      </div>

      {/* De onde vem o custo, com o nome de cada parte */}
      {partes.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px]">
          {partes.map((p) => (
            <span key={p.nome} className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.cor}`} />
              <span className="text-slate-500 dark:text-slate-400">{p.nome}</span>
              <span className={`font-medium tabular-nums ${p.texto}`}>
                {formatBRL(p.valor)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
