"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { HardHat, Trash2 } from "lucide-react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatQtyInput, num, parseQty } from "@/components/almoxarifado/supply-shared";
import {
  createSupplyObraServico,
  deleteSupplyObraServico,
  updateSupplyObraServico,
} from "@/app/(app)/almoxarifado/actions";
import {
  formatBRL,
  formatBRLInput,
  localDateISO,
  parseMoney,
  servicoConta,
  upperKeepingCaret,
} from "@/lib/utils";
import {
  PAYMENT_MODE_LABEL,
  SERVICOS_SUGERIDOS,
  UNIDADES_SERVICO,
  WORKER_TYPE_LABEL,
  type ContractMode,
  type Diarista,
  type SupplyObraSector,
  type SupplyObraServicoView,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  obraId: string;
  obraNome: string;
  /** Setores da obra — o serviço nasce dentro de um deles. */
  sectors: SupplyObraSector[];
  /** Setor já escolhido (o serviço foi aberto de dentro dele). */
  presetSectorId?: string | null;
  /** Quem pode receber pelo serviço — o cadastro de Colaboradores. */
  colaboradores: Diarista[];
  /** Serviço em edição — null lança um novo. */
  servico: SupplyObraServicoView | null;
}

/**
 * O SERVIÇO DO SETOR: o que foi feito ali e quanto se paga a quem fez.
 *
 * São duas formas de contratar o profissional, e é o modo escolhido que decide
 * de onde sai o valor:
 *
 *   • EMPREITA  → um preço fechado pelo serviço inteiro;
 *   • POR METRO → o valor do metro × a metragem feita.
 *
 * O valor que sai daí entra no custo da obra E na conta do colaborador — é ele
 * que aparece no "valor a receber" da ficha e é quitado no acerto.
 */
