"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { QuickCreateCategoryDialog } from "./quick-create-category-dialog";
import { QuickCreateCostCenterDialog } from "./quick-create-cost-center-dialog";
import { AttachmentUploader } from "./attachment-uploader";
import { createTransaction, updateTransaction } from "@/app/(app)/contas/actions";
import type {
  Category,
  CostCenter,
  Obra,
  Transaction,
  TransactionAttachment,
  TransactionStatus,
  TransactionType,
} from "@/lib/types";
import { BotaoDitado } from "@/components/ui/botao-ditado";
import { formatBRLInput, parseMoney } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  transaction?: (Transaction & { transaction_attachments?: TransactionAttachment[] }) | null;
  categories: Category[];
  costCenters: CostCenter[];
  obras?: Obra[];
}

// ── Um campo por vez ─────────────────────────────────────────────────────────
// A tela abria com a ficha inteira à mostra — dez campos de uma vez, e nove
// deles opcionais. No celular isso é rolagem e dúvida ("preciso preencher tudo
// isso?").
//
// Agora o formulário vai se abrindo: escolhe despesa ou receita e aparece só a
// descrição; escreveu, aparece o valor; preencheu, aparece o vencimento, e
// assim por diante. O que já foi preenchido continua na tela, para conferir e
// corrigir antes de lançar.
//
// Da parte opcional em diante (categoria, centro de custo, obra, observações e
// anexos) quem chama o próximo campo é o botão "Continuar" — assim ninguém é
// obrigado a passar por campo que não vai usar: com o obrigatório preenchido, o
// botão Lançar já está liberado.
const P_TIPO = 0;
const P_DESCRICAO = 1;
const P_VALOR = 2;
const P_VENCIMENTO = 3;
const P_STATUS = 4;
const P_CATEGORIA = 5;
const P_CENTRO = 6;
const P_OBRA = 7;
const P_NOTAS = 8;
const P_ANEXOS = 9;

const NOME_DO_PASSO: Record<number, string> = {
  [P_CATEGORIA]: "Categoria",
  [P_CENTRO]: "Centro de custo",
  [P_OBRA]: "Obra",
  [P_NOTAS]: "Observações",
  [P_ANEXOS]: "Anexos",
};

