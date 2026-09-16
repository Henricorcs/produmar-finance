"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Trash2, Truck } from "lucide-react";
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
import { actionError } from "@/lib/action-result";
import { avisoNaoEntregue, recadoDoAvisoNaoEntregue } from "@/lib/aviso-do-envio";
import {
  cn,
  formatBRL,
  formatBRLInput,
  formatQty,
  localDateISO,
  parseMoney,
  upperKeepingCaret,
} from "@/lib/utils";
import {
  createMachineServico,
  deleteMachineServico,
  updateMachineServico,
} from "@/app/(app)/frota/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  STICKY_FOOTER,
  kindMeta,
} from "./frota-shared";
import {
  MACHINE_SERVICO_KINDS,
  type Machine,
  type MachineServico,
  type MachineServicoKind,
  type MachineServicoStatus,
} from "@/lib/types";
import { AvisoDoCelular } from "@/components/operador/aviso-do-celular";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Serviço em edição — null lança um novo. */
  servico: MachineServico | null;
  /** Veículo já escolhido (veio da ficha) — trava o campo. */
  presetMachineId?: string | null;
  machines: Machine[];
  /** Contratantes já usados, para não digitar o nome de novo. */
  contratantes?: string[];
  /** Dia tocado no calendário — a OS nova já nasce com essa data. */
  presetDate?: string | null;
  /** Operadores com login — a OS pode ser enviada para o celular de um deles. */
  operators?: { id: string; name: string }[];
}

/**
 * O SERVIÇO DA MÁQUINA — a diária, a hora, a viagem (o frete da caçamba), o km
 * rodado ou um valor fechado.
 *
 * O que faz esta tela existir é o CONTRATANTE: pra quem o veículo trabalhou.
 * É por ele que a ficha soma quanto cada um contratou e quanto ainda deve.
 *
 * Isto NÃO cria lançamento no módulo Contas: é registro e relatório dentro da
 * Frota.
 */