export function ServicoDialog({
  open,
  onClose,
  obraId,
  obraNome,
  sectors,
  presetSectorId,
  colaboradores,
  servico,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [sectorId, setSectorId] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [diaristaId, setDiaristaId] = useState("");
  const [mode, setMode] = useState<ContractMode>("empreita");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("M");
  const [date, setDate] = useState(localDateISO());
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setSectorId(servico?.sector_id ?? presetSectorId ?? "");
    setServiceType(servico?.service_type ?? "");
    setDiaristaId(servico?.diarista_id ?? "");
    setMode(servico?.contract_mode ?? "empreita");
    setAmount(servico ? formatBRLInput(num(servico.contract_amount)) : "");
    setRate(servico ? formatBRLInput(num(servico.rate_per_unit)) : "");
    setQuantity(
      servico && num(servico.quantity) > 0
        ? formatQtyInput(String(num(servico.quantity)).replace(".", ","))
        : ""
    );
    setUnit(servico?.unit ?? "M");
    setDate(servico?.service_date ?? localDateISO());
    setDescription(servico?.description ?? "");
    setNotes(servico?.notes ?? "");
    setError(null);
  }, [open, servico, presetSectorId]);

  /** Só os colaboradores ativos entram na lista — arquivado não recebe serviço. */
  const profissionais = useMemo(
    () =>
      colaboradores
        .filter((c) => c.active || c.id === servico?.diarista_id)
        .sort((a, b) => {
          // empreiteiro primeiro: é dele que a empreita costuma ser
          const ea = a.worker_type === "empreiteiro" ? 0 : 1;
          const eb = b.worker_type === "empreiteiro" ? 0 : 1;
          if (ea !== eb) return ea - eb;
          return a.name.localeCompare(b.name);
        }),
    [colaboradores, servico?.diarista_id]
  );

  const metro = mode === "metro";

  /** O profissional escolhido — é dele que vem o preço já combinado. */
  const profissional = profissionais.find((c) => c.id === diaristaId) ?? null;

  /** O valor a pagar — a mesma conta que o banco refaz ao gravar. */
  const total = metro ? parseQty(quantity) * parseMoney(rate) : parseMoney(amount);

  /** "10 M × R$ 2,00 = R$ 20,00" — a conta escrita do jeito que se fala. */
  const conta = servicoConta({
    contract_mode: mode,
    quantity: parseQty(quantity),
    unit,
    rate_per_unit: parseMoney(rate),
    contract_amount: parseMoney(amount),
    total_value: total,
  });

  /**
   * Escolheu o profissional: o preço combinado com ele no cadastro entra
   * sozinho — a forma de pagamento e o valor unitário. É o ponto do cadastro:
   * ninguém precisa lembrar de cabeça quanto foi acertado com cada um.
   *
   * Só preenche o que ainda está em branco quando se está CORRIGINDO um
   * serviço: o valor daquele lançamento é o que vale, não o do cadastro.
   */
  function escolherProfissional(id: string) {
    setDiaristaId(id);
    if (servico) return;

    const c = profissionais.find((p) => p.id === id);
    if (!c) return;

    if (c.payment_mode === "metro" && Number(c.meter_rate ?? 0) > 0) {
      setMode("metro");
      setRate(formatBRLInput(Number(c.meter_rate)));
      return;
    }
    if (c.payment_mode === "obra" && Number(c.job_rate ?? 0) > 0) {
      setMode("empreita");
      setAmount(formatBRLInput(Number(c.job_rate)));
    }
  }

  /** Serviço já pago não se corrige: o acerto guarda o valor que foi entregue. */
  const travado = !!servico?.acerto_id;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!serviceType.trim()) return setError("Informe qual serviço foi feito");
    if (metro) {
      if (parseMoney(rate) <= 0) return setError("Informe o valor do metro");
      if (parseQty(quantity) <= 0)
        return setError("Informe a metragem (ou a quantidade)");
    } else if (parseMoney(amount) <= 0) {
      return setError("Informe o valor da empreita");
    }

    const input = {
      obra_id: obraId,
      sector_id: sectorId || null,
      service_type: serviceType,
      diarista_id: diaristaId || null,
      contract_mode: mode,
      contract_amount: metro ? 0 : parseMoney(amount),
      rate_per_unit: metro ? parseMoney(rate) : 0,
      quantity: metro ? parseQty(quantity) : 0,
      unit,
      service_date: date,
      description,
      notes,
    };

    startTransition(async () => {
      const r = servico
        ? await updateSupplyObraServico(servico.id, input)
        : await createSupplyObraServico(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar o serviço");
        return;
      }
      onClose();
    });
  }

  function handleDelete() {
    if (!servico) return;
    if (
      !confirm(
        `Apagar o serviço "${servico.service_type}" de ${formatBRL(num(servico.total_value))}? Ele sai do custo da obra e da conta do profissional.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteSupplyObraServico(servico.id);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao apagar");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
              <HardHat className="w-4 h-4" />
            </span>
            {servico ? "Editar serviço" : "Novo serviço"}
          </DialogTitle>
          <p className="text-[11px] text-slate-400">{obraNome}</p>
        </DialogHeader>

        {travado && (
          <p className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
            Este serviço já foi acertado — o valor está pago e não muda mais. Para
            corrigir, desfaça o acerto na ficha do colaborador.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Qual serviço */}
          <div className="space-y-1.5">
            <Label htmlFor="sv_tipo">Tipo do serviço *</Label>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {SERVICOS_SUGERIDOS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={travado}
                  onClick={() => setServiceType(serviceType === s ? "" : s)}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors disabled:opacity-40 ${
                    serviceType === s
                      ? "bg-teal-600 border-teal-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <Input
              id="sv_tipo"
              value={serviceType}
              onChange={(e) => setServiceType(upperKeepingCaret(e))}
              placeholder="ex: cerca, alvenaria, pintura"
              autoCapitalize="characters"
              autoComplete="off"
              disabled={travado}
            />
          </div>

          {/* Onde: o setor da obra */}
          {sectors.length > 0 && (
            <div className="space-y-1.5">
              <Label>Setor</Label>
              <SearchableSelect
                items={sectors}
                value={sectorId}
                onChange={setSectorId}
                getId={(s) => s.id}
                getLabel={(s) => s.name}
                placeholder="Toque para escolher o setor..."
                searchPlaceholder="Buscar setor..."
                emptyMessage="Nenhum setor nesta obra"
              />
            </div>
          )}

          {/* Quem recebe */}
          <div className="space-y-1.5">
            <Label>Profissional</Label>
            <SearchableSelect
              items={profissionais}
              value={diaristaId}
              onChange={escolherProfissional}
              getId={(c) => c.id}
              getLabel={(c) => c.name}
              renderItem={(c) => (
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="truncate">{c.name}</span>
                  <span className="text-[10px] text-slate-400 flex-shrink-0 truncate max-w-[8rem]">
                    {c.profession ||
                      WORKER_TYPE_LABEL[c.worker_type ?? "diarista"]}
                  </span>
                </div>
              )}
              placeholder="Toque para escolher quem fez..."
              searchPlaceholder="Buscar colaborador..."
              emptyMessage="Nenhum colaborador cadastrado"
            />
            {/* O que está combinado com ele no cadastro — é o que veio preenchido */}
            {profissional && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Combinado no cadastro:{" "}
                <span className="font-medium">
                  {PAYMENT_MODE_LABEL[profissional.payment_mode ?? "diaria"]}
                </span>
                {profissional.payment_mode === "metro" &&
                Number(profissional.meter_rate ?? 0) > 0
                  ? ` · ${formatBRL(Number(profissional.meter_rate))}/m`
                  : ""}
                {profissional.payment_mode === "obra" &&
                Number(profissional.job_rate ?? 0) > 0
                  ? ` · ${formatBRL(Number(profissional.job_rate))} por obra`
                  : ""}
                {(profissional.payment_mode ?? "diaria") === "diaria"
                  ? ` · ${formatBRL(Number(profissional.daily_rate))}/dia — a diária é marcada no calendário, não aqui`
                  : ""}
              </p>
            )}
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              O valor entra direto no &quot;a receber&quot; dele, em Colaboradores. Em
              branco, o gasto fica só na obra.
            </p>
          </div>

          {/* Como foi contratado — é o que decide de onde sai o valor */}
          <div className="space-y-1.5">
            <Label>Contratação *</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { v: "empreita", label: "Empreita", hint: "preço fechado" },
                  { v: "metro", label: "Por metro", hint: "valor × metragem" },
                ] as const
              ).map((m) => (
                <button
                  key={m.v}
                  type="button"
                  disabled={travado}
                  onClick={() => setMode(m.v as ContractMode)}
                  className={`min-h-[52px] rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                    mode === m.v
                      ? "bg-teal-50 border-teal-400 dark:bg-teal-950/30 dark:border-teal-700"
                      : "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700"
                  }`}
                >
                  <span
                    className={`block text-sm font-semibold ${
                      mode === m.v
                        ? "text-teal-700 dark:text-teal-300"
                        : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {m.label}
                  </span>
                  <span className="block text-[10px] text-slate-400">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {metro ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sv_rate">Valor do metro *</Label>
                  <Input
                    id="sv_rate"
                    value={rate}
                    onChange={(e) => setRate(formatBRLInput(e.target.value))}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="h-12 tabular-nums text-lg font-semibold"
                    autoComplete="off"
                    disabled={travado}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sv_qtd">Metragem *</Label>
                  <Input
                    id="sv_qtd"
                    value={quantity}
                    onChange={(e) => setQuantity(formatQtyInput(e.target.value))}
                    placeholder="0"
                    inputMode="decimal"
                    className="h-12 tabular-nums text-lg font-semibold"
                    autoComplete="off"
                    disabled={travado}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <div className="flex gap-1.5">
                  {UNIDADES_SERVICO.map((u) => (
                    <button
                      key={u}
                      type="button"
                      disabled={travado}
                      onClick={() => setUnit(u)}
                      className={`flex-1 min-h-[40px] rounded-lg border text-xs font-semibold transition-colors disabled:opacity-40 ${
                        unit === u
                          ? "bg-teal-600 border-teal-600 text-white"
                          : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="sv_valor">Valor da empreita *</Label>
              <Input
                id="sv_valor"
                value={amount}
                onChange={(e) => setAmount(formatBRLInput(e.target.value))}
                placeholder="0,00"
                inputMode="decimal"
                className="h-12 tabular-nums text-lg font-semibold"
                autoComplete="off"
                disabled={travado}
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                O preço fechado do serviço inteiro, do jeito que foi combinado.
              </p>
            </div>
          )}

          {/*
            A CONTA, escrita do jeito que se fala: "10 M × R$ 2,00 = R$ 20,00".
            Sem a fórmula à vista, quem confere via só os 20 reais e não sabia se
            vieram de 10 metros a 2,00 ou de 2 metros a 10,00.
          */}
          <div className="rounded-xl border border-teal-200 dark:border-teal-900/50 bg-teal-50/60 dark:bg-teal-950/20 px-3 py-2.5 space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-teal-800 dark:text-teal-300">
                A pagar ao profissional
              </span>
              <span className="text-lg font-bold text-teal-700 dark:text-teal-300 tabular-nums">
                {formatBRL(total)}
              </span>
            </div>
            {metro && (
              <p className="text-[11px] text-teal-700/80 dark:text-teal-400/80 tabular-nums">
                {conta.formula} = {conta.total}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sv_data">Data do serviço</Label>
            <Input
              id="sv_data"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="tabular-nums"
              disabled={travado}
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              É por ela que o acerto corta: serviço feito depois da data do acerto
              fica para o próximo.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sv_desc">O que foi feito</Label>
            <Input
              id="sv_desc"
              value={description}
              onChange={(e) => setDescription(upperKeepingCaret(e))}
              placeholder="opcional"
              autoCapitalize="characters"
              autoComplete="off"
              disabled={travado}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sv_obs">Observações</Label>
            <Textarea
              id="sv_obs"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional"
              autoCapitalize="characters"
              rows={2}
              disabled={travado}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter>
            {servico && !travado && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                aria-label="Apagar serviço"
                className="h-10 px-4 rounded-md border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40"
              >
                <Trash2 className="w-4 h-4 inline" />
              </button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {travado ? "Voltar" : "Cancelar"}
            </Button>
            {!travado && (
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : servico ? "Salvar" : "Lançar serviço"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
