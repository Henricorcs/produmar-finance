"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import {
  Camera,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
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
  uploadLoanAttachments,
  type LoanInput,
} from "@/app/(app)/devedores/actions";
import { loanTotalDue, formatBRL, formatBRLInput } from "@/lib/utils";
import { LOAN_PAYMENT_METHODS, LOAN_PAYMENT_METHOD_LABEL } from "@/lib/types";
import type { Loan, LoanPaymentMethod, LoanRepaymentType } from "@/lib/types";
import { comprimirImagens } from "@/lib/comprimir-imagem";

interface Props {
  open: boolean;
  onClose: () => void;
  loan?: Loan | null;
}

function parseBRL(value: string): number {
  const n = parseFloat(value.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

const todayStr = () => new Date().toISOString().split("T")[0];

const MAX_SIZE_MB = 10;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

export function LoanDialog({ open, onClose, loan }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [repaymentType, setRepaymentType] = useState<LoanRepaymentType>("avulso");
  /** Boleto, pix, cartão ou dinheiro — em branco enquanto não se escolhe. */
  const [paymentMethod, setPaymentMethod] = useState<LoanPaymentMethod | null>(null);
  const [amount, setAmount] = useState("");
  const [interestType, setInterestType] = useState<"percent" | "fixed">("percent");
  const [interestRate, setInterestRate] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [interestAmount, setInterestAmount] = useState("");
  const [installments, setInstallments] = useState("");

  // Comprovantes anexados já na criação (ex.: print do PIX)
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setRepaymentType(loan?.repayment_type ?? "avulso");
      setPaymentMethod(loan?.payment_method ?? null);
      setAmount(loan?.principal ? formatBRLInput(loan.principal) : "");
      if (loan?.interest_amount) {
        setInterestType("fixed");
        setInterestAmount(formatBRLInput(loan.interest_amount));
        setInterestRate("");
        setTermMonths("");
      } else {
        setInterestType("percent");
        setInterestAmount("");
        setInterestRate(loan?.interest_rate != null ? String(loan.interest_rate) : "");
        setTermMonths(loan?.term_months != null ? String(loan.term_months) : "");
      }
      setInstallments(loan?.installments_count != null ? String(loan.installments_count) : "");
      setError(null);
      setFiles([]);
      setFileError(null);
      savedIdRef.current = loan?.id ?? null;
    }
  }, [open, loan]);

  // Prévia do total a receber
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

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function fileIcon(f: File) {
    if (f.type.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
    if (f.type.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
    return <FileIcon className="w-4 h-4" />;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const input: LoanInput = {
      borrower_name: String(fd.get("borrower_name") ?? ""),
      borrower_document: String(fd.get("borrower_document") ?? "") || null,
      borrower_phone: String(fd.get("borrower_phone") ?? "") || null,
      principal,
      interest_rate: interestType === "percent" && rate > 0 ? rate : null,
      term_months: interestType === "percent" && months > 0 ? months : null,
      interest_amount: interestType === "fixed" && fixedInterest > 0 ? fixedInterest : null,
      repayment_type: repaymentType,
      installments_count:
        repaymentType === "parcelado" ? parseInt(installments, 10) || null : null,
      payment_method: paymentMethod,
      loan_date: String(fd.get("loan_date") ?? ""),
      due_date: String(fd.get("due_date") ?? "") || null,
      notes: String(fd.get("notes") ?? "") || null,
    };

    startTransition(async () => {
      // Cria/atualiza a dívida. savedIdRef evita recriar caso o upload
      // do comprovante falhe e o usuário tente enviar novamente.
      let loanId = savedIdRef.current;

      if (loanId) {
        if (loan) {
          const result = await updateLoan(loanId, input);
          if (result && "error" in result) {
            setError(result.error ?? "Erro inesperado");
            return;
          }
        }
      } else {
        const result = await createLoan(input);
        if (result && "error" in result) {
          setError(result.error ?? "Erro inesperado");
          return;
        }
        loanId = (result as { id?: string }).id ?? null;
        savedIdRef.current = loanId;
      }

      // Sobe os comprovantes anexados (se houver)
      if (loanId && files.length > 0) {
        const upload = new FormData();
        files.forEach((f) => upload.append("files", f));
        const up = await uploadLoanAttachments(loanId, upload);
        if (up && "error" in up) {
          setError(
            `Dívida salva, mas falha ao anexar o comprovante: ${up.error}. Tente enviar de novo.`
          );
          return;
        }
      }

      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{loan ? "Editar dívida" : "Nova dívida"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Devedor */}
          <div className="space-y-1.5">
            <Label htmlFor="borrower_name">Devedor *</Label>
            <Input
              id="borrower_name"
              name="borrower_name"
              defaultValue={loan?.borrower_name ?? ""}
              placeholder="nome de quem deve"
              autoCapitalize="characters"
              data-caixa="uppercase"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="borrower_document">CPF/CNPJ</Label>
              <Input
                id="borrower_document"
                name="borrower_document"
                defaultValue={loan?.borrower_document ?? ""}
                placeholder="opcional"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="borrower_phone">Telefone</Label>
              <Input
                id="borrower_phone"
                name="borrower_phone"
                defaultValue={loan?.borrower_phone ?? ""}
                placeholder="opcional"
                inputMode="tel"
              />
            </div>
          </div>

          {/* Valor devido */}
          <div className="space-y-1.5">
            <Label htmlFor="amount">Valor devido *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                R$
              </span>
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(formatBRLInput(e.target.value))}
                placeholder="0,00"
                className="pl-9 tabular-nums"
                autoComplete="off"
                required
              />
            </div>
          </div>

          {/* Juros */}
          <div className="space-y-2">
            <Label>Juros</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["percent", "fixed"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setInterestType(t)}
                  className={`py-2 text-xs rounded-lg border font-medium transition-colors ${
                    interestType === t
                      ? "bg-produmar-50 dark:bg-produmar-950/40 border-produmar-300 dark:border-produmar-800 text-produmar-700 dark:text-produmar-400"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                  }`}
                >
                  {t === "percent" ? "% ao mês" : "Valor fixo (R$)"}
                </button>
              ))}
            </div>

            {interestType === "percent" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="interest_rate" className="text-xs text-slate-500 dark:text-slate-400">Taxa (% ao mês)</Label>
                  <Input
                    id="interest_rate"
                    type="text"
                    inputMode="decimal"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder="opcional"
                    className="tabular-nums"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="term_months" className="text-xs text-slate-500 dark:text-slate-400">Prazo (meses)</Label>
                  <Input
                    id="term_months"
                    type="number"
                    min={0}
                    value={termMonths}
                    onChange={(e) => setTermMonths(e.target.value)}
                    placeholder="ex: 6"
                    className="tabular-nums"
                    autoComplete="off"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="interest_fixed" className="text-xs text-slate-500 dark:text-slate-400">
                  Valor dos juros
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                    R$
                  </span>
                  <Input
                    id="interest_fixed"
                    type="text"
                    inputMode="decimal"
                    value={interestAmount}
                    onChange={(e) => setInterestAmount(formatBRLInput(e.target.value))}
                    placeholder="0,00"
                    className="pl-9 tabular-nums"
                    autoComplete="off"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Prévia do total */}
          {principal > 0 && (
            <div className="rounded-lg bg-produmar-50 dark:bg-produmar-950/30 border border-produmar-100 dark:border-produmar-900/40 px-3 py-2 text-xs space-y-0.5">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Juros</span>
                <span className="tabular-nums">{formatBRL(interest)}</span>
              </div>
              <div className="flex justify-between font-semibold text-produmar-800 dark:text-produmar-300">
                <span>Total a receber</span>
                <span className="tabular-nums">{formatBRL(total)}</span>
              </div>
            </div>
          )}

          {/* COMO O DINHEIRO ENTRA — é a primeira pergunta de quem vai cobrar:
              boleto se manda, pix se pede a chave, dinheiro alguém busca.
              Toque de novo no escolhido para deixar em branco. */}
          <div className="space-y-1.5">
            <Label>Forma de pagamento</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {LOAN_PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(paymentMethod === m ? null : m)}
                  className={`min-h-[44px] px-1 text-sm rounded-lg border font-medium transition-colors ${
                    paymentMethod === m
                      ? "bg-produmar-50 dark:bg-produmar-950/40 border-produmar-300 dark:border-produmar-800 text-produmar-700 dark:text-produmar-400"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                  }`}
                >
                  {LOAN_PAYMENT_METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Parcelamento — quantas vezes, não por qual meio. Isto já se
              chamou "Forma de pagamento"; o nome mudou quando o meio do
              pagamento ganhou campo próprio, para não haver dois iguais. */}
          <div className="space-y-1.5">
            <Label>Parcelamento</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["avulso", "parcelado"] as LoanRepaymentType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRepaymentType(t)}
                  className={`py-2.5 text-sm rounded-lg border font-medium transition-colors ${
                    repaymentType === t
                      ? "bg-produmar-50 dark:bg-produmar-950/40 border-produmar-300 dark:border-produmar-800 text-produmar-700 dark:text-produmar-400"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                  }`}
                >
                  {t === "avulso" ? "Pagamentos avulsos" : "Parcelado"}
                </button>
              ))}
            </div>
          </div>

          {repaymentType === "parcelado" && (
            <div className="space-y-1.5">
              <Label htmlFor="installments">Número de parcelas *</Label>
              <Input
                id="installments"
                type="number"
                min={1}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
                placeholder="ex: 6"
                className="tabular-nums"
                autoComplete="off"
              />
              {total > 0 && parseInt(installments, 10) > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ~{formatBRL(total / parseInt(installments, 10))} por parcela, mensais a partir
                  do vencimento.
                </p>
              )}
            </div>
          )}

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loan_date">Data da dívida *</Label>
              <Input
                id="loan_date"
                name="loan_date"
                type="date"
                defaultValue={loan?.loan_date ?? todayStr()}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due_date">
                {repaymentType === "parcelado" ? "1º vencimento" : "Vencimento"}
              </Label>
              <Input
                id="due_date"
                name="due_date"
                type="date"
                defaultValue={loan?.due_date ?? ""}
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={loan?.notes ?? ""}
              placeholder="observações opcionais..."
              rows={2}
              autoCapitalize="characters"
              data-caixa="uppercase"
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
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
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
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
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

            {fileError && (
              <p className="text-[11px] text-red-600 dark:text-red-400">{fileError}</p>
            )}

            {files.length === 0 ? (
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                Print do PIX/transferência, foto ou PDF · até {MAX_SIZE_MB} MB cada
              </p>
            ) : (
              <div className="space-y-1.5">
                {files.map((f, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700"
                  >
                    <div className="w-7 h-7 rounded-md bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 flex-shrink-0">
                      {fileIcon(f)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                        {f.name}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">
                        {f.size < 1024 * 1024
                          ? `${(f.size / 1024).toFixed(0)} kB`
                          : `${(f.size / 1024 / 1024).toFixed(1)} MB`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      disabled={isPending}
                      title="Remover"
                      className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/50">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : loan ? "Salvar alterações" : "Lançar dívida"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
