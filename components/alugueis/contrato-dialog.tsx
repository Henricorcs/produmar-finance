"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FileSignature, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  PerguntaDoPasso,
  RevisaoDosPassos,
  ORGAOS_RG,
  juntarRg,
  separarRg,
  usePassoAPasso,
  type PassoDef,
} from "@/components/ui/passo-a-passo";
import { actionError } from "@/lib/action-result";
import {
  cn,
  formatBRLInput,
  localDateISO,
  parseMoney,
  primeiraMaiuscula,
  valorPorExtenso,
} from "@/lib/utils";
import {
  createRentalContract,
  deleteRentalContract,
  updateRentalContract,
} from "@/app/(app)/alugueis/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "./alugueis-shared";
import {
  rentalKindLabel,
  type RentalContractView,
  type RentalProperty,
} from "@/lib/types";

/** "2026-07-30" + 12 meses → "2027-07-30" (o término que o contrato pede). */
function somaMeses(iso: string, meses: number): string {
  if (!iso || !meses) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(y, m - 1 + meses, 1);
  // dia 31 num mês curto cai no último dia daquele mês
  const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(d, ultimo));
  return localDateISO(base);
}

const ESTADOS_CIVIS = ["SOLTEIRO", "CASADO", "DIVORCIADO", "VIÚVO", "UNIÃO ESTÁVEL"];

/** Os campos da tela — os mesmos nomes das colunas do banco. */
type Campo =
  | "property_id"
  | "tenant_name"
  | "tenant_document"
  | "tenant_rg"
  /** Só na tela: o órgão do RG é perguntado à parte e gravado junto do número. */
  | "tenant_rg_orgao"
  | "tenant_birthplace"
  | "tenant_marital_status"
  | "tenant_profession"
  | "tenant_street"
  | "tenant_number"
  | "tenant_complement"
  | "tenant_district"
  | "tenant_city"
  | "tenant_zip"
  | "tenant_phone"
  | "monthly_amount"
  | "due_day"
  | "deposit_amount"
  | "purpose"
  | "start_date"
  | "months"
  | "end_date"
  | "signed_at"
  | "guarantor_name"
  | "guarantor_document"
  | "guarantor_rg"
  | "guarantor_rg_orgao"
  | "guarantor_phone"
  | "guarantor_street"
  | "guarantor_number"
  | "guarantor_complement"
  | "guarantor_district"
  | "guarantor_city"
  | "guarantor_zip"
  | "notes";

type Dados = Record<Campo, string>;
type Passo = PassoDef<Campo>;

const temFiador = (d: Dados) => !!d.guarantor_name.trim();

/** Nenhuma parte do endereço preenchida (rua, número, bairro...). */
function semPartes(d: Dados, quem: "tenant" | "guarantor"): boolean {
  return (["street", "number", "complement", "district", "city", "zip"] as const).every(
    (k) => !d[`${quem}_${k}` as Campo].trim()
  );
}

/**
 * Contrato salvo antes da 113 tem o endereço num texto só. Ele continua
 * valendo — a pergunta da rua lembra qual é, até alguém preencher as partes.
 */
function lembreteEndereco(antigo?: string | null, rua?: string | null): string | undefined {
  if (!antigo?.trim() || rua?.trim()) return undefined;
  return `Endereço que está no contrato hoje: ${antigo.trim()}. Ele continua valendo até você preencher as partes.`;
}

