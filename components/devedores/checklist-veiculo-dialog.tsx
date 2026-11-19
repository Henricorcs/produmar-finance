"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Car, Check, ChevronRight, Pencil, Plus, Printer, Search, Trash2, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { valoresUsados } from "@/components/ui/campo-com-sugestoes";
import {
  ORGAOS_RG,
  PerguntaDoPasso,
  RevisaoDosPassos,
  juntarRg,
  separarRg,
  usePassoAPasso,
  type PassoDef,
} from "@/components/ui/passo-a-passo";
import { salvarChecklistVeiculo, excluirChecklistVeiculo } from "@/app/(app)/devedores/actions";
import { cn, formatDate, localDateISO, mascaraCpfCnpj, mascaraTelefone } from "@/lib/utils";
import { enderecoDoDevedor } from "@/lib/devedor-endereco";
import { CIDADE_DA_CONFISSAO } from "@/lib/confissao-divida";
import { STICKY_FOOTER, FOOTER_CANCEL, FOOTER_SUBMIT } from "@/components/frota/frota-shared";
import { CompartilharPdf } from "@/components/ui/compartilhar-pdf";
import { gerarChecklistVeiculoPdf } from "@/lib/checklist-veiculo-pdf";
import type { ChecklistParaFolha } from "@/lib/checklist-veiculo";
import type { VehicleDeliveryChecklist } from "@/lib/types";
import type { LoanWithDetails } from "@/app/(app)/devedores/page";

/** Um veículo da frota (tabela machines): a placa e o nome. */
export interface VeiculoDaFrota {
  id: string;
  name: string;
  plate: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  dividas: LoanWithDetails[];
  checklists: VehicleDeliveryChecklist[];
  veiculos: VeiculoDaFrota[];
  /** CPF/CNPJ (só dígitos) → RG dado em outro cadastro (aluguéis, compradores). */
  rgsPorDocumento?: Record<string, string>;
}

/** Um devedor da lista — a dívida mais recente dele é de onde vêm os dados. */
interface DevedorDaLista {
  chave: string;
  loanId: string;
  nome: string;
  documento: string;
  rg: string;
  endereco: string;
  telefone: string;
}

/** As respostas, uma por etapa. "devedor" = a chave do devedor escolhido na lista. */
type Campo =
  | "devedor"
  | "buyer_name"
  | "buyer_document"
  | "buyer_rg"
  | "buyer_rg_orgao"
  | "buyer_address"
  | "buyer_phone"
  | "vehicle_model"
  | "vehicle_plate"
  | "vehicle_year"
  | "vehicle_color"
  | "vehicle_chassis"
  | "vehicle_renavam"
  | "vehicle_km"
  | "delivery_date"
  | "delivery_place"
  | "notes";

type Dados = Record<Campo, string>;

const VAZIO: Dados = {
  devedor: "",
  buyer_name: "",
  buyer_document: "",
  buyer_rg: "",
  buyer_rg_orgao: "",
  buyer_address: "",
  buyer_phone: "",
  vehicle_model: "",
  vehicle_plate: "",
  vehicle_year: "",
  vehicle_color: "",
  vehicle_chassis: "",
  vehicle_renavam: "",
  vehicle_km: "",
  delivery_date: "",
  delivery_place: "",
  notes: "",
};

/** "abc1d23" → "ABC1D23"; "abc1234" → "ABC-1234" (placa antiga com hífen). */
function mascaraPlaca(s: string): string {
  const t = s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  return /^[A-Z]{3}\d{4}$/.test(t) ? `${t.slice(0, 3)}-${t.slice(3)}` : t;
}

const soLetrasENumeros = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** O nome sem acento e sem espaço sobrando: "ANTÔNIO" e "ANTONIO" são o mesmo. */
const nomeLimpo = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/**
 * CHECKLIST DE ENTREGA DE VEÍCULO — a folha que o comprador assina quando
 * recebe o veículo vendido. Preenche-se POR ETAPAS, uma pergunta por tela
 * (pedido do dono: todo formulário é assim): primeiro escolher o devedor da
 * lista (puxa nome, CPF, RG, endereço e telefone e pula para o veículo) ou
 * digitar o comprador, depois o veículo e a entrega, e no fim a revisão.
 * Os itens Sim/Não saem em branco na folha, para marcar à caneta.
 */
