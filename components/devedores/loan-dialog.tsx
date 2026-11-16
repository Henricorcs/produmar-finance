"use client";

import { useState, useTransition, useEffect, useMemo, useRef } from "react";
import {
  Camera,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  ChevronLeft,
  ChevronRight,
  Check,
  FileSignature,
} from "lucide-react";
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
import {
  createLoan,
  updateLoan,
  gerarBoletosDaDivida,
  uploadLoanAttachments,
  type LoanInput,
} from "@/app/(app)/devedores/actions";
import {
  cn,
  loanTotalDue,
  formatBRL,
  formatBRLInput,
  formatDate,
  localDateISO,
  mascaraCpfCnpj,
  mascaraTelefone,
} from "@/lib/utils";
import { mascaraCep } from "@/components/ui/passo-a-passo";
import { enderecoDoDevedor } from "@/lib/devedor-endereco";
import { LOAN_PAYMENT_METHODS, LOAN_PAYMENT_METHOD_LABEL } from "@/lib/types";
import type { Loan, LoanPaymentMethod, LoanRepaymentType } from "@/lib/types";
import type { LoanWithDetails } from "@/app/(app)/devedores/page";
import { comprimirImagens } from "@/lib/comprimir-imagem";
import { STICKY_FOOTER, FOOTER_CANCEL, FOOTER_SUBMIT } from "@/components/frota/frota-shared";
import { LoanBoletos } from "./loan-boletos";

interface Props {
  open: boolean;
  onClose: () => void;
  loan?: Loan | null;
  /** As dívidas da tela — para mostrar os boletos que acabaram de ser gerados. */
  dividas?: LoanWithDetails[];
}