function dadosIniciais(c: RentalContractView | null, presetPropertyId?: string | null): Dados {
  const s = (v?: string | number | null) => (v === null || v === undefined ? "" : String(v));
  return {
    property_id: c?.property_id ?? presetPropertyId ?? "",
    tenant_name: s(c?.tenant_name),
    tenant_document: s(c?.tenant_document),
    tenant_rg: separarRg(c?.tenant_rg).numero,
    tenant_rg_orgao: separarRg(c?.tenant_rg).orgao,
    tenant_birthplace: s(c?.tenant_birthplace),
    tenant_marital_status: s(c?.tenant_marital_status),
    tenant_profession: s(c?.tenant_profession),
    // contrato salvo antes da 113: o endereço corrido continua valendo (ver salvar)
    tenant_street: s(c?.tenant_street),
    tenant_number: s(c?.tenant_number),
    tenant_complement: s(c?.tenant_complement),
    tenant_district: s(c?.tenant_district),
    tenant_city: s(c?.tenant_city),
    tenant_zip: s(c?.tenant_zip),
    tenant_phone: s(c?.tenant_phone),
    monthly_amount: c ? formatBRLInput(Number(c.monthly_amount)) : "",
    due_day: s(c?.due_day ?? 5),
    deposit_amount:
      c && Number(c.deposit_amount) > 0 ? formatBRLInput(Number(c.deposit_amount)) : "",
    purpose: c?.purpose ?? "residencial",
    start_date: c?.start_date ?? localDateISO(),
    months: c ? s(c.months) : "12",
    end_date: c ? s(c.end_date) : somaMeses(localDateISO(), 12),
    signed_at: c ? s(c.signed_at) : localDateISO(),
    guarantor_name: s(c?.guarantor_name),
    guarantor_document: s(c?.guarantor_document),
    guarantor_rg: separarRg(c?.guarantor_rg).numero,
    guarantor_rg_orgao: separarRg(c?.guarantor_rg).orgao,
    guarantor_phone: s(c?.guarantor_phone),
    guarantor_street: s(c?.guarantor_street),
    guarantor_number: s(c?.guarantor_number),
    guarantor_complement: s(c?.guarantor_complement),
    guarantor_district: s(c?.guarantor_district),
    guarantor_city: s(c?.guarantor_city),
    guarantor_zip: s(c?.guarantor_zip),
    notes: s(c?.notes),
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Contrato em edição — null cadastra um novo. */
  contrato: RentalContractView | null;
  /** Imóvel já escolhido (veio da ficha dele). */
  presetPropertyId?: string | null;
  properties: RentalProperty[];
}

/**
 * O CONTRATO DE LOCAÇÃO — preenchido UM CAMPO POR VEZ.
 *
 * O que se pergunta é exatamente o que estava escrito à mão no contrato de
 * vocês: o inquilino com RG, CPF, naturalidade, estado civil e profissão; onde
 * ele mora, em partes; o valor, o vencimento e o prazo; o fiador, quando tem.
 * Responde, toca em "seguinte" e aparece a próxima pergunta; no fim, a revisão.
 * Contrato já cadastrado abre direto na revisão.
 */
export function ContratoDialog({
  open,
  onClose,
  contrato,
  presetPropertyId,
  properties,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<Dados>(() => dadosIniciais(null));
  const [encerrado, setEncerrado] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDados(dadosIniciais(contrato, presetPropertyId));
    setEncerrado(contrato?.status === "encerrado");
    setErro(null);
  }, [open, contrato, presetPropertyId]);

  /** O nome do imóvel do jeito que a lista mostra. */
  function nomeDoImovel(id: string): string {
    const p = properties.find((x) => x.id === id);
    return p ? `nº ${p.code} · ${p.name || p.street || rentalKindLabel(p.kind)}` : "";
  }

  const PASSOS = useMemo<Passo[]>(
    () => [
      // ── O imóvel (some quando o contrato foi aberto de dentro do imóvel) ──
      {
        campo: "property_id",
        secao: "O imóvel",
        pergunta: "Qual imóvel está sendo alugado?",
        tipo: "especial",
        obrigatorio: true,
        quando: () => !presetPropertyId,
        mostrar: nomeDoImovel,
        especial: (valor, mudar, avancar) => (
          <SearchableSelect
            items={properties}
            value={valor}
            onChange={(id) => {
              mudar(id);
              if (id) setTimeout(avancar, 150);
            }}
            getId={(p) => p.id}
            getLabel={(p) => `nº ${p.code} · ${p.name || p.street || rentalKindLabel(p.kind)}`}
            placeholder="Escolha o imóvel"
            searchPlaceholder="Buscar pelo código, apelido ou rua..."
            emptyMessage="Nenhum imóvel cadastrado"
          />
        ),
      },

      // ── O inquilino ───────────────────────────────────────────────────────
      { campo: "tenant_name", secao: "O inquilino", pergunta: "Nome completo do inquilino", tipo: "texto", maiusculo: true, obrigatorio: true },
      { campo: "tenant_document", secao: "O inquilino", pergunta: "CPF ou CNPJ do inquilino", tipo: "documento", placeholder: "000.000.000-00" },
      { campo: "tenant_rg", secao: "O inquilino", pergunta: "Número do RG do inquilino", tipo: "texto", teclado: "numerico", placeholder: "ex: 326785949" },
      { campo: "tenant_rg_orgao", secao: "O inquilino", pergunta: "Órgão expedidor do RG", tipo: "texto", maiusculo: true, atalhos: ORGAOS_RG, placeholder: "ex: SSP/MA" },
      { campo: "tenant_birthplace", secao: "O inquilino", pergunta: "Naturalidade", tipo: "texto", placeholder: "ex: VARGEM GRANDE/MA", maiusculo: true },
      { campo: "tenant_marital_status", secao: "O inquilino", pergunta: "Estado civil", tipo: "opcoes", opcoes: ESTADOS_CIVIS },
      { campo: "tenant_profession", secao: "O inquilino", pergunta: "Profissão do inquilino", tipo: "texto", placeholder: "ex: mecânico", maiusculo: true },

      // ── Onde o inquilino mora hoje ────────────────────────────────────────
      { campo: "tenant_street", secao: "Onde o inquilino mora hoje", pergunta: "Rua ou avenida", tipo: "texto", placeholder: "ex: RUA DAS FLORES", maiusculo: true, dica: lembreteEndereco(contrato?.tenant_address, contrato?.tenant_street) },
      { campo: "tenant_number", secao: "Onde o inquilino mora hoje", pergunta: "Número", tipo: "texto", teclado: "numerico", atalhos: ["S/N"], placeholder: "ex: 120", maiusculo: true },
      { campo: "tenant_complement", secao: "Onde o inquilino mora hoje", pergunta: "Complemento", tipo: "texto", placeholder: "opcional — casa B, apto 3...", maiusculo: true },
      { campo: "tenant_district", secao: "Onde o inquilino mora hoje", pergunta: "Bairro", tipo: "texto", maiusculo: true },
      { campo: "tenant_city", secao: "Onde o inquilino mora hoje", pergunta: "Cidade / UF", tipo: "texto", placeholder: "ex: SÃO MATEUS DO MARANHÃO/MA", maiusculo: true },
      { campo: "tenant_zip", secao: "Onde o inquilino mora hoje", pergunta: "CEP", tipo: "cep", placeholder: "00000-000" },
      { campo: "tenant_phone", secao: "Onde o inquilino mora hoje", pergunta: "Telefone do inquilino", tipo: "telefone", placeholder: "opcional" },

      // ── O aluguel ─────────────────────────────────────────────────────────
      { campo: "monthly_amount", secao: "O aluguel", pergunta: "Valor do aluguel (R$)", tipo: "dinheiro", placeholder: "0,00", obrigatorio: true },
      { campo: "due_day", secao: "O aluguel", pergunta: "Vence todo dia", tipo: "numero", maxDigitos: 2, placeholder: "5", dica: "Num mês mais curto, cai no último dia." },
      { campo: "deposit_amount", secao: "O aluguel", pergunta: "Caução (R$)", tipo: "dinheiro", placeholder: "opcional" },
      {
        campo: "purpose",
        secao: "O aluguel",
        pergunta: "Uso do imóvel",
        tipo: "opcoes",
        opcoes: [
          { valor: "residencial", label: "Residencial" },
          { valor: "comercial", label: "Comercial" },
        ],
        dica: "É o que a cláusula sexta do contrato diz sobre o uso.",
      },

      // ── O prazo ───────────────────────────────────────────────────────────
      { campo: "start_date", secao: "O prazo", pergunta: "Início da locação", tipo: "data", obrigatorio: true },
      { campo: "months", secao: "O prazo", pergunta: "Prazo (em meses)", tipo: "numero", maxDigitos: 3, placeholder: "12", mostrar: (v) => `${v} meses` },
      { campo: "end_date", secao: "O prazo", pergunta: "Término", tipo: "data", dica: "Sai sozinho da conta início + prazo. Dá para corrigir na mão." },
      { campo: "signed_at", secao: "O prazo", pergunta: "Data da assinatura", tipo: "data" },

      // ── O fiador (quando tem) ─────────────────────────────────────────────
      { campo: "guarantor_name", secao: "O fiador", pergunta: "Nome do fiador", tipo: "texto", maiusculo: true, placeholder: "não tem fiador? toque em Pular" },
      { campo: "guarantor_document", secao: "O fiador", pergunta: "CPF do fiador", tipo: "documento", placeholder: "000.000.000-00", quando: temFiador },
      { campo: "guarantor_rg", secao: "O fiador", pergunta: "Número do RG do fiador", tipo: "texto", teclado: "numerico", placeholder: "ex: 123456789", quando: temFiador },
      { campo: "guarantor_rg_orgao", secao: "O fiador", pergunta: "Órgão expedidor do RG do fiador", tipo: "texto", maiusculo: true, atalhos: ORGAOS_RG, placeholder: "ex: SSP/MA", quando: temFiador },
      { campo: "guarantor_phone", secao: "O fiador", pergunta: "Telefone do fiador", tipo: "telefone", placeholder: "opcional", quando: temFiador },
      { campo: "guarantor_street", secao: "Onde o fiador mora", pergunta: "Rua ou avenida", tipo: "texto", placeholder: "ex: RUA DAS FLORES", maiusculo: true, quando: temFiador, dica: lembreteEndereco(contrato?.guarantor_address, contrato?.guarantor_street) },
      { campo: "guarantor_number", secao: "Onde o fiador mora", pergunta: "Número", tipo: "texto", teclado: "numerico", atalhos: ["S/N"], placeholder: "ex: 120", maiusculo: true, quando: temFiador },
      { campo: "guarantor_complement", secao: "Onde o fiador mora", pergunta: "Complemento", tipo: "texto", placeholder: "opcional", maiusculo: true, quando: temFiador },
      { campo: "guarantor_district", secao: "Onde o fiador mora", pergunta: "Bairro", tipo: "texto", maiusculo: true, quando: temFiador },
      { campo: "guarantor_city", secao: "Onde o fiador mora", pergunta: "Cidade / UF", tipo: "texto", placeholder: "ex: SÃO MATEUS DO MARANHÃO/MA", maiusculo: true, quando: temFiador },
      { campo: "guarantor_zip", secao: "Onde o fiador mora", pergunta: "CEP", tipo: "cep", placeholder: "00000-000", quando: temFiador },

      // ── Observação ────────────────────────────────────────────────────────
      { campo: "notes", secao: "Observação", pergunta: "Alguma observação?", tipo: "longo", placeholder: "opcional" },
    ],
    // `nomeDoImovel` lê `properties`, que já está na lista
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [presetPropertyId, properties, contrato]
  );

  const fluxo = usePassoAPasso(PASSOS, dados, open, !!contrato);
  const { passo, passos, idx } = fluxo;

  function mudar(campo: Campo, valor: string) {
    setDados((d) => {
      const novo = { ...d, [campo]: valor };
      // o término acompanha o início e o prazo (e continua corrigível na mão)
      if (campo === "start_date" || campo === "months") {
        const fim = somaMeses(novo.start_date, parseInt(novo.months, 10) || 0);
        if (fim) novo.end_date = fim;
      }
      return novo;
    });
  }

  function salvar() {
    setErro(null);
    if (fluxo.faltando.length > 0) {
      setErro(`Falta preencher: ${fluxo.faltando.map((p) => p.pergunta.toLowerCase()).join(", ")}`);
      return;
    }
    const fiador = temFiador(dados);
    startTransition(async () => {
      const input = {
        ...dados,
        // endereço corrido antigo: as partes passam a valer
        // endereço corrido antigo vale até alguém preencher as partes
        tenant_address: semPartes(dados, "tenant") ? contrato?.tenant_address ?? null : null,
        guarantor_address:
          fiador && semPartes(dados, "guarantor") ? contrato?.guarantor_address ?? null : null,
        guarantor_document: fiador ? dados.guarantor_document : "",
        // o RG volta a ser um campo só: "326785949 SEJUSP/MA"
        tenant_rg: juntarRg(dados.tenant_rg, dados.tenant_rg_orgao),
        guarantor_rg: fiador ? juntarRg(dados.guarantor_rg, dados.guarantor_rg_orgao) : "",
        guarantor_phone: fiador ? dados.guarantor_phone : "",
        guarantor_street: fiador ? dados.guarantor_street : "",
        guarantor_number: fiador ? dados.guarantor_number : "",
        guarantor_complement: fiador ? dados.guarantor_complement : "",
        guarantor_district: fiador ? dados.guarantor_district : "",
        guarantor_city: fiador ? dados.guarantor_city : "",
        guarantor_zip: fiador ? dados.guarantor_zip : "",
        monthly_amount: parseMoney(dados.monthly_amount),
        due_day: parseInt(dados.due_day, 10) || 5,
        deposit_amount: parseMoney(dados.deposit_amount),
        months: parseInt(dados.months, 10) || null,
        status: encerrado ? ("encerrado" as const) : ("ativo" as const),
      };
      const r = contrato
        ? await updateRentalContract(contrato.id, input)
        : await createRentalContract(input);
      const falha = actionError(r);
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  function apagar() {
    if (!contrato) return;
    if (
      !confirm(
        `Apagar o contrato de ${contrato.tenant_name}? Os pagamentos lançados nele vão junto, e isso não tem volta.`
      )
    )
      return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await deleteRentalContract(contrato.id));
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  const valorAluguel = parseMoney(dados.monthly_amount);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              <FileSignature className="w-4 h-4" />
            </span>
            {fluxo.naRevisao
              ? "Revisar o contrato"
              : contrato
                ? "Editar contrato"
                : "Novo contrato"}
          </DialogTitle>
        </DialogHeader>

        {passo ? (
          <PerguntaDoPasso
            passo={passo}
            idx={idx}
            total={passos.length}
            valor={dados[passo.campo]}
            onMudar={(v) => mudar(passo.campo, v)}
            onAvancar={fluxo.avancar}
            onVoltar={fluxo.voltar}
            onRevisao={fluxo.irParaRevisao}
            daRevisao={fluxo.daRevisao}
            extra={
              passo.campo === "monthly_amount" && valorAluguel > 0 ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {primeiraMaiuscula(valorPorExtenso(valorAluguel))} — é assim que sai no
                  contrato.
                </p>
              ) : null
            }
            rodape="Só o imóvel, o nome do inquilino, o valor e o início são obrigatórios. O que ficar em branco sai no papel como linha para completar à caneta."
          />
        ) : (
          <div className="space-y-4">
            <RevisaoDosPassos
              passos={passos}
              dados={dados}
              onEditar={fluxo.editar}
              topo={
                <>
                  {presetPropertyId && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Imóvel:{" "}
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {nomeDoImovel(presetPropertyId) || "—"}
                      </span>
                    </p>
                  )}
                  {/* contrato de antes da 113: o endereço antigo segue valendo */}
                  {contrato?.tenant_address?.trim() && semPartes(dados, "tenant") && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400">
                      Endereço do inquilino no contrato hoje: {contrato.tenant_address}. Ele continua
                      valendo até você preencher rua, número e bairro.
                    </p>
                  )}
                </>
              }
            />

            {contrato && (
              <button
                type="button"
                onClick={() => setEncerrado((v) => !v)}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2.5 transition-colors",
                  encerrado
                    ? "bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-600"
                    : "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700"
                )}
              >
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {encerrado ? "Contrato encerrado" : "Contrato ativo"}
                </span>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Encerrado para de gerar aluguel no mês; o histórico fica. Toque para trocar.
                </p>
              </button>
            )}

            {erro && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {erro}
              </p>
            )}

            <DialogFooter className={STICKY_FOOTER}>
              {contrato && (
                <button
                  type="button"
                  onClick={apagar}
                  disabled={isPending}
                  aria-label="Apagar contrato"
                  className="h-11 px-4 rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 sm:h-10"
                >
                  <Trash2 className="w-4 h-4 inline" />
                </button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={fluxo.voltar}
                disabled={isPending}
                className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
              >
                Voltar
              </Button>
              <Button
                type="button"
                onClick={salvar}
                disabled={isPending}
                className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
              >
                {isPending ? "Salvando..." : contrato ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
