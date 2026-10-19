"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Trash2, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  PerguntaDoPasso,
  RevisaoDosPassos,
  usePassoAPasso,
  type PassoDef,
} from "@/components/ui/passo-a-passo";
import { actionError } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { apagarComprador, salvarComprador } from "@/app/(app)/alugueis/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "./alugueis-shared";
import type { PropertyBuyer } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// CADASTRO DE COMPRADOR (migration 115) — outra empresa ou uma pessoa física
// ─────────────────────────────────────────────────────────────────────────────
// Aberto de dentro do contrato de compra e venda, na pergunta "Quem compra?".
// Também uma pergunta por vez. A empresa pede quem assina por ela; a pessoa
// física pede RG, estado civil e profissão. Salvo, o comprador já volta
// escolhido no contrato.
// ─────────────────────────────────────────────────────────────────────────────

const ESTADOS_CIVIS = ["SOLTEIRO", "CASADO", "UNIÃO ESTÁVEL", "DIVORCIADO", "VIÚVO"];

const REGIMES = [
  "COMUNHÃO PARCIAL DE BENS",
  "COMUNHÃO UNIVERSAL DE BENS",
  "SEPARAÇÃO TOTAL DE BENS",
  "PARTICIPAÇÃO FINAL NOS AQUESTOS",
];

type Campo =
  | "kind"
  | "name"
  | "gender"
  | "document"
  | "rg"
  | "nationality"
  | "marital_status"
  | "property_regime"
  | "profession"
  | "street"
  | "number"
  | "complement"
  | "district"
  | "city"
  | "zip"
  | "phone"
  | "email"
  | "rep_name"
  | "rep_role"
  | "rep_document"
  | "rep_rg";

type Dados = Record<Campo, string>;
type Passo = PassoDef<Campo>;

const pf = (d: Dados) => d.kind === "pf";
const pj = (d: Dados) => d.kind === "pj";

