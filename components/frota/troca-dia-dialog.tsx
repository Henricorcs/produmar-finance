"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDownLeft, ArrowUpRight, Minus, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionError } from "@/lib/action-result";
import { cn, formatQty, machineCategoryLabel, upperKeepingCaret } from "@/lib/utils";
import { salvarMachineTroca } from "@/app/(app)/frota/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER, categoryChip } from "./frota-shared";
import {
  MACHINE_CATEGORIES,
  parceiroVeiculoLabel,
  type Machine,
  type MachineParceiro,
  type MachineParceiroVeiculo,
  type MachineTroca,
} from "@/lib/types";

/** "2026-09-15" → "Terça-feira, 15 de setembro" (o dia tocado, por extenso). */
function diaPorExtenso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const texto = new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** O texto guardado no dia ("ABC-1234, XYZ-9876") vira a lista de marcados. */
function paraLista(texto?: string | null): string[] {
  return (texto ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

interface Props {
  /** O dia tocado no calendário (YYYY-MM-DD) — null fecha a caixa. */
  dia: string | null;
  onClose: () => void;
  parceiro: MachineParceiro;
  /** O que já está lançado NESTE dia, um por tipo de máquina. */
  doDia: MachineTroca[];
  /** Os veículos cadastrados do parceiro — as placas que se marca no dia. */
  veiculosDoParceiro: MachineParceiroVeiculo[];
  /** As nossas máquinas, para marcar qual foi trabalhar para ele. */
  minhasMaquinas: Machine[];
  /** Cadastrar um veículo do parceiro na hora, sem sair do dia. */
  onNovoVeiculo?: (category: string) => void;
}

/**
 * O DIA DA TROCA — quantas máquinas dele vieram, quantas nossas foram, e QUAIS.
 *
 * Os dois números moram no mesmo dia porque é assim que a conta é feita: se ele
 * botou duas caçambas e nós botamos uma, ficamos devendo uma. Conta de meia em
 * meia diária, porque às vezes a máquina só trabalha meio dia.
 *
 * Marcar as placas é o que responde, no fim do mês, QUAL caçamba trabalhou e
 * qual parou. Marcar um veículo já ajusta o contador; o meio dia se acerta nos
 * botões de ½.
 *
 * Zerar os dois APAGA o dia: é como se desmarca um lançamento errado.
 */
export function TrocaDiaDialog({
  dia,
  onClose,
  parceiro,
  doDia,
  veiculosDoParceiro,
  minhasMaquinas,
  onNovoVeiculo,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [category, setCategory] = useState("cacamba");
  const [recebidas, setRecebidas] = useState(0);
  const [cedidas, setCedidas] = useState(0);
  const [placasDele, setPlacasDele] = useState<string[]>([]);
  const [placasMinhas, setPlacasMinhas] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  /** O que já está lançado no dia, por tipo — é o que preenche os contadores. */
  const porTipo = useMemo(() => {
    const map = new Map<string, MachineTroca>();
    for (const t of doDia) map.set(t.category, t);
    return map;
  }, [doDia]);

  // Os dois preenchimentos abaixo só valem quando o dia (ou o tipo) MUDA. Sem
  // essa trava, cadastrar uma placa no meio do lançamento recarregaria a página
  // por baixo e apagaria o que a pessoa já tinha marcado no dia.
  const ultimoDia = useRef<string | null>(null);
  const ultimaChave = useRef<string | null>(null);

  // Um dia novo começa no tipo que já tem lançamento (ou na caçamba, que é o
  // que mais roda).
  useEffect(() => {
    if (!dia || ultimoDia.current === dia) return;
    ultimoDia.current = dia;
    setCategory(doDia[0]?.category ?? "cacamba");
  }, [dia, doDia]);

  // Ao abrir o dia (e ao trocar de tipo), tudo mostra o que já está lançado
  // daquele tipo — salvar CORRIGE o dia, não soma por cima.
  useEffect(() => {
    if (!dia) {
      // fechou: o próximo dia aberto preenche tudo de novo, mesmo sendo o mesmo
      ultimoDia.current = null;
      ultimaChave.current = null;
      return;
    }
    const chave = `${dia}|${category}`;
    if (ultimaChave.current === chave) return;
    ultimaChave.current = chave;

    const atual = porTipo.get(category);
    setRecebidas(Number(atual?.recebidas ?? 0));
    setCedidas(Number(atual?.cedidas ?? 0));
    setPlacasDele(paraLista(atual?.veiculos_dele));
    setPlacasMinhas(paraLista(atual?.veiculos_meus));
    setNotes(atual?.notes ?? "");
    setErro(null);
  }, [dia, category, porTipo]);

  const jaLancado = porTipo.get(category);
  const vaiApagar = recebidas === 0 && cedidas === 0 && !!jaLancado;

  /** Os veículos dele deste tipo — mais os que já estavam marcados no dia. */
  const opcoesDele = useMemo(() => {
    const doTipo = veiculosDoParceiro
      .filter((v) => v.active && v.category === category)
      .map(parceiroVeiculoLabel)
      .filter(Boolean);
    // placa marcada no dia que saiu do cadastro depois continua aparecendo,
    // senão não teria como desmarcar
    const extras = placasDele.filter((p) => !doTipo.includes(p));
    return [...doTipo, ...extras];
  }, [veiculosDoParceiro, category, placasDele]);

  /** As nossas máquinas deste tipo — mais as que já estavam marcadas. */
  const opcoesMinhas = useMemo(() => {
    const doTipo = minhasMaquinas
      .filter((m) => m.active && (m.category ?? "outro") === category)
      .map((m) => m.name.toUpperCase());
    const extras = placasMinhas.filter((p) => !doTipo.includes(p));
    return [...doTipo, ...extras];
  }, [minhasMaquinas, category, placasMinhas]);

  /**
   * Marcar/desmarcar um veículo já acerta o contador: dois veículos marcados
   * são duas diárias. Meio dia se ajusta depois, no botão de ½.
   */
  function alternar(
    lista: string[],
    setLista: (v: string[]) => void,
    setContador: (v: number) => void,
    label: string
  ) {
    const nova = lista.includes(label)
      ? lista.filter((p) => p !== label)
      : [...lista, label];
    setLista(nova);
    setContador(nova.length);
  }

  function salvar() {
    if (!dia) return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(
        await salvarMachineTroca({
          parceiro_id: parceiro.id,
          entry_date: dia,
          category,
          recebidas,
          cedidas,
          veiculos_dele: placasDele.join(", "),
          veiculos_meus: placasMinhas.join(", "),
          notes,
        })
      );
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  const primeiroNome = parceiro.name.split(" ")[0];

  return (
    <Dialog open={!!dia} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {dia ? diaPorExtenso(dia) : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Troca com{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {parceiro.name}
            </span>
          </p>

          {/* O tipo separa a conta: caçamba se paga com caçamba */}
          <div className="space-y-1.5">
            <Label>Tipo de máquina</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {MACHINE_CATEGORIES.map((c) => {
                const lancado = porTipo.get(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={cn(
                      "min-h-[40px] rounded-lg border text-xs font-semibold transition-colors relative",
                      category === c.value
                        ? "bg-produmar-600 border-produmar-600 text-white"
                        : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                    )}
                  >
                    {c.label}
                    {/* já tem lançamento deste tipo no dia */}
                    {lancado && (
                      <span
                        className={cn(
                          "absolute top-1 right-1 w-1.5 h-1.5 rounded-full",
                          category === c.value ? "bg-white" : "bg-produmar-500"
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* O que veio dele */}
          <Contador
            label={`Máquinas de ${primeiroNome} que vieram`}
            hint="trabalharam PARA NÓS neste dia — é o que a gente passa a dever"
            icon={ArrowDownLeft}
            tom="amber"
            valor={recebidas}
            onChange={setRecebidas}
          >
            <Placas
              titulo="Quais vieram"
              opcoes={opcoesDele}
              marcadas={placasDele}
              onToggle={(label) =>
                alternar(placasDele, setPlacasDele, setRecebidas, label)
              }
              vazio={`Nenhuma ${machineCategoryLabel(category).toLowerCase()} de ${primeiroNome} cadastrada`}
              onNovo={onNovoVeiculo ? () => onNovoVeiculo(category) : undefined}
              novoLabel="+ placa"
              tom="amber"
            />
          </Contador>

          {/* O que foi nosso */}
          <Contador
            label="Minhas máquinas que foram"
            hint="trabalharam PARA ELE neste dia — é o que a gente paga"
            icon={ArrowUpRight}
            tom="emerald"
            valor={cedidas}
            onChange={setCedidas}
          >
            <Placas
              titulo="Quais foram"
              opcoes={opcoesMinhas}
              marcadas={placasMinhas}
              onToggle={(label) =>
                alternar(placasMinhas, setPlacasMinhas, setCedidas, label)
              }
              vazio={`Nenhuma ${machineCategoryLabel(category).toLowerCase()} sua cadastrada`}
              tom="emerald"
            />
          </Contador>

          {/* A conta do dia, na frente de quem lança */}
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 px-3 py-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {recebidas === 0 && cedidas === 0
                ? vaiApagar
                  ? "Salvar assim APAGA este dia."
                  : "Um dia sem máquina nenhuma não entra no calendário."
                : cedidas === recebidas
                  ? "Dia empatado: ninguém fica devendo."
                  : cedidas > recebidas
                    ? `Neste dia ${primeiroNome} fica devendo ${formatQty(cedidas - recebidas)} ${
                        cedidas - recebidas === 1 ? "diária" : "diárias"
                      } de ${machineCategoryLabel(category).toLowerCase()}.`
                    : `Neste dia você fica devendo ${formatQty(recebidas - cedidas)} ${
                        recebidas - cedidas === 1 ? "diária" : "diárias"
                      } de ${machineCategoryLabel(category).toLowerCase()}.`}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr_notes">Observação</Label>
            <Textarea
              id="tr_notes"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional — onde foi o serviço, quem operou"
              rows={2}
              autoCapitalize="characters"
            />
          </div>

          {/* O que já está lançado neste dia, nos outros tipos */}
          {doDia.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Lançado neste dia
              </p>
              <div className="flex flex-wrap gap-1.5">
                {doDia.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCategory(t.category)}
                    className={cn(
                      "text-[11px] font-semibold px-2 py-1 rounded-full",
                      categoryChip(t.category)
                    )}
                  >
                    {machineCategoryLabel(t.category)}: dele {formatQty(Number(t.recebidas))} ·
                    minhas {formatQty(Number(t.cedidas))}
                  </button>
                ))}
              </div>
            </div>
          )}

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}
        </div>

        <DialogFooter className={STICKY_FOOTER}>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={salvar}
            disabled={isPending}
            className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
          >
            {isPending ? "Salvando..." : vaiApagar ? "Apagar o dia" : "Salvar o dia"}
            {vaiApagar && <Trash2 className="w-4 h-4" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O contador de diárias do dia, de MEIA EM MEIA: os botões de fora andam de um
 * em um e os de dentro de meio em meio, porque a máquina que trabalha meio dia
 * vale meia diária — dos dois lados.
 */
function Contador({
  label,
  hint,
  icon: Icon,
  tom,
  valor,
  onChange,
  children,
}: {
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tom: "amber" | "emerald";
  valor: number;
  onChange: (v: number) => void;
  children?: React.ReactNode;
}) {
  const cor =
    tom === "amber"
      ? "text-amber-700 dark:text-amber-400"
      : "text-emerald-700 dark:text-emerald-400";
  const fundo =
    tom === "amber"
      ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50"
      : "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50";

  function passo(delta: number) {
    const novo = Math.round((valor + delta) * 100) / 100;
    onChange(novo < 0 ? 0 : novo);
  }

  return (
    <div className={cn("rounded-xl border p-3 space-y-2", fundo)}>
      <div className="flex items-start gap-2">
        <Icon className={cn("w-4 h-4 flex-shrink-0 mt-0.5", cor)} />
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold leading-tight", cor)}>{label}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1">
        <Passo onClick={() => passo(-1)} aria-label="Menos uma diária">
          <Minus className="w-4 h-4" />
          <span className="text-[10px] font-bold leading-none">1</span>
        </Passo>
        <Passo onClick={() => passo(-0.5)} aria-label="Menos meia diária">
          <Minus className="w-4 h-4" />
          <span className="text-[10px] font-bold leading-none">½</span>
        </Passo>

        <div className="text-center px-1 min-w-[3.5rem]">
          <span className={cn("text-3xl font-black tabular-nums", cor)}>
            {formatQty(valor)}
          </span>
          <span className="block text-[10px] font-medium text-slate-400 dark:text-slate-500">
            {valor === 1 ? "diária" : "diárias"}
          </span>
        </div>

        <Passo onClick={() => passo(0.5)} aria-label="Mais meia diária">
          <Plus className="w-4 h-4" />
          <span className="text-[10px] font-bold leading-none">½</span>
        </Passo>
        <Passo onClick={() => passo(1)} aria-label="Mais uma diária">
          <Plus className="w-4 h-4" />
          <span className="text-[10px] font-bold leading-none">1</span>
        </Passo>
      </div>

      {children}
    </div>
  );
}

function Passo({
  onClick,
  children,
  ...rest
}: {
  onClick: () => void;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-11 h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col items-center justify-center gap-0.5 text-slate-600 dark:text-slate-300 active:scale-95 transition-transform flex-shrink-0"
      {...rest}
    >
      {children}
    </button>
  );
}

/** As placas de um lado do dia: marcar diz QUAL veículo foi. */
function Placas({
  titulo,
  opcoes,
  marcadas,
  onToggle,
  vazio,
  onNovo,
  novoLabel,
  tom,
}: {
  titulo: string;
  opcoes: string[];
  marcadas: string[];
  onToggle: (label: string) => void;
  vazio: string;
  onNovo?: () => void;
  novoLabel?: string;
  tom: "amber" | "emerald";
}) {
  const ativo =
    tom === "amber"
      ? "bg-amber-600 border-amber-600 text-white"
      : "bg-emerald-600 border-emerald-600 text-white";

  return (
    <div className="space-y-1.5 pt-1">
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{titulo}</p>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.length === 0 && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">{vazio}</span>
        )}
        {opcoes.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => onToggle(label)}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors",
              marcadas.includes(label)
                ? ativo
                : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
            )}
          >
            {label}
          </button>
        ))}
        {onNovo && (
          <button
            type="button"
            onClick={onNovo}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-dashed border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400"
          >
            {novoLabel ?? "+ novo"}
          </button>
        )}
      </div>
    </div>
  );
}
