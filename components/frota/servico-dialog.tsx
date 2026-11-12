"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Trash2, Truck } from "lucide-react";
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
  formatDate,
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

/** Uma frase do que cada cobrança quer dizer — para escolher sem dúvida. */
const KIND_HINT: Record<MachineServicoKind, string> = {
  diaria: "por dia trabalhado",
  viagem: "por carrada / viagem",
  hora: "pelas horas da máquina",
  km: "pelo km rodado",
  servico: "um valor só pelo serviço",
};

/** As telas da OS nova, na ordem em que aparecem. */
type Passo = "maquina" | "cobranca" | "valor" | "contratante" | "servico" | "data" | "enviar" | "resumo";

const TITULO_DO_PASSO: Record<Passo, string> = {
  maquina: "Qual máquina",
  cobranca: "Como vai ser cobrado",
  valor: "Quanto vai custar",
  contratante: "Pra quem vai ser",
  servico: "O que vai ser feito",
  data: "Quando começa",
  enviar: "Quem vai fazer",
  resumo: "Conferir e lançar",
};

/**
 * O SERVIÇO DA MÁQUINA — a diária, a hora, a viagem (o frete da caçamba), o km
 * rodado ou um valor fechado.
 *
 * A OS NOVA é aberta ANTES do serviço: diz o que VAI ser feito, e quem estava
 * na máquina conta, ao FINALIZAR, quantas horas, viagens ou dias levou. Por
 * isso ela vem em passos, um campo por tela, e a quantidade é opcional.
 *
 * A OS que já existe abre com a tela inteira, para corrigir o que for.
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
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [internal, setInternal] = useState(false);
  const [assignedTo, setAssignedTo] = useState("");
  const [status, setStatus] = useState<MachineServicoStatus>("aberta");
  const [paid, setPaid] = useState(false);
  const [notes, setNotes] = useState("");

  /** OS nova = passo a passo. A que já existe abre com tudo na tela. */
  const novo = !servico;
  const [passoIdx, setPassoIdx] = useState(0);
  /** Hora da última troca de passo — o toque duplo no "Próximo" não pode lançar a OS. */
  const trocouEm = useRef(0);

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
    // OS nova: a quantidade fica em branco — quem sabe é o operador, no fim
    setQuantity(servico && Number(servico.quantity) > 0 ? formatQty(Number(servico.quantity)) : "");
    setUnitPrice(servico ? formatBRLInput(Number(servico.unit_price)) : "");
    setAssignedTo(servico?.assigned_to ?? "");
    setInternal(servico?.internal ?? false);
    setStatus(servico?.status ?? "aberta");
    setPaid(servico?.paid ?? false);
    setNotes(servico?.notes ?? "");
    setPassoIdx(0);
    setError(null);
  }, [open, servico, presetMachineId, presetDate]);

  const meta = kindMeta(kind);
  const fechado = kind === "servico";
  /** Viagem e km têm trecho (de onde → para onde); o resto, só o lugar. */
  // (a OS antiga que já tinha "de onde" continua mostrando, para não sumir com ele)
  const temTrecho = kind === "viagem" || kind === "km" || (!novo && !!servico?.origin);

  const qtd = fechado ? 1 : parseMoney(quantity);
  const semQuantidade = !fechado && qtd <= 0;
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

  const passos = useMemo<Passo[]>(
    () => [
      ...(presetMachineId ? [] : (["maquina"] as Passo[])),
      "cobranca",
      "valor",
      "contratante",
      "servico",
      "data",
      "enviar",
      "resumo",
    ],
    [presetMachineId]
  );
  const passo = passos[Math.min(passoIdx, passos.length - 1)];
  const ultimoPasso = passoIdx >= passos.length - 1;

  function irPara(i: number) {
    setError(null);
    trocouEm.current = Date.now();
    setPassoIdx(Math.max(0, Math.min(i, passos.length - 1)));
  }

  /** O que cada passo precisa antes de seguir. */
  function faltaNoPasso(p: Passo): string | null {
    if (p === "maquina" && !machineId) return "Escolha a máquina ou o veículo";
    if (p === "valor" && !internal && valor <= 0)
      return "Informe o valor — ou marque que o serviço é da própria firma";
    return null;
  }

  function avancar() {
    const falta = faltaNoPasso(passo);
    if (falta) {
      setError(falta);
      return;
    }
    irPara(passoIdx + 1);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // No passo a passo, o Enter do teclado (e o "Próximo") só anda uma tela
    if (novo && !ultimoPasso) {
      avancar();
      return;
    }
    // o dedo que tocou duas vezes no "Próximo" não lança a OS sem conferir
    if (novo && Date.now() - trocouEm.current < 600) return;

    if (!machineId) {
      setError("Escolha a máquina ou o veículo");
      return;
    }
    // Só a OS já acabada precisa da quantidade; a aberta, o operador conta no fim
    if (semQuantidade && (status === "concluida" || paid)) {
      setError(`Informe quantos ${meta.unitPlural} foram — a OS concluída precisa disso`);
      return;
    }
    if (!internal && valor <= 0) {
      setError("Informe o valor — ou marque que o serviço é da própria firma");
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
        origin: temTrecho ? origin : "",
        destination,
        quantity: semQuantidade ? 0 : qtd,
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

  // ───────────────────────────────────────────────────────────────────────────
  // Os pedaços do formulário — no passo a passo aparece um de cada vez; na
  // edição, todos juntos.
  // ───────────────────────────────────────────────────────────────────────────

  const campoMaquina = (
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
  );

  /** Na OS nova, cada forma de cobrança é um botão grande que já passa para a próxima tela. */
  const campoCobrancaPasso = (
    <div className="space-y-2">
      {MACHINE_SERVICO_KINDS.map((k) => {
        const Icone = kindMeta(k.value).icon;
        const ativo = kind === k.value;
        return (
          <button
            key={k.value}
            type="button"
            onClick={() => {
              setKind(k.value);
              irPara(passoIdx + 1);
            }}
            className={cn(
              "w-full min-h-[56px] rounded-xl border px-4 flex items-center gap-3 text-left transition-colors",
              ativo
                ? "bg-produmar-600 border-produmar-600 text-white"
                : "bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            )}
          >
            <Icone className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-base font-semibold">{k.label}</span>
              <span className={cn("block text-xs", ativo ? "text-white/80" : "text-slate-400")}>
                {KIND_HINT[k.value]}
              </span>
            </span>
            <ChevronRight className={cn("w-4 h-4 flex-shrink-0", ativo ? "text-white/80" : "text-slate-300")} />
          </button>
        );
      })}
    </div>
  );

  /** Na edição, a cobrança fica na fileira de botões pequenos de sempre. */
  const campoCobrancaCompacto = (
    <div className="space-y-1.5">
      <Label>Como é cobrado *</Label>
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
  );

  /** A conta: o valor de cada unidade e, se já souber, quantas vão ser. */
  const campoValor = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ms_valor">{meta.priceLabel} (R$)</Label>
        <Input
          id="ms_valor"
          value={unitPrice}
          onChange={(e) => setUnitPrice(formatBRLInput(e.target.value))}
          placeholder="0,00"
          className="h-12 text-lg tabular-nums font-semibold sm:h-10 sm:text-base"
          inputMode="decimal"
          autoComplete="off"
        />
      </div>

      {!fechado && (
        <div className="space-y-1.5">
          <Label htmlFor="ms_qtd">
            Quantos {meta.unitPlural}
            {novo || status === "aberta" ? " — se já souber" : " *"}
          </Label>
          <Input
            id="ms_qtd"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="em branco: o operador conta"
            className="h-12 text-lg tabular-nums font-semibold sm:h-10 sm:text-base"
            inputMode="decimal"
            autoComplete="off"
          />
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Pode deixar em branco: quem estiver na máquina diz quantos {meta.unitPlural}{" "}
            levou quando finalizar a OS, e o valor sai daí.
          </p>
        </div>
      )}

      {/* O total, feito na frente de quem digita */}
      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {fechado
            ? "Valor fechado"
            : semQuantidade
              ? `${formatBRL(valor)} por ${meta.unit}`
              : `${formatQty(qtd)} ${qtd === 1 ? meta.unit : meta.unitPlural} × ${formatBRL(valor)}`}
        </span>
        <span className="text-base font-bold tabular-nums text-produmar-700 dark:text-produmar-400">
          {semQuantidade ? "a contar" : formatBRL(total)}
        </span>
      </div>

      <Toggle
        label="Serviço da própria firma"
        hint="Trabalho para a gente mesmo: não tem valor a cobrar, fica fora da receita e é somado à parte."
        ativo={internal}
        onClick={() => {
          const virouInterno = !internal;
          setInternal(virouInterno);
          // serviço da firma não tem o que receber
          if (virouInterno) setPaid(false);
        }}
      />
    </div>
  );

  /** PRA QUEM VAI SER — o motivo de a ficha existir */
  const campoContratante = (
    <div className="space-y-1.5">
      <Label htmlFor="ms_contratante">Contratante — pra quem vai ser</Label>
      {sugestoes.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {sugestoes.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setContratante(c)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
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
        className="h-12 sm:h-10"
        autoComplete="off"
      />
    </div>
  );

  /** O QUE VAI SER FEITO e onde */
  const campoServico = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ms_desc">{novo ? "O que vai ser feito" : "O serviço"}</Label>
        <Input
          id="ms_desc"
          value={description}
          onChange={(e) => setDescription(upperKeepingCaret(e))}
          placeholder={
            kind === "viagem" ? "ex: carradas de areia" : "ex: carregar areia, limpar o terreno"
          }
          autoCapitalize="characters"
          className="h-12 sm:h-10"
          autoComplete="off"
        />
      </div>

      {temTrecho ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ms_origem">De onde</Label>
            <Input
              id="ms_origem"
              value={origin}
              onChange={(e) => setOrigin(upperKeepingCaret(e))}
              placeholder="opcional"
              autoCapitalize="characters"
              className="h-12 sm:h-10"
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
              className="h-12 sm:h-10"
              autoComplete="off"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="ms_destino">Onde vai ser</Label>
          <Input
            id="ms_destino"
            value={destination}
            onChange={(e) => setDestination(upperKeepingCaret(e))}
            placeholder="opcional — ex: fazenda, loteamento"
            autoCapitalize="characters"
            className="h-12 sm:h-10"
            autoComplete="off"
          />
        </div>
      )}
    </div>
  );

  const campoData = (
    <div className="space-y-1.5">
      <Label htmlFor="ms_data">{novo ? "Quando começa" : "Data"}</Label>
      <Input
        id="ms_data"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="h-12 tabular-nums sm:h-10"
      />
      {novo && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          O dia fica verde no calendário da máquina enquanto a OS estiver aberta.
        </p>
      )}
    </div>
  );

  /** ENVIAR PARA — operador, encarregado ou outro admin; a OS cai no celular dele */
  const campoEnviar = (
    <div className="space-y-3">
      {/* Sem ninguém na lista não dá para enviar — e é melhor dizer isso do que
          sumir com o campo sem explicação. */}
      {operators.length === 0 ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Ninguém com login para enviar esta OS. Cadastre a pessoa em
          Configurações → Usuários (papel &quot;operador&quot;, &quot;encarregado&quot;
          ou &quot;admin&quot;) para ela cair no celular dela.
        </p>
      ) : (
        <div className="space-y-1.5">
          <Label>{novo ? "Enviar para o operador" : "Enviar para"}</Label>
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
            Ele recebe esta OS no painel dele e fecha pelo celular: toca em INICIAR ao
            começar e em FINALIZAR ao terminar, contando o que fez.
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
    </div>
  );

  /** O resumo antes de lançar — cada linha volta para a tela dela. */
  const linhasDoResumo: { passo: Passo; titulo: string; valor: string }[] = [
    ...(presetMachineId
      ? []
      : [{ passo: "maquina" as Passo, titulo: "Máquina", valor: machine?.name ?? "—" }]),
    { passo: "cobranca", titulo: "Cobrança", valor: `${meta.label} · ${KIND_HINT[kind]}` },
    {
      passo: "valor",
      titulo: "Valor",
      valor: internal
        ? "Serviço da própria firma"
        : fechado
          ? formatBRL(valor)
          : semQuantidade
            ? `${formatBRL(valor)} por ${meta.unit} — o operador conta`
            : `${formatQty(qtd)} ${qtd === 1 ? meta.unit : meta.unitPlural} × ${formatBRL(valor)} = ${formatBRL(total)}`,
    },
    { passo: "contratante", titulo: "Pra quem", valor: contratante || "—" },
    {
      passo: "servico",
      titulo: "Serviço",
      valor:
        [
          description,
          temTrecho
            ? [origin, destination].filter(Boolean).join(" → ")
            : destination,
        ]
          .filter(Boolean)
          .join(" · ") || "—",
    },
    { passo: "data", titulo: "Começa", valor: date ? formatDate(date) : "—" },
    {
      passo: "enviar",
      titulo: "Operador",
      valor: operators.find((o) => o.id === assignedTo)?.name ?? "Ninguém — fica só aqui",
    },
  ];

  const resumo = (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
        {linhasDoResumo.map((l) => (
          <button
            key={l.passo}
            type="button"
            onClick={() => irPara(passos.indexOf(l.passo))}
            className="w-full flex items-start gap-3 px-3 py-2.5 text-left"
          >
            <span className="w-20 flex-shrink-0 text-[11px] text-slate-400 dark:text-slate-500 pt-0.5">
              {l.titulo}
            </span>
            <span className="flex-1 min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200 break-words">
              {l.valor}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        A OS nasce ABERTA. Toque numa linha para corrigir. Ela fica na ficha do
        veículo — não vira lançamento no módulo Contas.
      </p>
    </div>
  );

  const CORPO_DO_PASSO: Record<Passo, React.ReactNode> = {
    maquina: campoMaquina,
    cobranca: campoCobrancaPasso,
    valor: campoValor,
    contratante: campoContratante,
    servico: campoServico,
    data: campoData,
    enviar: campoEnviar,
    resumo,
  };

  const veiculoTravado = presetMachineId ? (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      Veículo:{" "}
      <span className="font-semibold text-slate-700 dark:text-slate-200">
        {machine?.name ?? "—"}
      </span>
      {machine?.plate ? ` · ${machine.plate}` : ""}
    </p>
  ) : null;

  const caixaDeErro = error && (
    <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
      {error}
    </p>
  );

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

        {novo ? (
          // ── OS NOVA: uma tela por vez ──────────────────────────────────────
          <form onSubmit={handleSubmit} className="space-y-4">
            {veiculoTravado}

            {/* Em que passo está */}
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {passos.map((p, i) => (
                  <span
                    key={p}
                    className={cn(
                      "h-1 flex-1 rounded-full",
                      i <= passoIdx ? "bg-produmar-600" : "bg-slate-200 dark:bg-slate-700"
                    )}
                  />
                ))}
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Passo {passoIdx + 1} de {passos.length}
              </p>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {TITULO_DO_PASSO[passo]}
              </h3>
            </div>

            <div key={passo}>{CORPO_DO_PASSO[passo]}</div>

            {caixaDeErro}

            <DialogFooter className={STICKY_FOOTER}>
              <Button
                type="button"
                variant="outline"
                onClick={() => (passoIdx === 0 ? onClose() : irPara(passoIdx - 1))}
                disabled={isPending}
                className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
              >
                {passoIdx === 0 ? (
                  "Cancelar"
                ) : (
                  <>
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Voltar
                  </>
                )}
              </Button>
              {/* Na tela da cobrança, tocar na opção já avança — o botão some */}
              {passo !== "cobranca" && (
                <Button
                  type="submit"
                  disabled={isPending}
                  className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
                >
                  {isPending ? (
                    "Salvando..."
                  ) : ultimoPasso ? (
                    "Lançar OS"
                  ) : (
                    <>
                      Próximo
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </form>
        ) : (
          // ── OS QUE JÁ EXISTE: tudo na tela, para corrigir ──────────────────
          <form onSubmit={handleSubmit} className="space-y-4">
            {veiculoTravado ?? campoMaquina}
            {campoCobrancaCompacto}
            {campoValor}
            {campoContratante}
            {campoData}

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

            {campoServico}

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

            {campoEnviar}

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              A OS fica aqui, na ficha do veículo — ela não vira lançamento no módulo
              Contas.
            </p>

            {caixaDeErro}

            <DialogFooter className={STICKY_FOOTER}>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                aria-label="Apagar OS"
                className="h-11 px-4 rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 sm:h-10"
              >
                <Trash2 className="w-4 h-4 inline" />
              </button>
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
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        )}
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