export function ServicoDialog({
  open,
  onClose,
  servico,
  presetMachineId,
  machines,
  contratantes = [],
  presetDate,
  operators = [],
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [machineId, setMachineId] = useState("");
  const [kind, setKind] = useState<MachineServicoKind>("diaria");
  const [date, setDate] = useState(localDateISO());
  const [contratante, setContratante] = useState("");
  const [description, setDescription] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [internal, setInternal] = useState(false);
  const [assignedTo, setAssignedTo] = useState("");
  const [status, setStatus] = useState<MachineServicoStatus>("aberta");
  const [paid, setPaid] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setMachineId(servico?.machine_id ?? presetMachineId ?? "");
    setKind(servico?.kind ?? "diaria");
    // OS nova aberta pelo calendário nasce no dia que foi tocado
    setDate(servico?.service_date ?? presetDate ?? localDateISO());
    setContratante(servico?.contratante ?? "");
    setDescription(servico?.description ?? "");
    setOrigin(servico?.origin ?? "");
    setDestination(servico?.destination ?? "");
    setQuantity(servico ? formatQty(Number(servico.quantity)) : "1");
    setUnitPrice(servico ? formatBRLInput(Number(servico.unit_price)) : "");
    setAssignedTo(servico?.assigned_to ?? "");
    setInternal(servico?.internal ?? false);
    setStatus(servico?.status ?? "aberta");
    setPaid(servico?.paid ?? false);
    setNotes(servico?.notes ?? "");
    setError(null);
  }, [open, servico, presetMachineId, presetDate]);

  const meta = kindMeta(kind);
  const fechado = kind === "servico";

  const qtd = fechado ? 1 : parseMoney(quantity);
  const valor = parseMoney(unitPrice);
  const total = Math.round(qtd * valor * 100) / 100;

  const machine = useMemo(
    () => machines.find((m) => m.id === machineId) ?? null,
    [machines, machineId]
  );

  /** Só os nomes que já foram usados, sem repetir e sem o que já está digitado. */
  const sugestoes = useMemo(
    () => contratantes.filter((c) => c && c !== contratante.toUpperCase()).slice(0, 6),
    [contratantes, contratante]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!machineId) {
      setError("Escolha a máquina ou o veículo");
      return;
    }
    if (!fechado && qtd <= 0) {
      setError(`Informe quantos ${meta.unitPlural} foram`);
      return;
    }
    if (!internal && valor <= 0) {
      setError("Informe o valor — ou marque que o serviço foi da própria firma");
      return;
    }

    startTransition(async () => {
      // Quem estava na máquina é quem recebeu a OS: o nome dele vai junto para
      // a ficha, a planilha e o histórico. OS antiga, lançada antes do "Enviar
      // para", guarda o nome que foi digitado na época.
      const escolhido = operators.find((o) => o.id === assignedTo)?.name;
      const operator =
        escolhido ?? (servico && !servico.assigned_to ? servico.operator : null);
      const input = {
        machine_id: machineId,
        service_date: date,
        kind,
        contratante,
        description,
        origin,
        destination,
        quantity: qtd,
        unit_price: valor,
        operator,
        internal,
        status,
        paid,
        assigned_to: assignedTo || null,
        notes,
      };
      const r = servico
        ? await updateMachineServico(servico.id, input)
        : await createMachineServico(input);
      const falha = actionError(r);
      if (falha) {
        setError(falha);
        return;
      }
      // Salvou. Se o celular dele não tocou, é AGORA que se diz — depois de
      // fechada a ficha, ninguém mais descobre.
      const semAviso = avisoNaoEntregue(r);
      if (semAviso) {
        alert(
          recadoDoAvisoNaoEntregue(
            semAviso,
            operators.find((o) => o.id === assignedTo)?.name
          )
        );
      }
      onClose();
    });
  }

  function handleDelete() {
    if (!servico) return;
    if (!confirm("Apagar esta OS da ficha? Isso não tem volta.")) return;
    setError(null);
    startTransition(async () => {
      const falha = actionError(await deleteMachineServico(servico.id));
      if (falha) {
        setError(falha);
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
              <Truck className="w-4 h-4" />
            </span>
            {servico ? "Editar ordem de serviço" : "Nova ordem de serviço"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* O veículo: travado quando o lançamento saiu da ficha dele */}
          {presetMachineId ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Veículo:{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {machine?.name ?? "—"}
              </span>
              {machine?.plate ? ` · ${machine.plate}` : ""}
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label>Máquina / veículo *</Label>
              <SearchableSelect
                items={machines}
                value={machineId}
                onChange={setMachineId}
                getId={(m) => m.id}
                getLabel={(m) => m.name}
                renderItem={(m) => (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate">{m.name}</span>
                    {m.plate && (
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{m.plate}</span>
                    )}
                  </div>
                )}
                placeholder="Escolha o veículo"
                searchPlaceholder="Buscar pelo nome..."
                emptyMessage="Nenhum veículo cadastrado"
                suggestOnType
              />
            </div>
          )}

          {/* Como foi cobrado — é o que muda a conta */}
          <div className="space-y-1.5">
            <Label>Como foi cobrado *</Label>
            <div className="grid grid-cols-5 gap-1.5">
              {MACHINE_SERVICO_KINDS.map((k) => {
                const Icone = kindMeta(k.value).icon;
                return (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={cn(
                      "min-h-[52px] rounded-lg border flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
                      kind === k.value
                        ? "bg-produmar-600 border-produmar-600 text-white"
                        : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                    )}
                  >
                    <Icone className="w-4 h-4" />
                    {k.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* A conta: quantos × quanto */}
          <div className={cn("grid gap-3", fechado ? "grid-cols-1" : "grid-cols-2")}>
            {!fechado && (
              <div className="space-y-1.5">
                <Label htmlFor="ms_qtd">
                  Quantos {meta.unitPlural} *
                </Label>
                <Input
                  id="ms_qtd"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="1"
                  className="h-11 text-base tabular-nums font-semibold sm:h-10"
                  inputMode="decimal"
                  autoComplete="off"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ms_valor">{meta.priceLabel} (R$)</Label>
              <Input
                id="ms_valor"
                value={unitPrice}
                onChange={(e) => setUnitPrice(formatBRLInput(e.target.value))}
                placeholder="0,00"
                className="h-11 text-base tabular-nums font-semibold sm:h-10"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
          </div>

          {/* O total, feito na frente de quem digita */}
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {fechado
                ? "Valor fechado"
                : `${formatQty(qtd)} ${qtd === 1 ? meta.unit : meta.unitPlural} × ${formatBRL(valor)}`}
            </span>
            <span className="text-base font-bold tabular-nums text-produmar-700 dark:text-produmar-400">
              {formatBRL(total)}
            </span>
          </div>

          {/* PRA QUEM FOI — o motivo de a ficha existir */}
          <div className="space-y-1.5">
            <Label htmlFor="ms_contratante">Contratante — pra quem foi</Label>
            {sugestoes.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {sugestoes.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setContratante(c)}
                    className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <Input
              id="ms_contratante"
              value={contratante}
              onChange={(e) => setContratante(upperKeepingCaret(e))}
              placeholder="ex: prefeitura, seu josé, obra da fazenda"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ms_data">Data</Label>
            <Input
              id="ms_data"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 tabular-nums sm:h-10"
            />
          </div>

          {/* Aberta ou concluída — é o verde do calendário do veículo */}
          <div className="space-y-1.5">
            <Label>Situação da OS</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { v: "aberta", label: "Aberta", hint: "ainda em andamento" },
                  { v: "concluida", label: "Concluída", hint: "serviço acabado" },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setStatus(o.v)}
                  className={cn(
                    "min-h-[48px] rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-colors",
                    status === o.v
                      ? o.v === "aberta"
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-slate-400 border-slate-400 text-white dark:bg-slate-600 dark:border-slate-600"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  )}
                >
                  <span className="text-xs font-semibold">{o.label}</span>
                  <span className="text-[10px] opacity-80">{o.hint}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              O dia fica verde no calendário enquanto a OS estiver aberta.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ms_desc">O que foi feito</Label>
            <Input
              id="ms_desc"
              value={description}
              onChange={(e) => setDescription(upperKeepingCaret(e))}
              placeholder="ex: 3 viagens de areia"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          {/* O trecho — o que a viagem precisa dizer */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ms_origem">De onde</Label>
              <Input
                id="ms_origem"
                value={origin}
                onChange={(e) => setOrigin(upperKeepingCaret(e))}
                placeholder="opcional"
                autoCapitalize="characters"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms_destino">Para onde</Label>
              <Input
                id="ms_destino"
                value={destination}
                onChange={(e) => setDestination(upperKeepingCaret(e))}
                placeholder="opcional"
                autoCapitalize="characters"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </div>
          </div>

          {/* As duas chaves da conta: é cobrado? já recebeu? */}
          <div className="space-y-2">
            <Toggle
              label="Já recebi este serviço"
              hint="Desmarcado, ele entra no que o contratante ainda deve."
              ativo={paid}
              onClick={() => {
                const recebeu = !paid;
                setPaid(recebeu);
                // dinheiro na mão é serviço acabado
                if (recebeu) setStatus("concluida");
              }}
              disabled={internal}
            />
            <Toggle
              label="Serviço da própria firma"
              hint="Trabalho feito para a gente mesmo: fica fora da receita e é somado à parte."
              ativo={internal}
              onClick={() => {
                const virouInterno = !internal;
                setInternal(virouInterno);
                // serviço da firma não tem o que receber
                if (virouInterno) setPaid(false);
              }}
            />
          </div>

          {/* Sem ninguém na lista não dá para enviar — e é melhor dizer isso
              do que sumir com o campo sem explicação. */}
          {operators.length === 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Ninguém com login para enviar esta OS. Cadastre a pessoa em
              Configurações → Usuários (papel &quot;operador&quot;, &quot;encarregado&quot;
              ou &quot;admin&quot;) para ela cair no celular dela.
            </p>
          )}

          {/* ENVIAR PARA — operador, encarregado ou outro admin; a OS cai no
              celular de quem for escolhido */}
          {operators.length > 0 && (
            <div className="space-y-1.5">
              <Label>Enviar para</Label>
              <SearchableSelect
                items={operators}
                value={assignedTo}
                onChange={setAssignedTo}
                getId={(o) => o.id}
                getLabel={(o) => o.name}
                placeholder="Ninguém — a OS fica só aqui"
                searchPlaceholder="Buscar pelo nome..."
                emptyMessage="Ninguém com esse nome"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Ele recebe esta OS no painel dele e fecha pelo celular: toca em
                INICIAR ao começar e em FINALIZAR ao terminar, contando o que fez.
              </p>
              {/* ...e o celular só apita se ele tiver ligado os alertas */}
              <AvisoDoCelular
                userId={assignedTo}
                nome={operators.find((o) => o.id === assignedTo)?.name}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ms_notes">Observação</Label>
            <Textarea
              id="ms_notes"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional"
              rows={2}
              autoCapitalize="characters"
            />
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            A OS fica aqui, na ficha do veículo — ela não vira lançamento no módulo
            Contas.
          </p>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter className={STICKY_FOOTER}>
            {servico && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                aria-label="Apagar OS"
                className="h-11 px-4 rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 sm:h-10"
              >
                <Trash2 className="w-4 h-4 inline" />
              </button>
            )}
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
              type="submit"
              disabled={isPending}
              className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
            >
              {isPending ? "Salvando..." : servico ? "Salvar" : "Lançar OS"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Chavinha de sim/não com a explicação embaixo. */
function Toggle({
  label,
  hint,
  ativo,
  onClick,
  disabled,
}: {
  label: string;
  hint: string;
  ativo: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full text-left rounded-lg border px-3 py-2.5 transition-colors disabled:opacity-40",
        ativo
          ? "bg-produmar-50 border-produmar-300 dark:bg-produmar-900/30 dark:border-produmar-700"
          : "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
            ativo
              ? "bg-produmar-600 border-produmar-600"
              : "border-slate-300 dark:border-slate-600"
          )}
        >
          {ativo && (
            <svg viewBox="0 0 12 12" className="w-3 h-3 text-white" fill="none">
              <path
                d="M2.5 6.5l2.5 2.5 4.5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      </div>
      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 pl-6">{hint}</p>
    </button>
  );
}