export function TransactionDialog({
  open,
  onClose,
  transaction,
  categories,
  costCenters,
  obras = [],
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Novo lançamento nasce SEM tipo: a primeira coisa da tela é escolher entre
  // despesa e receita, e é essa escolha que abre o resto.
  const [type, setType] = useState<TransactionType | null>(transaction?.type ?? null);
  const [status, setStatus] = useState<TransactionStatus>(transaction?.status ?? "pendente");
  const [categoryId, setCategoryId] = useState<string>(transaction?.category_id ?? "");
  const [costCenterId, setCostCenterId] = useState<string>(transaction?.cost_center_id ?? "");
  const [obraId, setObraId] = useState<string>(transaction?.obra_id ?? "");
  const [descricao, setDescricao] = useState<string>(transaction?.description ?? "");
  const [notas, setNotas] = useState<string>(transaction?.notes ?? "");
  const [vencimento, setVencimento] = useState<string>(transaction?.due_date ?? "");
  const [amount, setAmount] = useState<string>(
    transaction?.amount ? formatBRLInput(transaction.amount) : ""
  );
  const [passo, setPasso] = useState<number>(P_TIPO);

  // Local lists so we can insert newly-created entities optimistically
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);
  const [localCostCenters, setLocalCostCenters] = useState<CostCenter[]>(costCenters);

  // Quick-create dialogs
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [ccDialogOpen, setCCDialogOpen] = useState(false);

  // Attachments
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<TransactionAttachment[]>(
    transaction?.transaction_attachments ?? []
  );

  useEffect(() => {
    if (open) {
      setType(transaction?.type ?? null);
      setStatus(transaction?.status ?? "pendente");
      setCategoryId(transaction?.category_id ?? "");
      setCostCenterId(transaction?.cost_center_id ?? "");
      setObraId(transaction?.obra_id ?? "");
      setDescricao(transaction?.description ?? "");
      setNotas(transaction?.notes ?? "");
      setVencimento(transaction?.due_date ?? "");
      setAmount(transaction?.amount ? formatBRLInput(transaction.amount) : "");
      setNewFiles([]);
      setExistingAttachments(transaction?.transaction_attachments ?? []);
      setError(null);
      // Editando, a ficha já está preenchida: mostra tudo de uma vez.
      setPasso(transaction ? P_ANEXOS : P_TIPO);
    }
  }, [open, transaction]);

  // Sync local lists when the parent reloads data
  useEffect(() => setLocalCategories(categories), [categories]);
  useEffect(() => setLocalCostCenters(costCenters), [costCenters]);

  // A categoria é de despesa OU de receita: trocar o tipo limpa a que estava
  // escolhida. Quem faz isso é o próprio botão do tipo (lá embaixo), e não um
  // efeito no `type` — o efeito também disparava ao ABRIR a tela de edição,
  // apagando a categoria que a ficha já tinha.

  const filteredCategories = useMemo(
    () => localCategories.filter((c) => c.type === type),
    [localCategories, type]
  );
  const isPaid = status === "pago" || status === "recebido";

  /** Abre o próximo campo (nunca fecha o que já apareceu). */
  function avancar(ate: number) {
    setPasso((atual) => Math.max(atual, ate));
  }

  /** Sem obra cadastrada, o passo da obra não existe: pula por cima dele. */
  function depoisDe(p: number): number {
    const proximo = p + 1;
    if (proximo === P_OBRA && obras.length === 0) return P_NOTAS;
    return proximo;
  }

  const completo =
    !!type && descricao.trim() !== "" && parseMoney(amount) > 0 && vencimento !== "";

  // Escrito no teclado ou falado no microfone, o caminho é o mesmo: guarda o
  // texto e abre o próximo campo.
  function escreverDescricao(valor: string) {
    setDescricao(valor);
    if (valor.trim()) avancar(P_VALOR);
  }

  function escreverNotas(valor: string) {
    setNotas(valor);
    if (valor.trim()) avancar(P_ANEXOS);
  }

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valor = formatBRLInput(e.target.value);
    setAmount(valor);
    if (parseMoney(valor) > 0) avancar(P_VENCIMENTO);
  }

  function handleCategoryCreated(cat: Category) {
    setLocalCategories((prev) =>
      [...prev.filter((c) => c.id !== cat.id), cat].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    setCategoryId(cat.id);
    avancar(P_CENTRO);
  }

  function handleCostCenterCreated(cc: CostCenter) {
    setLocalCostCenters((prev) =>
      [...prev.filter((c) => c.id !== cc.id), cc].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    setCostCenterId(cc.id);
    avancar(depoisDe(P_CENTRO));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!type) return;
    const formData = new FormData(e.currentTarget);

    formData.set("description", descricao.trim().toUpperCase());
    formData.set(
      "notes",
      notas.trim().toUpperCase()
    );

    formData.set("type", type);
    formData.set("status", status);
    formData.set("category_id", categoryId);
    formData.set("cost_center_id", costCenterId);
    formData.set("obra_id", obraId);
    formData.set("amount", amount);
    formData.set("due_date", vencimento);

    // Append new file uploads
    newFiles.forEach((f) => formData.append("attachments", f));

    startTransition(async () => {
      const result = transaction
        ? await updateTransaction(transaction.id, formData)
        : await createTransaction(formData);

      if (result && "error" in result) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  const proximo = depoisDe(passo);
  const mostrarContinuar = passo >= P_STATUS && passo < P_ANEXOS;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">
              {transaction ? "Editar lançamento" : "Novo lançamento"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type selector */}
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["saida", "entrada"] as TransactionType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      if (type !== t) setCategoryId("");
                      setType(t);
                      avancar(P_DESCRICAO);
                    }}
                    className={`py-2.5 text-sm rounded-lg border font-medium transition-colors ${
                      type === t
                        ? t === "saida"
                          ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400"
                          : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                    }`}
                  >
                    {t === "saida" ? "💸 Despesa" : "💰 Receita"}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            {passo >= P_DESCRICAO && (
              <div className="space-y-1.5 animate-fade-in">
                <Label htmlFor="description">Descrição *</Label>
                {/* Dá para falar em vez de digitar: o microfone escreve no campo */}
                <div className="relative">
                  <Input
                    id="description"
                    name="description"
                    value={descricao}
                    onChange={(e) => escreverDescricao(e.target.value)}
                    placeholder="ex: conta de energia"
                    className="pr-11"
                    autoCapitalize="characters"
                    data-caixa="uppercase"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                  <BotaoDitado
                    atual={descricao}
                    onTexto={escreverDescricao}
                    rotulo="Ditar a descrição"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                  />
                </div>
              </div>
            )}

            {/* Amount */}
            {passo >= P_VALOR && (
              <div className="space-y-1.5 animate-fade-in">
                <Label htmlFor="amount">Valor (R$) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                    R$
                  </span>
                  <Input
                    id="amount"
                    name="amount"
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0,00"
                    className="pl-9 tabular-nums"
                    autoComplete="off"
                    required
                  />
                </div>
              </div>
            )}

            {/* Dates */}
            {passo >= P_VENCIMENTO && (
              <div className="grid grid-cols-2 gap-3 animate-fade-in">
                <div className="space-y-1.5">
                  <Label htmlFor="due_date">Vencimento *</Label>
                  <Input
                    id="due_date"
                    name="due_date"
                    type="date"
                    value={vencimento}
                    onChange={(e) => {
                      setVencimento(e.target.value);
                      if (e.target.value) avancar(P_STATUS);
                    }}
                    required
                  />
                </div>
                {isPaid && passo >= P_STATUS && (
                  <div className="space-y-1.5">
                    <Label htmlFor="paid_date">Data de pagamento</Label>
                    <Input
                      id="paid_date"
                      name="paid_date"
                      type="date"
                      defaultValue={transaction?.paid_date ?? ""}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Status */}
            {passo >= P_STATUS && (
              <div className="space-y-1.5 animate-fade-in">
                <Label>Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => {
                    setStatus(v as TransactionStatus);
                    avancar(P_CATEGORIA);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    {type === "entrada" ? (
                      <SelectItem value="recebido">Recebido</SelectItem>
                    ) : (
                      <SelectItem value="pago">Pago</SelectItem>
                    )}
                    <SelectItem value="vencido">Vencido</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Category — searchable + create new */}
            {passo >= P_CATEGORIA && (
              <div className="space-y-1.5 animate-fade-in">
                <Label>Categoria</Label>
                <SearchableSelect
                  items={filteredCategories}
                  value={categoryId}
                  onChange={(v) => {
                    setCategoryId(v);
                    avancar(P_CENTRO);
                  }}
                  getId={(c) => c.id}
                  getLabel={(c) => c.name}
                  renderItem={(c) => (
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="truncate">{c.name}</span>
                    </div>
                  )}
                  placeholder="Selecione uma categoria..."
                  searchPlaceholder="Buscar categoria..."
                  emptyMessage="Nenhuma categoria encontrada"
                  onCreateNew={() => setCatDialogOpen(true)}
                  createNewLabel="Criar nova categoria"
                  autoFocusSearch={false}
                />
              </div>
            )}

            {/* Cost Center — searchable + create new */}
            {passo >= P_CENTRO && (
              <div className="space-y-1.5 animate-fade-in">
                <Label>Centro de custo</Label>
                <SearchableSelect
                  items={localCostCenters}
                  value={costCenterId}
                  onChange={(v) => {
                    setCostCenterId(v);
                    avancar(depoisDe(P_CENTRO));
                  }}
                  getId={(cc) => cc.id}
                  getLabel={(cc) => cc.name}
                  placeholder="Selecione um centro de custo..."
                  searchPlaceholder="Buscar centro de custo..."
                  emptyMessage="Nenhum centro de custo encontrado"
                  onCreateNew={() => setCCDialogOpen(true)}
                  createNewLabel="Criar novo centro de custo"
                  autoFocusSearch={false}
                />
              </div>
            )}

            {/* Obra — vínculo opcional */}
            {obras.length > 0 && passo >= P_OBRA && (
              <div className="space-y-1.5 animate-fade-in">
                <Label>Obra</Label>
                <SearchableSelect
                  items={obras}
                  value={obraId}
                  onChange={(v) => {
                    setObraId(v);
                    avancar(P_NOTAS);
                  }}
                  getId={(o) => o.id}
                  getLabel={(o) => o.name}
                  placeholder="Vincular a uma obra (opcional)..."
                  searchPlaceholder="Buscar obra..."
                  emptyMessage="Nenhuma obra cadastrada"
                  autoFocusSearch={false}
                />
              </div>
            )}

            {/* Notes */}
            {passo >= P_NOTAS && (
              <div className="space-y-1.5 animate-fade-in">
                <Label htmlFor="notes">Observações</Label>
                <div className="relative">
                  <Textarea
                    id="notes"
                    name="notes"
                    value={notas}
                    onChange={(e) => escreverNotas(e.target.value)}
                    placeholder="observações opcionais..."
                    rows={2}
                    className="pr-11"
                    autoCapitalize="characters"
                    data-caixa="uppercase"
                  />
                  <BotaoDitado
                    atual={notas}
                    onTexto={escreverNotas}
                    rotulo="Ditar a observação"
                    className="absolute right-1 bottom-1"
                  />
                </div>
              </div>
            )}

            {/* Attachments */}
            {passo >= P_ANEXOS && (
              <div className="space-y-1.5 animate-fade-in">
                <Label>Anexos</Label>
                <AttachmentUploader
                  newFiles={newFiles}
                  onNewFilesChange={setNewFiles}
                  existingAttachments={existingAttachments}
                  onExistingChange={setExistingAttachments}
                  disabled={isPending}
                />
              </div>
            )}

            {/* Chama o próximo campo da parte opcional */}
            {mostrarContinuar && (
              <button
                type="button"
                onClick={() => avancar(proximo)}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-produmar-200 dark:border-slate-700 py-2.5 text-sm font-medium text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
                Continuar · {NOME_DO_PASSO[proximo]}
              </button>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending || !completo}>
                {isPending ? "Salvando..." : transaction ? "Salvar alterações" : "Lançar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Nested dialogs for inline creation */}
      <QuickCreateCategoryDialog
        open={catDialogOpen}
        onClose={() => setCatDialogOpen(false)}
        defaultType={type ?? "saida"}
        onCreated={handleCategoryCreated}
      />
      <QuickCreateCostCenterDialog
        open={ccDialogOpen}
        onClose={() => setCCDialogOpen(false)}
        onCreated={handleCostCenterCreated}
      />
    </>
  );
}