function dadosIniciais(b: PropertyBuyer | null): Dados {
  const s = (v?: string | null) => v ?? "";
  return {
    kind: b?.kind ?? "pf",
    name: s(b?.name),
    gender: s(b?.gender),
    document: s(b?.document),
    rg: s(b?.rg),
    nationality: b ? s(b.nationality) : "BRASILEIRA",
    marital_status: s(b?.marital_status),
    property_regime: s(b?.property_regime),
    profession: s(b?.profession),
    street: s(b?.street),
    number: s(b?.number),
    complement: s(b?.complement),
    district: s(b?.district),
    city: s(b?.city),
    zip: s(b?.zip),
    phone: s(b?.phone),
    email: s(b?.email),
    rep_name: s(b?.rep_name),
    rep_role: s(b?.rep_role),
    rep_document: s(b?.rep_document),
    rep_rg: s(b?.rep_rg),
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Comprador em edição — null cadastra um novo. */
  comprador: PropertyBuyer | null;
  /** Salvou: devolve o comprador do jeito que ficou, para já entrar escolhido. */
  onSalvo: (b: PropertyBuyer) => void;
  /** Apagou: quem abriu tira ele da lista. */
  onApagado?: (id: string) => void;
}

export function CompradorDialog({ open, onClose, comprador, onSalvo, onApagado }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<Dados>(() => dadosIniciais(null));

  useEffect(() => {
    if (!open) return;
    setDados(dadosIniciais(comprador));
    setErro(null);
  }, [open, comprador]);

  const PASSOS = useMemo<Passo[]>(
    () => [
      {
        campo: "kind",
        secao: "Quem compra",
        pergunta: "O comprador é empresa ou pessoa física?",
        tipo: "opcoes",
        opcoes: [
          { valor: "pj", label: "Empresa" },
          { valor: "pf", label: "Pessoa física" },
        ],
      },
      { campo: "name", secao: "Quem compra", pergunta: "Razão social da empresa", tipo: "texto", maiusculo: true, obrigatorio: true, quando: pj },
      { campo: "name", secao: "Quem compra", pergunta: "Nome completo do comprador", tipo: "texto", maiusculo: true, obrigatorio: true, quando: pf },
      {
        campo: "gender",
        secao: "Quem compra",
        pergunta: "O comprador é homem ou mulher?",
        tipo: "opcoes",
        opcoes: [
      { valor: "m", label: "Homem" },
      { valor: "f", label: "Mulher" },
    ],
        dica: "É o que decide, no contrato, entre \"COMPRADOR\" e \"COMPRADORA\".",
        quando: pf,
      },
      { campo: "document", secao: "Quem compra", pergunta: "CNPJ da empresa", tipo: "documento", placeholder: "00.000.000/0000-00", quando: pj },
      { campo: "document", secao: "Quem compra", pergunta: "CPF do comprador", tipo: "documento", placeholder: "000.000.000-00", quando: pf },
      { campo: "rg", secao: "Quem compra", pergunta: "RG do comprador", tipo: "texto", placeholder: "número e órgão (ex: 123456 SSP/MA)", maiusculo: true, quando: pf },
      { campo: "nationality", secao: "Quem compra", pergunta: "Nacionalidade", tipo: "texto", maiusculo: true, quando: pf },
      { campo: "marital_status", secao: "Quem compra", pergunta: "Estado civil", tipo: "opcoes", opcoes: ESTADOS_CIVIS, quando: pf },
      {
        campo: "property_regime",
        secao: "Quem compra",
        pergunta: "Regime de bens do casamento",
        tipo: "opcoes",
        opcoes: REGIMES,
        quando: (d) => pf(d) && (d.marital_status === "CASADO" || d.marital_status === "UNIÃO ESTÁVEL"),
      },
      { campo: "profession", secao: "Quem compra", pergunta: "Profissão", tipo: "texto", maiusculo: true, quando: pf },

      // ── Endereço (sede da empresa ou onde a pessoa mora) ──────────────────
      { campo: "street", secao: "Endereço", pergunta: "Rua ou avenida", tipo: "texto", placeholder: "ex: RUA DAS FLORES", maiusculo: true },
      { campo: "number", secao: "Endereço", pergunta: "Número", tipo: "texto", teclado: "numerico", atalhos: ["S/N"], placeholder: "ex: 120", maiusculo: true },
      { campo: "complement", secao: "Endereço", pergunta: "Complemento", tipo: "texto", placeholder: "opcional — sala, apto...", maiusculo: true },
      { campo: "district", secao: "Endereço", pergunta: "Bairro", tipo: "texto", maiusculo: true },
      { campo: "city", secao: "Endereço", pergunta: "Cidade / UF", tipo: "texto", placeholder: "ex: SÃO MATEUS DO MARANHÃO/MA", maiusculo: true },
      { campo: "zip", secao: "Endereço", pergunta: "CEP", tipo: "cep", placeholder: "00000-000" },
      { campo: "phone", secao: "Endereço", pergunta: "Telefone", tipo: "telefone", placeholder: "opcional" },
      { campo: "email", secao: "Endereço", pergunta: "E-mail", tipo: "email", placeholder: "opcional" },

      // ── Quem assina pela empresa ──────────────────────────────────────────
      { campo: "rep_name", secao: "Quem assina pela empresa", pergunta: "Nome de quem assina", tipo: "texto", maiusculo: true, quando: pj },
      {
        campo: "rep_role",
        secao: "Quem assina pela empresa",
        pergunta: "Cargo de quem assina",
        tipo: "texto",
        maiusculo: true,
        atalhos: ["SÓCIO ADMINISTRADOR", "SÓCIA ADMINISTRADORA", "DIRETOR", "PROCURADOR"],
        quando: pj,
      },
      { campo: "rep_document", secao: "Quem assina pela empresa", pergunta: "CPF de quem assina", tipo: "documento", placeholder: "000.000.000-00", quando: pj },
      { campo: "rep_rg", secao: "Quem assina pela empresa", pergunta: "RG de quem assina", tipo: "texto", placeholder: "número e órgão", maiusculo: true, quando: pj },
    ],
    []
  );

  const fluxo = usePassoAPasso(PASSOS, dados, open, !!comprador);
  const { passo, passos, idx } = fluxo;

  function mudar(campo: Campo, valor: string) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  function salvar() {
    setErro(null);
    if (fluxo.faltando.length > 0) {
      setErro(`Falta preencher: ${fluxo.faltando.map((p) => p.pergunta.toLowerCase()).join(", ")}`);
      return;
    }
    const kind = dados.kind === "pj" ? ("pj" as const) : ("pf" as const);
    startTransition(async () => {
      const r = await salvarComprador(comprador?.id ?? null, { ...dados, kind });
      const falha = actionError(r);
      if (falha || !r || "error" in r) {
        setErro(falha ?? "Erro ao salvar o comprador");
        return;
      }
      const agora = new Date().toISOString();
      const maiusc = (v: string) => (v.trim() ? v.trim().toUpperCase() : null);
      onSalvo({
        id: r.id,
        kind,
        name: dados.name.trim().toUpperCase(),
        gender: kind === "pf" && (dados.gender === "m" || dados.gender === "f") ? dados.gender : null,
        document: dados.document.trim() || null,
        rg: kind === "pf" ? maiusc(dados.rg) : null,
        nationality: kind === "pf" ? maiusc(dados.nationality) : null,
        marital_status: kind === "pf" ? maiusc(dados.marital_status) : null,
        property_regime: kind === "pf" ? maiusc(dados.property_regime) : null,
        profession: kind === "pf" ? maiusc(dados.profession) : null,
        street: maiusc(dados.street),
        number: maiusc(dados.number),
        complement: maiusc(dados.complement),
        district: maiusc(dados.district),
        city: maiusc(dados.city),
        zip: dados.zip.trim() || null,
        phone: dados.phone.trim() || null,
        email: dados.email.trim() || null,
        rep_name: kind === "pj" ? maiusc(dados.rep_name) : null,
        rep_document: kind === "pj" ? dados.rep_document.trim() || null : null,
        rep_rg: kind === "pj" ? maiusc(dados.rep_rg) : null,
        rep_role: kind === "pj" ? maiusc(dados.rep_role) : null,
        created_by: comprador?.created_by ?? null,
        created_at: comprador?.created_at ?? agora,
        updated_at: agora,
      });
      onClose();
    });
  }

  function apagar() {
    if (!comprador) return;
    if (!confirm(`Apagar o comprador ${comprador.name}? Isso não tem volta.`)) return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await apagarComprador(comprador.id));
      if (falha) {
        setErro(falha);
        return;
      }
      onApagado?.(comprador.id);
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400">
              <UserPlus className="w-4 h-4" />
            </span>
            {fluxo.naRevisao ? "Revisar o comprador" : comprador ? "Editar comprador" : "Novo comprador"}
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
            rodape="Só o nome é obrigatório. O que ficar em branco não sai no contrato."
          />
        ) : (
          <div className="space-y-4">
            <RevisaoDosPassos passos={passos} dados={dados} onEditar={fluxo.editar} />

            {erro && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {erro}
              </p>
            )}

            <DialogFooter className={STICKY_FOOTER}>
              {comprador && (
                <button
                  type="button"
                  onClick={apagar}
                  disabled={isPending}
                  aria-label="Apagar comprador"
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
                {isPending ? "Salvando..." : "Salvar comprador"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