export function ChecklistVeiculoDialog({
  open,
  onClose,
  dividas,
  checklists,
  veiculos,
  rgsPorDocumento = {},
}: Props) {
  const [isPending, startTransition] = useTransition();
  /** "lista" = os já feitos; "form" = as etapas; "pronto" = salvo, imprimir. */
  const [tela, setTela] = useState<"lista" | "form" | "pronto">("lista");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [dados, setDados] = useState<Dados>(VAZIO);
  /** Abriu um já feito: começa na revisão, que corrige com um toque. */
  const [comecarNaRevisao, setComecarNaRevisao] = useState(false);
  const [salvoId, setSalvoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Os devedores cadastrados, um por pessoa, com os dados da dívida mais recente. */
  const devedores = useMemo(() => {
    const vistos = new Map<string, DevedorDaLista>();
    // com CPF antes de sem CPF, e a mais recente primeiro — a dívida sem CPF
    // da mesma pessoa não vira uma segunda linha na lista
    const ordenadas = [...dividas].sort((a, b) => {
      const ca = a.borrower_document?.trim() ? 0 : 1;
      const cb = b.borrower_document?.trim() ? 0 : 1;
      return ca - cb || (a.loan_date < b.loan_date ? 1 : -1);
    });
    /** Nome limpo → chave da pessoa (o CPF), para juntar a dívida sem CPF a ela. */
    const chaveDoNome = new Map<string, string>();
    for (const l of ordenadas) {
      const doc = (l.borrower_document ?? "").replace(/\D/g, "");
      const nome = nomeLimpo(l.borrower_name);
      if (!nome) continue;
      const chave = doc || chaveDoNome.get(nome) || nome;
      if (!chaveDoNome.has(nome)) chaveDoNome.set(nome, chave);
      const daDivida = {
        rg: l.borrower_rg?.trim() ?? "",
        endereco: enderecoDoDevedor(l),
        telefone: mascaraTelefone(l.borrower_phone ?? ""),
      };
      const ja = vistos.get(chave);
      if (ja) {
        // a mesma pessoa em outra dívida: completa o que a primeira não tinha
        // (o RG dado numa dívida antiga vale para a nova)
        if (!ja.rg) ja.rg = daDivida.rg;
        if (!ja.endereco) ja.endereco = daDivida.endereco;
        if (!ja.telefone) ja.telefone = daDivida.telefone;
        continue;
      }
      vistos.set(chave, {
        chave,
        loanId: l.id,
        nome: l.borrower_name.trim(),
        documento: mascaraCpfCnpj(l.borrower_document ?? ""),
        ...daDivida,
      });
    }
    // sem RG em nenhuma dívida: o que a pessoa deu em outro cadastro, pelo CPF
    for (const d of vistos.values()) {
      if (!d.rg) d.rg = rgsPorDocumento[d.documento.replace(/\D/g, "")] ?? "";
    }
    return Array.from(vistos.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [dividas, rgsPorDocumento]);

  function novo() {
    setEditandoId(null);
    setDados({ ...VAZIO, delivery_date: localDateISO(), delivery_place: CIDADE_DA_CONFISSAO.toUpperCase() });
    setComecarNaRevisao(false);
    setError(null);
    setTela("form");
  }

  function editar(c: VehicleDeliveryChecklist) {
    const rg = separarRg(c.buyer_rg);
    setEditandoId(c.id);
    setDados({
      devedor: devedores.find((d) => d.loanId === c.loan_id)?.chave ?? "",
      buyer_name: c.buyer_name,
      buyer_document: c.buyer_document ?? "",
      buyer_rg: rg.numero,
      buyer_rg_orgao: rg.orgao,
      buyer_address: c.buyer_address ?? "",
      buyer_phone: c.buyer_phone ?? "",
      vehicle_model: c.vehicle_model ?? "",
      vehicle_plate: c.vehicle_plate ?? "",
      vehicle_year: c.vehicle_year ?? "",
      vehicle_color: c.vehicle_color ?? "",
      vehicle_chassis: c.vehicle_chassis ?? "",
      vehicle_renavam: c.vehicle_renavam ?? "",
      vehicle_km: c.vehicle_km ?? "",
      delivery_date: c.delivery_date,
      delivery_place: c.delivery_place ?? "",
      notes: c.notes ?? "",
    });
    setComecarNaRevisao(true);
    setError(null);
    setTela("form");
  }

  useEffect(() => {
    if (!open) return;
    setSalvoId(null);
    // sem nenhum feito ainda, abre direto na primeira etapa
    if (checklists.length === 0) novo();
    else setTela("lista");
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** As sugestões de cada etapa: o que já foi escrito (e a frota, no veículo). */
  const sugestoes = useMemo(() => {
    const de = (k: keyof VehicleDeliveryChecklist) => checklists.map((c) => c[k] as string | null | undefined);
    return {
      nome: valoresUsados([...devedores.map((d) => d.nome), ...de("buyer_name")]),
      orgao: valoresUsados([...ORGAOS_RG, ...checklists.map((c) => separarRg(c.buyer_rg).orgao)]),
      modelo: valoresUsados([...veiculos.map((v) => v.name.toUpperCase()), ...de("vehicle_model")]),
      placa: valoresUsados(
        [...veiculos.map((v) => v.plate), ...de("vehicle_plate")].map((p) => (p ? mascaraPlaca(p) : p))
      ),
      cor: valoresUsados(de("vehicle_color")),
      local: valoresUsados([CIDADE_DA_CONFISSAO.toUpperCase(), ...de("delivery_place")]),
    };
  }, [checklists, devedores, veiculos]);

  /** Escolheu um devedor: nome, CPF, RG, endereço e telefone de uma vez. */
  function dadosDoDevedor(d: DevedorDaLista): Partial<Dados> {
    const rg = separarRg(d.rg);
    return {
      devedor: d.chave,
      buyer_name: d.nome,
      buyer_document: d.documento,
      buyer_rg: rg.numero,
      buyer_rg_orgao: rg.orgao,
      buyer_address: d.endereco,
      buyer_phone: d.telefone,
    };
  }

  /** Cada resposta — com o que vem junto (a placa traz o modelo da frota, e vice-versa). */
  function mudar(campo: Campo, valor: string) {
    setDados((x) => {
      const novo = { ...x, [campo]: valor };
      if (campo === "vehicle_plate") {
        novo.vehicle_plate = mascaraPlaca(valor);
        const v = veiculos.find((m) => m.plate && soLetrasENumeros(m.plate) === soLetrasENumeros(valor));
        if (v && !x.vehicle_model.trim()) novo.vehicle_model = v.name.toUpperCase();
      }
      if (campo === "vehicle_model") {
        const v = veiculos.find((m) => m.name.trim().toUpperCase() === valor.trim().toUpperCase());
        if (v?.plate && !x.vehicle_plate.trim()) novo.vehicle_plate = mascaraPlaca(v.plate);
      }
      // o nome mudou à mão: deixa de ser o devedor escolhido na lista
      if (campo === "buyer_name") {
        const d = devedores.find((m) => m.chave === x.devedor);
        if (d && nomeLimpo(d.nome) !== nomeLimpo(valor)) novo.devedor = "";
      }
      return novo;
    });
  }

  // As etapas — montadas a cada render: a da lista de devedores usa o fluxo.
  const todos: PassoDef<Campo>[] = [
    {
      campo: "devedor",
      secao: "Comprador",
      pergunta: "Quem está recebendo o veículo?",
      tipo: "especial",
      mostrar: (v) => devedores.find((d) => d.chave === v)?.nome ?? "digitado à mão",
      especial: (valor) => (
        <EscolherDevedor
          devedores={devedores}
          escolhido={valor}
          onEscolher={(d) => {
            setDados((x) => ({ ...x, ...dadosDoDevedor(d) }));
            // Os dados vieram do cadastro: segue para o veículo (a revisão
            // mostra tudo). Sem RG em cadastro nenhum, para antes no RG — ao
            // salvar, ele fica gravado na dívida e vem sozinho da próxima vez.
            setTimeout(() => fluxo.irPara(d.rg ? "vehicle_model" : "buyer_rg"), 120);
          }}
          onDigitar={() => {
            setDados((x) => ({ ...x, devedor: "" }));
            fluxo.irPara("buyer_name");
          }}
        />
      ),
    },
    { campo: "buyer_name", secao: "Comprador", pergunta: "Nome de quem recebe", tipo: "texto", maiusculo: true, obrigatorio: true, sugestoes: sugestoes.nome, placeholder: "nome completo" },
    { campo: "buyer_document", secao: "Comprador", pergunta: "CPF ou CNPJ", tipo: "documento", placeholder: "só os números" },
    { campo: "buyer_rg", secao: "Comprador", pergunta: "Número do RG", tipo: "texto", teclado: "numerico", teclasExtras: ["-", "X"], placeholder: "ex: 326785949" },
    { campo: "buyer_rg_orgao", secao: "Comprador", pergunta: "Órgão expedidor do RG", tipo: "texto", maiusculo: true, atalhos: ORGAOS_RG, sugestoes: sugestoes.orgao, placeholder: "ex: SSP/MA" },
    { campo: "buyer_address", secao: "Comprador", pergunta: "Endereço", tipo: "texto", maiusculo: true, placeholder: "rua, número, bairro, cidade" },
    { campo: "buyer_phone", secao: "Comprador", pergunta: "Telefone", tipo: "telefone", placeholder: "opcional" },
    { campo: "vehicle_model", secao: "Veículo", pergunta: "Marca e modelo", tipo: "texto", maiusculo: true, sugestoes: sugestoes.modelo, placeholder: "ex: FIAT STRADA" },
    { campo: "vehicle_plate", secao: "Veículo", pergunta: "Placa", tipo: "texto", maiusculo: true, sugestoes: sugestoes.placa, placeholder: "ABC1D23" },
    { campo: "vehicle_year", secao: "Veículo", pergunta: "Ano (fabricação/modelo)", tipo: "texto", placeholder: "ex: 2020/2021" },
    { campo: "vehicle_color", secao: "Veículo", pergunta: "Cor", tipo: "texto", maiusculo: true, sugestoes: sugestoes.cor, placeholder: "ex: BRANCA" },
    { campo: "vehicle_chassis", secao: "Veículo", pergunta: "Chassi", tipo: "texto", maiusculo: true, placeholder: "17 letras e números" },
    { campo: "vehicle_renavam", secao: "Veículo", pergunta: "Renavam", tipo: "numero", maxDigitos: 11, placeholder: "só os números" },
    { campo: "vehicle_km", secao: "Veículo", pergunta: "Km no painel na entrega", tipo: "numero", maxDigitos: 7, placeholder: "ex: 45000" },
    { campo: "delivery_date", secao: "Entrega", pergunta: "Dia da entrega", tipo: "data", obrigatorio: true, fixo: true },
    { campo: "delivery_place", secao: "Entrega", pergunta: "Local da entrega", tipo: "texto", maiusculo: true, sugestoes: sugestoes.local, placeholder: "cidade" },
    { campo: "notes", secao: "Entrega", pergunta: "Observações (saem na folha)", tipo: "longo", placeholder: "opcional" },
  ];

  const fluxo = usePassoAPasso(todos, dados, open && tela === "form", comecarNaRevisao);
  const { passo, passos, idx } = fluxo;

  function salvar() {
    if (fluxo.faltando.length > 0)
      return setError(`Falta preencher: ${fluxo.faltando.map((p) => p.pergunta.toLowerCase()).join(", ")}`);
    setError(null);
    const loanId = devedores.find((d) => d.chave === dados.devedor)?.loanId ?? null;
    const { devedor: _devedor, buyer_rg_orgao, ...resto } = dados;
    startTransition(async () => {
      const r = await salvarChecklistVeiculo(editandoId, {
        ...resto,
        buyer_rg: juntarRg(dados.buyer_rg, buyer_rg_orgao),
        loan_id: loanId,
      });
      if ("error" in r && r.error) return setError(r.error);
      if ("id" in r && r.id) {
        setSalvoId(r.id);
        setTela("pronto");
      }
    });
  }

  function excluir(c: VehicleDeliveryChecklist) {
    if (!confirm(`Excluir o checklist de ${c.buyer_name}${c.vehicle_plate ? ` (${c.vehicle_plate})` : ""}?`)) return;
    startTransition(async () => {
      const r = await excluirChecklistVeiculo(c.id);
      if ("error" in r && r.error) setError(r.error);
    });
  }

  const titulo =
    tela === "pronto"
      ? "Checklist pronto"
      : tela === "form"
        ? fluxo.naRevisao
          ? "Revisar o checklist"
          : editandoId
            ? "Corrigir checklist"
            : "Novo checklist de entrega"
        : "Checklist de entrega de veículo";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="w-5 h-5 text-produmar-600" />
            {titulo}
          </DialogTitle>
        </DialogHeader>

        {/* OS JÁ FEITOS — imprimir de novo, corrigir ou excluir */}
        {tela === "lista" && (
          <div className="space-y-3">
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              A folha que o comprador assina quando recebe o veículo vendido.
            </p>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {checklists.length === 0 && (
                <p className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">Nenhum checklist feito ainda.</p>
              )}
              {checklists.map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{c.buyer_name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {formatDate(c.delivery_date)}
                      {c.vehicle_model ? ` · ${c.vehicle_model}` : ""}
                      {c.vehicle_plate ? ` · ${c.vehicle_plate}` : ""}
                    </p>
                  </div>
                  <a
                    href={`/imprimir/checklist-veiculo/${c.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Imprimir"
                    className="p-2 rounded-lg text-produmar-700 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-produmar-950/40"
                  >
                    <Printer className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => editar(c)}
                    title="Corrigir"
                    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => excluir(c)}
                    disabled={isPending}
                    title="Excluir"
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            {error && <Erro texto={error} />}
            <DialogFooter className={STICKY_FOOTER}>
              <Button type="button" variant="outline" onClick={onClose} className={cn(FOOTER_CANCEL, "h-11")}>
                Fechar
              </Button>
              <Button type="button" onClick={novo} className={cn(FOOTER_SUBMIT, "h-11")}>
                <Plus className="w-4 h-4" />
                Novo checklist
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* AS ETAPAS — uma pergunta por tela */}
        {tela === "form" &&
          (passo ? (
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
              rodape={
                passo.secao === "Entrega"
                  ? "Os itens (documento, chave reserva, estepe, pneus...) saem na folha com Sim / Não em branco, para marcar à caneta na entrega."
                  : "Só o nome é obrigatório. O que ficar em branco sai com a linha para completar à mão."
              }
            />
          ) : (
            <div className="space-y-4">
              <RevisaoDosPassos passos={passos} dados={dados} onEditar={fluxo.editar} />
              {error && <Erro texto={error} />}
              <DialogFooter className={STICKY_FOOTER}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={fluxo.voltar}
                  disabled={isPending}
                  className={cn(FOOTER_CANCEL, "h-11")}
                >
                  Voltar
                </Button>
                <Button type="button" onClick={salvar} disabled={isPending} className={cn(FOOTER_SUBMIT, "h-11")}>
                  {isPending ? "Salvando..." : "Salvar e imprimir"}
                </Button>
              </DialogFooter>
            </div>
          ))}

        {/* SALVO — abrir a folha */}
        {tela === "pronto" && salvoId && (
          <div className="space-y-3">
            <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              Checklist gravado.
            </p>
            <a
              href={`/imprimir/checklist-veiculo/${salvoId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border-2 border-produmar-200 dark:border-produmar-800 bg-produmar-50/60 dark:bg-produmar-950/30 px-4 py-3"
            >
              <Printer className="w-6 h-6 text-produmar-600 dark:text-produmar-400 flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">
                  Abrir a folha para imprimir
                </span>
                <span className="block text-[12px] text-slate-600 dark:text-slate-300">
                  Uma folha A4: o comprador confere, marca e assina.
                </span>
              </span>
              <ChevronRight className="w-5 h-5 text-produmar-500 flex-shrink-0" />
            </a>
            {/* o PDF da mesma folha: WhatsApp, e-mail, Arquivos */}
            <CompartilharPdf chave={salvoId} gerar={() => gerarChecklistVeiculoPdf(paraFolha(dados))} />
            <DialogFooter className={STICKY_FOOTER}>
              <Button type="button" onClick={onClose} className="flex-1 h-11">
                Concluir
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A primeira etapa: a lista dos devedores, com busca. Um toque escolhe e puxa
 * os dados; "Não está na lista" segue para digitar o comprador.
 */
function EscolherDevedor({
  devedores,
  escolhido,
  onEscolher,
  onDigitar,
}: {
  devedores: DevedorDaLista[];
  escolhido: string;
  onEscolher: (d: DevedorDaLista) => void;
  onDigitar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const q = nomeLimpo(busca);
  const qDigitos = busca.replace(/\D/g, "");
  const lista = devedores.filter(
    (d) =>
      !q ||
      nomeLimpo(d.nome).includes(q) ||
      (qDigitos.length >= 3 && d.documento.replace(/\D/g, "").includes(qDigitos))
  );

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onDigitar}
        className="w-full flex items-center gap-2 min-h-[48px] px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-700 dark:text-slate-200"
      >
        <UserPlus className="w-4 h-4" />
        Não está na lista — digitar o comprador
      </button>
      {devedores.length > 0 && (
        <>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 pt-1">
            Ou escolha um devedor: nome, CPF, RG, endereço e telefone vêm junto.
          </p>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="buscar por nome ou CPF"
              autoComplete="off"
              semDitado
              className="h-12 pl-9 text-base"
            />
          </div>
          <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
            {lista.length === 0 && (
              <p className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">Ninguém com esse nome.</p>
            )}
            {lista.map((d) => (
              <button
                key={d.chave}
                type="button"
                onClick={() => onEscolher(d)}
                className={cn(
                  "w-full text-left px-3 py-2.5 min-h-[48px]",
                  escolhido === d.chave
                    ? "bg-produmar-50 dark:bg-produmar-950/40"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800"
                )}
              >
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{d.nome}</span>
                {d.documento && (
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">{d.documento}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** As respostas no formato da folha — em caixa alta, como o servidor grava. */
function paraFolha(d: Dados): ChecklistParaFolha {
  const t = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase() || null;
  return {
    buyer_name: t(d.buyer_name) ?? "",
    buyer_document: t(d.buyer_document),
    buyer_rg: t(juntarRg(d.buyer_rg, d.buyer_rg_orgao)),
    buyer_address: t(d.buyer_address),
    buyer_phone: t(d.buyer_phone),
    vehicle_model: t(d.vehicle_model),
    vehicle_plate: t(d.vehicle_plate),
    vehicle_year: t(d.vehicle_year),
    vehicle_color: t(d.vehicle_color),
    vehicle_chassis: t(d.vehicle_chassis),
    vehicle_renavam: t(d.vehicle_renavam),
    vehicle_km: t(d.vehicle_km),
    delivery_place: t(d.delivery_place),
    delivery_date: d.delivery_date,
    notes: t(d.notes),
  };
}

function Erro({ texto }: { texto: string }) {
  return (
    <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/50">
      {texto}
    </p>
  );
}