function parseBRL(value: string): number {
  const n = parseFloat(value.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

const MAX_SIZE_MB = 10;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

/** Soma meses a AAAA-MM-DD — a mesma conta do servidor que gera as parcelas. */
function somarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return localDateISO(new Date(y, m - 1 + meses, d));
}

type TipoJuros = "percent" | "fixed" | "nenhum";

/**
 * A DÍVIDA EM ETAPAS — uma pergunta por tela, como a OS da máquina:
 *   quem deve → quanto → juros → como vai pagar (parcelas) → forma → conferir.
 * Com boleto, no fim aparecem os boletos gerados e o botão "Gerar no banco",
 * do mesmo jeito dos aluguéis.
 */
type Passo =
  | "devedor"
  | "rg"
  | "dados"
  | PassoEndereco
  | "valor"
  | "juros"
  | "parcelas"
  | "forma"
  | "conferir"
  | "boletos";

const TITULO: Record<Passo, string> = {
  devedor: "Quem está devendo",
  rg: "RG do devedor",
  dados: "Dados para a confissão",
  rua: "Endereço · rua",
  numero: "Endereço · número",
  complemento: "Endereço · complemento",
  bairro: "Endereço · bairro",
  cidade: "Endereço · cidade e UF",
  cep: "Endereço · CEP",
  valor: "Quanto deve",
  juros: "Tem juros?",
  parcelas: "Como vai pagar",
  forma: "Forma de pagamento",
  conferir: "Conferir e lançar",
  boletos: "Pronto",
};

/**
 * O endereço é perguntado uma parte por tela (pedido do dono: "tem que ser
 * por etapas, rua, número..."); o RG também tem a tela dele — no meio do CPF
 * ele passava em branco sem ninguém ver.
 */
type PassoEndereco = "rua" | "numero" | "complemento" | "bairro" | "cidade" | "cep";
const PASSOS_ENDERECO: PassoEndereco[] = ["rua", "numero", "complemento", "bairro", "cidade", "cep"];

const ETAPAS: Passo[] = ["devedor", "rg", "dados", ...PASSOS_ENDERECO, "valor", "juros", "parcelas", "forma", "conferir"];
/** Com CNPJ não tem RG: a tela dele sai da sequência. */
const ETAPAS_EMPRESA: Passo[] = ETAPAS.filter((p) => p !== "rg");

function ehPassoEndereco(p: Passo): p is PassoEndereco {
  return (PASSOS_ENDERECO as Passo[]).includes(p);
}

/** Como cada parte do endereço é perguntada. */
const PERGUNTA_ENDERECO: Record<
  PassoEndereco,
  { rotulo: string; placeholder: string; numerico?: boolean }
> = {
  rua: { rotulo: "Rua ou avenida", placeholder: "ex: RUA DAS FLORES" },
  numero: { rotulo: "Número", placeholder: "ex: 120", numerico: true },
  complemento: { rotulo: "Complemento", placeholder: "opcional — casa B, apto 3..." },
  bairro: { rotulo: "Bairro ou povoado", placeholder: "ex: CENTRO" },
  cidade: { rotulo: "Cidade", placeholder: "ex: SÃO MATEUS DO MARANHÃO" },
  cep: { rotulo: "CEP", placeholder: "00000-000", numerico: true },
};

/** O endereço em partes (migration 144), como a tela pergunta. */
interface Endereco {
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
}

const ENDERECO_VAZIO: Endereco = { rua: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", cep: "" };

function enderecoDaDivida(l?: Loan | null): Endereco {
  return {
    rua: l?.borrower_street ?? "",
    numero: l?.borrower_number ?? "",
    complemento: l?.borrower_complement ?? "",
    bairro: l?.borrower_district ?? "",
    cidade: l?.borrower_city ?? "",
    uf: l?.borrower_state ?? "",
    cep: mascaraCep(l?.borrower_zip ?? ""),
  };
}

/** O que está no formulário, no formato da dívida — sem o endereço corrido antigo. */
function partesDoForm(e: Endereco): Partial<Loan> {
  return {
    borrower_street: e.rua,
    borrower_number: e.numero,
    borrower_complement: e.complemento,
    borrower_district: e.bairro,
    borrower_city: e.cidade,
    borrower_state: e.uf,
    borrower_zip: e.cep,
  };
}

/** Os estados civis do botão — como saem escritos na confissão. */
const ESTADOS_CIVIS = ["SOLTEIRO(A)", "CASADO(A)", "DIVORCIADO(A)", "VIÚVO(A)", "UNIÃO ESTÁVEL"];

export function LoanDialog({ open, onClose, loan, dividas = [] }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [passo, setPasso] = useState<Passo>("devedor");

  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [telefone, setTelefone] = useState("");
  // A qualificação para a confissão de dívida (migration 141)
  const [nacionalidade, setNacionalidade] = useState("");
  const [estadoCivil, setEstadoCivil] = useState("");
  const [profissao, setProfissao] = useState("");
  const [rg, setRg] = useState("");
  const [endereco, setEndereco] = useState<Endereco>(ENDERECO_VAZIO);
  const [repNome, setRepNome] = useState("");
  const [repDoc, setRepDoc] = useState("");
  const [amount, setAmount] = useState("");
  const [loanDate, setLoanDate] = useState(localDateISO());
  const [interestType, setInterestType] = useState<TipoJuros>("percent");
  const [interestRate, setInterestRate] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [interestAmount, setInterestAmount] = useState("");
  const [repaymentType, setRepaymentType] = useState<LoanRepaymentType>("avulso");
  const [installments, setInstallments] = useState("");
  const [dueDate, setDueDate] = useState("");
  /** Mexeu no "como vai pagar"? Então a sugestão pelo prazo não mexe mais. */
  const [parcelasNaMao, setParcelasNaMao] = useState(false);
  /** Boleto, pix, cartão ou dinheiro — em branco enquanto não se escolhe. */
  const [paymentMethod, setPaymentMethod] = useState<LoanPaymentMethod | null>(null);
  /** Forma "Boleto": já cria os boletos no sistema ao salvar (migration 139). */
  const [criarBoletos, setCriarBoletos] = useState(true);
  const [notes, setNotes] = useState("");

  // Comprovantes anexados já na criação (ex.: print do PIX)
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedIdRef = useRef<string | null>(null);
  const [salvoId, setSalvoId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPasso("devedor");
    setNome(loan?.borrower_name ?? "");
    // o que foi salvo sem pontos já aparece formatado
    setDocumento(mascaraCpfCnpj(loan?.borrower_document ?? ""));
    setTelefone(mascaraTelefone(loan?.borrower_phone ?? ""));
    // dívida nova já vem "brasileiro(a)" — o caso de quase todo devedor
    setNacionalidade(loan ? loan.borrower_nationality ?? "" : "BRASILEIRO(A)");
    setEstadoCivil(loan?.borrower_marital_status ?? "");
    setProfissao(loan?.borrower_profession ?? "");
    setRg(loan?.borrower_rg ?? "");
    setEndereco(enderecoDaDivida(loan));
    setRepNome(loan?.borrower_rep_name ?? "");
    setRepDoc(mascaraCpfCnpj(loan?.borrower_rep_document ?? ""));
    setAmount(loan?.principal ? formatBRLInput(loan.principal) : "");
    setLoanDate(loan?.loan_date ?? localDateISO());
    if (loan?.interest_amount) {
      setInterestType("fixed");
      setInterestAmount(formatBRLInput(loan.interest_amount));
      setInterestRate("");
    } else if (loan && !loan.interest_rate) {
      setInterestType("nenhum");
      setInterestAmount("");
      setInterestRate("");
    } else {
      setInterestType("percent");
      setInterestAmount("");
      setInterestRate(loan?.interest_rate != null ? String(loan.interest_rate) : "");
    }
    setTermMonths(loan?.term_months != null ? String(loan.term_months) : "");
    setRepaymentType(loan?.repayment_type ?? "avulso");
    setInstallments(loan?.installments_count != null ? String(loan.installments_count) : "");
    setDueDate(loan?.due_date ?? "");
    setParcelasNaMao(!!loan);
    setPaymentMethod(loan?.payment_method ?? null);
    // dívida nova já sai com boleto; editar não cria sem ele pedir
    setCriarBoletos(!loan);
    setNotes(loan?.notes ?? "");
    setError(null);
    setFiles([]);
    setFileError(null);
    setSalvoId(null);
    savedIdRef.current = loan?.id ?? null;
  }, [open, loan]);

  // As contas da dívida
  const principal = parseBRL(amount);
  const rate = parseFloat(interestRate.replace(",", ".")) || 0;
  const months = parseInt(termMonths, 10) || 0;
  const fixedInterest = parseBRL(interestAmount);
  const total = loanTotalDue({
    principal,
    interest_rate: interestType === "percent" ? rate : null,
    term_months: interestType === "percent" ? months : null,
    interest_amount: interestType === "fixed" ? fixedInterest : null,
  });
  const interest = total - principal;
  const nParcelas = repaymentType === "parcelado" ? parseInt(installments, 10) || 0 : 0;
  const primeiroVencimento = dueDate || somarMeses(loanDate || localDateISO(), 1);

  /** As parcelas como o servidor vai criar: centavos para baixo, a última fecha a conta. */
  const previa = useMemo(() => {
    if (nParcelas < 1 || !(total > 0)) return [];
    const base = Math.floor((total / nParcelas) * 100) / 100;
    return Array.from({ length: nParcelas }, (_, i) => ({
      numero: i + 1,
      valor: i === nParcelas - 1 ? Math.round((total - base * (nParcelas - 1)) * 100) / 100 : base,
      vencimento: somarMeses(primeiroVencimento, i),
    }));
  }, [nParcelas, total, primeiroVencimento]);

  /** CNPJ (14 dígitos): os dados são da empresa — sede e quem assina por ela. */
  const ehEmpresa = documento.replace(/\D/g, "").length === 14;
  const etapas = ehEmpresa ? ETAPAS_EMPRESA : ETAPAS;
  const indice = etapas.indexOf(passo);
  const mudarEndereco = (campo: keyof Endereco, valor: string) =>
    setEndereco((e) => ({ ...e, [campo]: valor }));
  /** O endereço montado — o das partes ou, sem elas, o corrido antigo. */
  const enderecoMontado = enderecoDoDevedor({
    ...partesDoForm(endereco),
    borrower_address: loan?.borrower_address,
  });

  function irPara(p: Passo) {
    setError(null);
    // Chegando em "como vai pagar" de uma dívida nova: o prazo dos juros já
    // diz em quantos meses ele paga — sugere dividir nas mesmas parcelas.
    if (p === "parcelas" && !parcelasNaMao && interestType === "percent" && months > 1) {
      setRepaymentType("parcelado");
      setInstallments(String(months));
    }
    setPasso(p);
  }

  /** O que cada etapa exige antes de seguir. */
  function problemaDaEtapa(p: Passo): string | null {
    if (p === "devedor" && !nome.trim()) return "Escreva o nome de quem está devendo";
    if (p === "valor") {
      if (!(principal > 0)) return "Informe o valor devido";
      if (!loanDate) return "Informe a data da dívida";
    }
    if (p === "juros") {
      if (interestType === "percent" && rate > 0 && months < 1) return "Informe o prazo em meses para calcular os juros";
      if (interestType === "fixed" && !(fixedInterest > 0)) return "Informe o valor dos juros";
    }
    if (p === "parcelas" && repaymentType === "parcelado" && nParcelas < 1)
      return "Informe em quantas parcelas";
    return null;
  }

  function proximo() {
    const problema = problemaDaEtapa(passo);
    if (problema) return setError(problema);
    irPara(etapas[indice + 1]);
  }

  /** O "seguinte" do teclado do celular passa para a próxima tela. */
  function avancarNoEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    proximo();
  }

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    // Encolhe as fotos antes de medir: comprovante de 12 MB tirado no celular
    // vira uns 300 kB e passa a caber, em vez de ser recusado.
    const escolhidos = await comprimirImagens(Array.from(list));
    const accepted: File[] = [];
    const errs: string[] = [];
    escolhidos.forEach((f) => {
      if (f.size > MAX_SIZE) errs.push(`${f.name}: máx ${MAX_SIZE_MB} MB`);
      else accepted.push(f);
    });
    setFileError(errs.length ? errs.join(" · ") : null);
    if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
  }

  function fileIcon(f: File) {
    if (f.type.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
    if (f.type.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
    return <FileIcon className="w-4 h-4" />;
  }

  function salvar() {
    for (const p of ETAPAS) {
      const problema = problemaDaEtapa(p);
      if (problema) {
        setPasso(p);
        return setError(problema);
      }
    }

    const input: LoanInput = {
      borrower_name: nome,
      borrower_document: documento.trim() || null,
      borrower_phone: telefone.trim() || null,
      borrower_nationality: ehEmpresa ? null : nacionalidade,
      borrower_marital_status: ehEmpresa ? null : estadoCivil,
      borrower_profession: ehEmpresa ? null : profissao,
      borrower_rg: ehEmpresa ? null : rg,
      // o endereço corrido de antes da 144 (borrower_address) não é mexido:
      // continua valendo até as partes serem preenchidas
      borrower_street: endereco.rua,
      borrower_number: endereco.numero,
      borrower_complement: endereco.complemento,
      borrower_district: endereco.bairro,
      borrower_city: endereco.cidade,
      borrower_state: endereco.uf,
      borrower_zip: endereco.cep,
      borrower_rep_name: ehEmpresa ? repNome : null,
      borrower_rep_document: ehEmpresa ? repDoc : null,
      principal,
      interest_rate: interestType === "percent" && rate > 0 ? rate : null,
      term_months: interestType === "percent" && months > 0 ? months : null,
      interest_amount: interestType === "fixed" && fixedInterest > 0 ? fixedInterest : null,
      repayment_type: repaymentType,
      installments_count: repaymentType === "parcelado" ? nParcelas || null : null,
      payment_method: paymentMethod,
      loan_date: loanDate,
      due_date: dueDate || null,
      notes: notes || null,
    };

    setError(null);
    startTransition(async () => {
      // Cria/atualiza a dívida. savedIdRef evita recriar caso o upload
      // do comprovante falhe e o usuário tente enviar novamente.
      let loanId = savedIdRef.current;

      if (loanId) {
        const result = await updateLoan(loanId, input);
        if (result && "error" in result) return setError(result.error ?? "Erro inesperado");
      } else {
        const result = await createLoan(input);
        if (result && "error" in result) return setError(result.error ?? "Erro inesperado");
        loanId = (result as { id?: string }).id ?? null;
        savedIdRef.current = loanId;
      }

      // Sobe os comprovantes anexados (se houver)
      if (loanId && files.length > 0) {
        const upload = new FormData();
        files.forEach((f) => upload.append("files", f));
        const up = await uploadLoanAttachments(loanId, upload);
        if (up && "error" in up) {
          return setError(`Dívida salva, mas falha ao anexar o comprovante: ${up.error}. Tente enviar de novo.`);
        }
        setFiles([]);
      }

      // Os boletos no sistema (só cria os que faltam — repetir não duplica).
      let avisoBoletos: string | null = null;
      if (loanId && paymentMethod === "boleto" && criarBoletos) {
        const b = await gerarBoletosDaDivida(loanId);
        if (b && "error" in b && b.error) avisoBoletos = b.error;
      }

      // A última tela: os boletos (com o "Gerar no banco", como nos aluguéis)
      // e a confissão de dívida, pronta para mandar ao devedor assinar.
      if (!loanId) return onClose();
      setSalvoId(loanId);
      setPasso("boletos");
      setError(avisoBoletos);
    });
  }

  const dividaSalva = salvoId ? dividas.find((d) => d.id === salvoId) ?? null : null;
  const seletor = (ativo: boolean) =>
    cn(
      "min-h-[48px] px-2 text-sm rounded-xl border font-medium transition-colors",
      ativo
        ? "bg-produmar-50 dark:bg-produmar-950/40 border-produmar-300 dark:border-produmar-800 text-produmar-700 dark:text-produmar-400"
        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
    );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {passo === "boletos" ? TITULO.boletos : loan ? "Editar dívida" : "Nova dívida"}
          </DialogTitle>
        </DialogHeader>

        {passo !== "boletos" && (
          <div className="space-y-1.5 -mt-1">
            <div className="flex gap-1">
              {etapas.map((p, i) => (
                <span
                  key={p}
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    i <= indice ? "bg-produmar-500" : "bg-slate-200 dark:bg-slate-700"
                  )}
                />
              ))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Passo {indice + 1} de {etapas.length} ·{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{TITULO[passo]}</span>
            </p>
          </div>
        )}

        <div className="space-y-4">
          {/* 1. QUEM DEVE */}
          {passo === "devedor" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="borrower_name">Nome de quem deve *</Label>
                <Input
                  id="borrower_name"
                  value={nome}
                  onChange={(e) => setNome(e.target.value.toUpperCase())}
                  placeholder="nome completo"
                  autoCapitalize="characters"
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="borrower_document">CPF ou CNPJ</Label>
                <Input
                  id="borrower_document"
                  value={documento}
                  onChange={(e) => setDocumento(mascaraCpfCnpj(e.target.value))}
                  placeholder="só os números"
                  inputMode="numeric"
                  className="h-12 text-base"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Precisa do CPF (ou CNPJ) certo para o boleto ir para o banco e para a confissão de dívida.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="borrower_phone">Telefone</Label>
                <Input
                  id="borrower_phone"
                  value={telefone}
                  onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                  placeholder="opcional"
                  inputMode="tel"
                  className="h-12 text-base"
                />
              </div>
            </>
          )}

          {/* 1a. RG — tela só dele (pessoa física; com CNPJ a etapa sai) */}
          {passo === "rg" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="borrower_rg">RG (número e órgão)</Label>
                <Input
                  id="borrower_rg"
                  value={rg}
                  onChange={(e) => setRg(e.target.value.toUpperCase())}
                  onKeyDown={avancarNoEnter}
                  placeholder="ex: 123456 SSP/MA"
                  autoCapitalize="characters"
                  autoComplete="off"
                  enterKeyHint="next"
                  autoFocus
                  className="h-14 text-lg"
                />
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                Vai na confissão de dívida. Em branco, sai a linha para completar à mão.
              </p>
            </>
          )}

          {/* 1b. DADOS PARA A CONFISSÃO DE DÍVIDA (migration 141) — o que fica
              em branco sai como linha para completar à caneta */}
          {passo === "dados" && (
            <>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 -mt-1">
                Vão na confissão de dívida. O que ficar em branco sai com a linha para completar à mão.
              </p>
              {ehEmpresa ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="borrower_rep_name">Quem assina pela empresa</Label>
                    <Input
                      id="borrower_rep_name"
                      value={repNome}
                      onChange={(e) => setRepNome(e.target.value.toUpperCase())}
                      placeholder="nome do sócio ou administrador"
                      autoCapitalize="characters"
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="borrower_rep_document">CPF de quem assina</Label>
                    <Input
                      id="borrower_rep_document"
                      value={repDoc}
                      onChange={(e) => setRepDoc(mascaraCpfCnpj(e.target.value))}
                      placeholder="só os números"
                      inputMode="numeric"
                      className="h-12 text-base"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="borrower_nationality">Nacionalidade</Label>
                    <Input
                      id="borrower_nationality"
                      value={nacionalidade}
                      onChange={(e) => setNacionalidade(e.target.value.toUpperCase())}
                      placeholder="BRASILEIRO(A)"
                      autoCapitalize="characters"
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Estado civil</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {ESTADOS_CIVIS.map((ec) => (
                        <button
                          key={ec}
                          type="button"
                          onClick={() => setEstadoCivil(estadoCivil === ec ? "" : ec)}
                          className={cn(seletor(estadoCivil === ec), "min-h-[44px] text-xs px-1")}
                        >
                          {ec.replace("(A)", "(a)").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="borrower_profession">Profissão</Label>
                    <Input
                      id="borrower_profession"
                      value={profissao}
                      onChange={(e) => setProfissao(e.target.value.toUpperCase())}
                      placeholder="ex: AGRICULTOR, COMERCIANTE"
                      autoCapitalize="characters"
                      className="h-12 text-base"
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* 1c. ENDEREÇO EM PARTES (migration 144) — uma parte por tela; da
              casa ou, com CNPJ, da sede */}
          {ehPassoEndereco(passo) && (
            <>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 -mt-1">
                {ehEmpresa ? "Endereço da sede da empresa." : "Onde o devedor mora."} O que ficar em
                branco não sai na confissão.
              </p>
              {/* dívida de antes da 144: o endereço corrido segue valendo */}
              {passo === "rua" &&
                loan?.borrower_address?.trim() &&
                !enderecoDoDevedor(partesDoForm(endereco)) && (
                  <p className="text-[12px] text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400">
                    Endereço que está na dívida hoje: {loan.borrower_address.trim()}. Ele continua
                    valendo até você preencher as partes.
                  </p>
                )}
              {passo === "cidade" ? (
                <div className="grid grid-cols-[1fr_5rem] gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="borrower_city">Cidade</Label>
                    <Input
                      key="borrower_city"
                      id="borrower_city"
                      value={endereco.cidade}
                      onChange={(e) => mudarEndereco("cidade", e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        // "seguinte" na cidade vai para a UF, na mesma tela
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        document.getElementById("borrower_state")?.focus();
                      }}
                      placeholder={PERGUNTA_ENDERECO.cidade.placeholder}
                      autoCapitalize="characters"
                      autoComplete="off"
                      enterKeyHint="next"
                      autoFocus
                      className="h-14 text-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="borrower_state">UF</Label>
                    <Input
                      id="borrower_state"
                      value={endereco.uf}
                      onChange={(e) =>
                        mudarEndereco("uf", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))
                      }
                      onKeyDown={avancarNoEnter}
                      placeholder="MA"
                      autoCapitalize="characters"
                      autoComplete="off"
                      enterKeyHint="next"
                      maxLength={2}
                      className="h-14 text-lg text-center uppercase"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor={`borrower_${passo}`}>{PERGUNTA_ENDERECO[passo].rotulo}</Label>
                  <div className="flex gap-2">
                    <Input
                      // a chave troca a cada parte: o campo nasce de novo e o foco vem para ele
                      key={passo}
                      id={`borrower_${passo}`}
                      value={endereco[passo]}
                      onChange={(e) =>
                        mudarEndereco(
                          passo,
                          passo === "cep" ? mascaraCep(e.target.value) : e.target.value.toUpperCase()
                        )
                      }
                      onKeyDown={avancarNoEnter}
                      placeholder={PERGUNTA_ENDERECO[passo].placeholder}
                      inputMode={PERGUNTA_ENDERECO[passo].numerico ? "numeric" : undefined}
                      autoCapitalize="characters"
                      autoComplete="off"
                      enterKeyHint="next"
                      autoFocus
                      className="h-14 text-lg min-w-0 flex-1 tabular-nums"
                    />
                    {passo === "numero" && (
                      <button
                        type="button"
                        onClick={() => mudarEndereco("numero", endereco.numero === "S/N" ? "" : "S/N")}
                        className={cn(seletor(endereco.numero === "S/N"), "min-h-[56px] px-4 shrink-0")}
                      >
                        S/N
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 2. QUANTO */}
          {passo === "valor" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="amount">Valor devido *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-slate-400 pointer-events-none">
                    R$
                  </span>
                  <Input
                    id="amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(formatBRLInput(e.target.value))}
                    placeholder="0,00"
                    className="pl-10 h-14 text-2xl font-bold tabular-nums"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loan_date">Data da dívida *</Label>
                <Input
                  id="loan_date"
                  type="date"
                  value={loanDate}
                  onChange={(e) => setLoanDate(e.target.value)}
                  className="h-12"
                />
              </div>
            </>
          )}

          {/* 3. JUROS */}
          {passo === "juros" && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["nenhum", "Sem juros"],
                    ["percent", "% ao mês"],
                    ["fixed", "Valor fixo"],
                  ] as [TipoJuros, string][]
                ).map(([t, rotulo]) => (
                  <button key={t} type="button" onClick={() => setInterestType(t)} className={seletor(interestType === t)}>
                    {rotulo}
                  </button>
                ))}
              </div>

              {interestType === "percent" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="interest_rate">Taxa (% ao mês)</Label>
                    <Input
                      id="interest_rate"
                      inputMode="decimal"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value.replace(/[^\d.,]/g, ""))}
                      placeholder="ex: 6"
                      className="h-12 text-base tabular-nums"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="term_months">Prazo (meses)</Label>
                    <Input
                      id="term_months"
                      type="number"
                      min={0}
                      value={termMonths}
                      onChange={(e) => setTermMonths(e.target.value)}
                      placeholder="ex: 3"
                      className="h-12 text-base tabular-nums"
                      autoComplete="off"
                    />
                  </div>
                </div>
              )}
              {interestType === "fixed" && (
                <div className="space-y-1.5">
                  <Label htmlFor="interest_fixed">Valor dos juros</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                      R$
                    </span>
                    <Input
                      id="interest_fixed"
                      inputMode="decimal"
                      value={interestAmount}
                      onChange={(e) => setInterestAmount(formatBRLInput(e.target.value))}
                      placeholder="0,00"
                      className="pl-9 h-12 text-base tabular-nums"
                      autoComplete="off"
                    />
                  </div>
                </div>
              )}

              <Totais principal={principal} interest={interest} total={total} />
            </>
          )}

          {/* 4. COMO VAI PAGAR */}
          {passo === "parcelas" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["avulso", "De uma vez"],
                    ["parcelado", "Parcelado"],
                  ] as [LoanRepaymentType, string][]
                ).map(([t, rotulo]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setParcelasNaMao(true);
                      setRepaymentType(t);
                      if (t === "parcelado" && !installments && months > 1) setInstallments(String(months));
                    }}
                    className={seletor(repaymentType === t)}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>

              {/* a dívida antiga lançada "avulsa" com prazo: oferece dividir */}
              {repaymentType === "avulso" && interestType === "percent" && months > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setParcelasNaMao(true);
                    setRepaymentType("parcelado");
                    setInstallments(String(months));
                  }}
                  className="w-full text-left text-sm rounded-xl border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300 px-3 py-2.5"
                >
                  O prazo é de {months} meses — toque para dividir em {months} parcelas (um boleto por mês).
                </button>
              )}

              {repaymentType === "parcelado" && (
                <div className="space-y-1.5">
                  <Label htmlFor="installments">Em quantas parcelas? *</Label>
                  <Input
                    id="installments"
                    type="number"
                    min={1}
                    value={installments}
                    onChange={(e) => {
                      setParcelasNaMao(true);
                      setInstallments(e.target.value);
                    }}
                    placeholder="ex: 3"
                    className="h-12 text-base tabular-nums"
                    autoComplete="off"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="due_date">{repaymentType === "parcelado" ? "1º vencimento" : "Vencimento"}</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-12"
                />
                {!dueDate && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Em branco: um mês depois da data da dívida ({formatDate(primeiroVencimento)}).
                  </p>
                )}
              </div>

              {previa.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                  {previa.map((p) => (
                    <div key={p.numero} className="flex items-center justify-between px-3 py-2 text-sm tabular-nums">
                      <span className="text-slate-500 dark:text-slate-400">
                        {p.numero}ª · {formatDate(p.vencimento)}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{formatBRL(p.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
              {repaymentType === "avulso" && total > 0 && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {formatBRL(total)} de uma vez, até {formatDate(primeiroVencimento)}.
                </p>
              )}
            </>
          )}

          {/* 5. FORMA DE PAGAMENTO */}
          {passo === "forma" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {LOAN_PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(paymentMethod === m ? null : m)}
                    className={seletor(paymentMethod === m)}
                  >
                    {LOAN_PAYMENT_METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
              {paymentMethod === "boleto" && (
                <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={criarBoletos}
                    onChange={(e) => setCriarBoletos(e.target.checked)}
                    className="mt-0.5 w-5 h-5 accent-produmar-600 flex-shrink-0"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">
                    Gerar os boletos no sistema ao lançar
                    <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                      {repaymentType === "parcelado" && nParcelas > 0
                        ? `${nParcelas} boleto(s), um por parcela.`
                        : "Um boleto com o total, no vencimento."}{" "}
                      No fim você confere e toca em Gerar no banco.
                    </span>
                  </span>
                </label>
              )}
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Toque de novo no escolhido para deixar em branco.
              </p>
            </>
          )}

          {/* 6. CONFERIR */}
          {passo === "conferir" && (
            <>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                <Linha rotulo="Devedor" valor={nome || "—"} onEditar={() => irPara("devedor")} />
                <Linha rotulo={ehEmpresa ? "CNPJ" : "CPF"} valor={documento || "—"} onEditar={() => irPara("devedor")} />
                {!ehEmpresa && (
                  <Linha
                    rotulo="RG"
                    valor={rg || "em branco (sai a linha para preencher)"}
                    onEditar={() => irPara("rg")}
                  />
                )}
                <Linha
                  rotulo={ehEmpresa ? "Quem assina" : "Dados"}
                  valor={
                    (ehEmpresa
                      ? [repNome, repDoc && `CPF ${repDoc}`]
                      : [nacionalidade, estadoCivil, profissao]
                    )
                      .filter(Boolean)
                      .join(" · ") || "em branco (sai a linha para preencher)"
                  }
                  onEditar={() => irPara("dados")}
                />
                <Linha
                  rotulo={ehEmpresa ? "Sede" : "Endereço"}
                  valor={enderecoMontado || "em branco (sai a linha para preencher)"}
                  onEditar={() => irPara("rua")}
                />
                <Linha rotulo="Valor devido" valor={formatBRL(principal)} onEditar={() => irPara("valor")} />
                <Linha
                  rotulo="Juros"
                  valor={interest > 0 ? `${formatBRL(interest)}${interestType === "percent" ? ` (${rate}% × ${months} meses)` : ""}` : "Sem juros"}
                  onEditar={() => irPara("juros")}
                />
                <Linha rotulo="Total a receber" valor={formatBRL(total)} forte onEditar={() => irPara("juros")} />
                <Linha
                  rotulo="Como paga"
                  valor={
                    repaymentType === "parcelado"
                      ? `${nParcelas}x a partir de ${formatDate(primeiroVencimento)}`
                      : `De uma vez, até ${formatDate(primeiroVencimento)}`
                  }
                  onEditar={() => irPara("parcelas")}
                />
                <Linha
                  rotulo="Forma"
                  valor={
                    paymentMethod
                      ? `${LOAN_PAYMENT_METHOD_LABEL[paymentMethod]}${paymentMethod === "boleto" && criarBoletos ? " · gera os boletos" : ""}`
                      : "—"
                  }
                  onEditar={() => irPara("forma")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.toUpperCase())}
                  placeholder="opcional"
                  rows={2}
                  autoCapitalize="characters"
                />
              </div>

              {/* Comprovante (print do PIX / transferência) */}
              <div className="space-y-1.5">
                <Label>Comprovante</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => cameraRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    Câmera
                  </button>
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => fileRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                  >
                    <Paperclip className="w-4 h-4" />
                    Anexar arquivo
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
                {fileError && <p className="text-[11px] text-red-600 dark:text-red-400">{fileError}</p>}
                {files.map((f, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700"
                  >
                    <div className="w-7 h-7 rounded-md bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 flex-shrink-0">
                      {fileIcon(f)}
                    </div>
                    <p className="flex-1 min-w-0 text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{f.name}</p>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={isPending}
                      title="Remover"
                      className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Esta tela é só o controle da dívida: nada aqui mexe no caixa. A saída e os recebimentos você
                lança em Finanças, na mão.
              </p>
            </>
          )}

          {/* 7. PRONTO — os boletos gerados (como nos aluguéis: a lista e o
              Gerar no banco) e a confissão de dívida para mandar ao devedor */}
          {passo === "boletos" && (
            <>
              <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                Dívida {loan ? "salva" : "lançada"}.
                {paymentMethod === "boleto" && criarBoletos
                  ? " Confira os boletos e, se estiver certo, gere no banco."
                  : ""}
              </p>

              {/* A CONFISSÃO DE DÍVIDA — abre o documento; lá o "Compartilhar PDF"
                  manda pelo WhatsApp para o devedor assinar */}
              {salvoId && (
                <a
                  href={`/imprimir/confissao/${salvoId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-xl border-2 border-produmar-200 dark:border-produmar-800 bg-produmar-50/60 dark:bg-produmar-950/30 px-4 py-3"
                >
                  <FileSignature className="w-6 h-6 text-produmar-600 dark:text-produmar-400 flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">
                      Confissão de dívida
                    </span>
                    <span className="block text-[12px] text-slate-600 dark:text-slate-300">
                      Abrir e tocar em Compartilhar PDF para mandar ao devedor assinar (WhatsApp), ou imprimir.
                    </span>
                  </span>
                  <ChevronRight className="w-5 h-5 text-produmar-500 flex-shrink-0" />
                </a>
              )}

              {paymentMethod === "boleto" &&
                (dividaSalva ? (
                  <LoanBoletos loan={dividaSalva} />
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Carregando os boletos...</p>
                ))}
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/50">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className={STICKY_FOOTER}>
          {passo === "boletos" ? (
            <Button type="button" onClick={onClose} className="flex-1 h-11">
              Concluir
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => (indice === 0 ? onClose() : irPara(etapas[indice - 1]))}
                disabled={isPending}
                className={cn(FOOTER_CANCEL, "h-11")}
              >
                {indice === 0 ? (
                  "Cancelar"
                ) : (
                  <>
                    <ChevronLeft className="w-4 h-4" />
                    Voltar
                  </>
                )}
              </Button>
              {passo === "conferir" ? (
                <Button type="button" onClick={salvar} disabled={isPending} className={cn(FOOTER_SUBMIT, "h-11")}>
                  {isPending ? "Salvando..." : loan ? "Salvar alterações" : "Lançar dívida"}
                </Button>
              ) : (
                <Button type="button" onClick={proximo} disabled={isPending} className={cn(FOOTER_SUBMIT, "h-11")}>
                  Próximo
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Totais({ principal, interest, total }: { principal: number; interest: number; total: number }) {
  if (!(principal > 0)) return null;
  return (
    <div className="rounded-xl bg-produmar-50 dark:bg-produmar-950/30 border border-produmar-100 dark:border-produmar-900/40 px-3 py-2.5 text-sm space-y-0.5">
      <div className="flex justify-between text-slate-500 dark:text-slate-400">
        <span>Juros</span>
        <span className="tabular-nums">{formatBRL(interest)}</span>
      </div>
      <div className="flex justify-between font-semibold text-produmar-800 dark:text-produmar-300">
        <span>Total a receber</span>
        <span className="tabular-nums">{formatBRL(total)}</span>
      </div>
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  forte,
  onEditar,
}: {
  rotulo: string;
  valor: string;
  forte?: boolean;
  onEditar: () => void;
}) {
  return (
    <button type="button" onClick={onEditar} className="w-full flex items-center gap-3 px-3 py-2 text-left">
      <span className="w-28 flex-shrink-0 text-xs text-slate-500 dark:text-slate-400">{rotulo}</span>
      <span
        className={cn(
          "flex-1 min-w-0 truncate tabular-nums",
          forte ? "font-bold text-slate-900 dark:text-slate-50" : "text-slate-700 dark:text-slate-200"
        )}
      >
        {valor}
      </span>
      <span className="text-[11px] text-produmar-600 dark:text-produmar-400 flex-shrink-0">mudar</span>
    </button>
  );
}
