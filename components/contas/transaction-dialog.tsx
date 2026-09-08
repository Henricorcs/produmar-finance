"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { ChevronLeft, Pencil } from "lucide-react";
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
import { cn, formatBRL, formatBRLInput, formatDate, localDateISO, parseMoney } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  transaction?: (Transaction & { transaction_attachments?: TransactionAttachment[] }) | null;
  categories: Category[];
  costCenters: CostCenter[];
  obras?: Obra[];
}

// ── Um campo por tela ────────────────────────────────────────────────────────
// A ficha abria com tudo à mostra e, depois, com os campos se acumulando na
// tela. No celular continuava sendo rolagem e dúvida: qual eu estou preenchendo
// mesmo?
//
// Agora é UM campo de cada vez, em destaque, e mais nada: o que já foi
// preenchido e o que ainda vem não aparecem. No fim, a tela de conferência
// mostra tudo junto com dois botões — CONFIRMAR, que lança, e EDITAR, que
// recomeça a ficha. Cada linha da conferência também abre o seu campo, para
// arrumar um dado só sem passar por todos de novo.
//
// Editar um lançamento antigo cai direto na conferência: o que já está
// preenchido tem que estar à vista de uma vez.

type Passo =
  | "tipo"
  | "descricao"
  | "valor"
  | "vencimento"
  | "status"
  | "categoria"
  | "centro"
  | "obra"
  | "notas"
  | "anexos"
  | "revisao";

/**
 * O caminho do lançamento novo: tipo, destino/origem, valor e situação. Só.
 *
 * O VENCIMENTO saiu do caminho de propósito: quem lança está dando baixa no que
 * já aconteceu ou anotando o que ainda vem, e nos dois casos parar para digitar
 * data era um passo a mais que a ficha antiga nem tinha. Ele nasce no dia de
 * hoje e, quando a situação é pago/recebido, acompanha sozinho a data da baixa
 * — é ela que diz em que mês o lançamento entra. Quem precisar de outra data
 * (a conta que vence no mês que vem) toca na linha do vencimento na conferência.
 */
const CAMINHO: Passo[] = ["tipo", "descricao", "valor", "status"];

/**
 * Na despesa o dinheiro vai para algum lugar; na receita ele vem de algum. O
 * campo é o mesmo (a descrição), mas o nome dele muda com o tipo — é assim que
 * se pergunta na vida real.
 */
function rotuloDaDescricao(type: TransactionType | null): string {
  if (type === "entrada") return "Origem";
  if (type === "saida") return "Destino";
  return "Descrição";
}

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

  // Novo lançamento nasce SEM tipo: a primeira tela é escolher entre despesa e
  // receita, e é essa escolha que abre o resto.
  const [type, setType] = useState<TransactionType | null>(transaction?.type ?? null);
  const [status, setStatus] = useState<TransactionStatus>(transaction?.status ?? "pendente");
  const [categoryId, setCategoryId] = useState<string>(transaction?.category_id ?? "");
  const [costCenterId, setCostCenterId] = useState<string>(transaction?.cost_center_id ?? "");
  const [obraId, setObraId] = useState<string>(transaction?.obra_id ?? "");
  const [descricao, setDescricao] = useState<string>(transaction?.description ?? "");
  const [notas, setNotas] = useState<string>(transaction?.notes ?? "");
  const [vencimento, setVencimento] = useState<string>(transaction?.due_date ?? localDateISO());
  /** A pessoa mexeu na data? Se não, ela segue a data da baixa. */
  const [vencimentoTocado, setVencimentoTocado] = useState(false);
  const [pagamento, setPagamento] = useState<string>(transaction?.paid_date ?? "");
  const [amount, setAmount] = useState<string>(
    transaction?.amount ? formatBRLInput(transaction.amount) : ""
  );

  const [passo, setPasso] = useState<Passo>("tipo");
  /** Veio da conferência para arrumar um campo só: ao continuar, volta pra lá. */
  const [voltarPraRevisao, setVoltarPraRevisao] = useState(false);

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
    if (!open) return;
    setType(transaction?.type ?? null);
    setStatus(transaction?.status ?? "pendente");
    setCategoryId(transaction?.category_id ?? "");
    setCostCenterId(transaction?.cost_center_id ?? "");
    setObraId(transaction?.obra_id ?? "");
    setDescricao(transaction?.description ?? "");
    setNotas(transaction?.notes ?? "");
    setVencimento(transaction?.due_date ?? localDateISO());
    setVencimentoTocado(!!transaction);
    setPagamento(transaction?.paid_date ?? "");
    setAmount(transaction?.amount ? formatBRLInput(transaction.amount) : "");
    setNewFiles([]);
    setExistingAttachments(transaction?.transaction_attachments ?? []);
    setError(null);
    setVoltarPraRevisao(false);
    // Editando, a ficha já existe: começa pela conferência.
    setPasso(transaction ? "revisao" : "tipo");
  }, [open, transaction]);

  // Sync local lists when the parent reloads data
  useEffect(() => setLocalCategories(categories), [categories]);
  useEffect(() => setLocalCostCenters(costCenters), [costCenters]);

  const filteredCategories = useMemo(
    () => localCategories.filter((c) => c.type === type),
    [localCategories, type]
  );
  const isPaid = status === "pago" || status === "recebido";

  const completo =
    !!type && descricao.trim() !== "" && parseMoney(amount) > 0 && vencimento !== "";

  // ── Andar pela ficha ──────────────────────────────────────────────────────
  function irPara(p: Passo) {
    setError(null);
    setPasso(p);
  }

  /** Abre um campo vindo da conferência — ao continuar, volta para ela. */
  function editar(p: Passo) {
    setVoltarPraRevisao(true);
    irPara(p);
  }

  function continuar() {
    if (voltarPraRevisao) {
      setVoltarPraRevisao(false);
      irPara("revisao");
      return;
    }
    const i = CAMINHO.indexOf(passo);
    irPara(i >= 0 && i < CAMINHO.length - 1 ? CAMINHO[i + 1] : "revisao");
  }

  function voltar() {
    if (voltarPraRevisao) {
      setVoltarPraRevisao(false);
      irPara("revisao");
      return;
    }
    const i = CAMINHO.indexOf(passo);
    if (i > 0) irPara(CAMINHO[i - 1]);
    else onClose();
  }

  /** O campo da vez está preenchido a ponto de deixar seguir? */
  const podeSeguir =
    passo === "descricao"
      ? descricao.trim() !== ""
      : passo === "valor"
        ? parseMoney(amount) > 0
        : passo === "vencimento"
          ? vencimento !== ""
          : true;

  /**
   * A data da baixa manda no mês do lançamento: quem recebeu em 31/08 quer ver
   * o lançamento em agosto, não no dia em que digitou. Então o vencimento vai
   * junto — a não ser que a pessoa tenha escolhido uma data à mão.
   */
  function escolherPagamento(data: string) {
    setPagamento(data);
    if (data && !vencimentoTocado) setVencimento(data);
  }

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAmount(formatBRLInput(e.target.value));
  }

  function handleCategoryCreated(cat: Category) {
    setLocalCategories((prev) =>
      [...prev.filter((c) => c.id !== cat.id), cat].sort((a, b) => a.name.localeCompare(b.name))
    );
    setCategoryId(cat.id);
  }

  function handleCostCenterCreated(cc: CostCenter) {
    setLocalCostCenters((prev) =>
      [...prev.filter((c) => c.id !== cc.id), cc].sort((a, b) => a.name.localeCompare(b.name))
    );
    setCostCenterId(cc.id);
  }

  function confirmar() {
    if (!type || !completo) return;

    // Os campos de outros passos não estão na tela, então a ficha é montada do
    // que está guardado — e não do que o formulário mostra neste instante.
    const formData = new FormData();
    formData.set("type", type);
    formData.set("description", descricao.trim().toUpperCase());
    formData.set("amount", amount);
    formData.set("due_date", vencimento);
    formData.set("paid_date", isPaid ? pagamento : "");
    formData.set("status", status);
    formData.set("category_id", categoryId);
    formData.set("cost_center_id", costCenterId);
    formData.set("obra_id", obraId);
    formData.set("notes", notas.trim().toUpperCase());
    newFiles.forEach((f) => formData.append("attachments", f));

    startTransition(async () => {
      const result = transaction
        ? await updateTransaction(transaction.id, formData)
        : await createTransaction(formData);

      if (result && "error" in result) setError(result.error);
      else onClose();
    });
  }

  const indice = CAMINHO.indexOf(passo);
  const nomeDaCategoria = localCategories.find((c) => c.id === categoryId)?.name;
  const nomeDoCentro = localCostCenters.find((c) => c.id === costCenterId)?.name;
  const nomeDaObra = obras.find((o) => o.id === obraId)?.name;
  const anexos = existingAttachments.length + newFiles.length;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">
              {transaction ? "Editar lançamento" : "Novo lançamento"}
            </DialogTitle>
          </DialogHeader>

          {/* Onde estou: só no caminho do lançamento novo */}
          {indice >= 0 && !transaction && (
            <div className="mb-4 space-y-1.5">
              <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                Passo {indice + 1} de {CAMINHO.length}
              </p>
              <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-produmar-500 transition-all duration-300"
                  style={{ width: `${((indice + 1) / CAMINHO.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* ── TIPO ─────────────────────────────────────────────────── */}
            {passo === "tipo" && (
              <PassoDaVez titulo="É despesa ou receita?">
                <div className="grid grid-cols-2 gap-2">
                  {(["saida", "entrada"] as TransactionType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        if (type !== t) setCategoryId("");
                        setType(t);
                        // A escolha já é a resposta: segue sozinho.
                        if (voltarPraRevisao) {
                          setVoltarPraRevisao(false);
                          irPara("revisao");
                        } else irPara("descricao");
                      }}
                      className={cn(
                        "py-4 text-sm rounded-xl border-2 font-semibold transition-colors",
                        type === t
                          ? t === "saida"
                            ? "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-400"
                            : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400"
                          : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                      )}
                    >
                      {t === "saida" ? "💸 Despesa" : "💰 Receita"}
                    </button>
                  ))}
                </div>
              </PassoDaVez>
            )}

            {/* ── DESTINO / ORIGEM ─────────────────────────────────────── */}
            {passo === "descricao" && (
              <PassoDaVez
                titulo={rotuloDaDescricao(type)}
                dica={
                  type === "entrada"
                    ? "De onde veio — ex.: venda de animais"
                    : "Para onde foi — ex.: conta de energia"
                }
              >
                <Input
                  autoFocus
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && podeSeguir) {
                      e.preventDefault();
                      continuar();
                    }
                  }}
                  placeholder="ex: conta de energia"
                  className="h-12 text-base"
                  autoCapitalize="characters"
                  data-caixa="uppercase"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </PassoDaVez>
            )}

            {/* ── VALOR ────────────────────────────────────────────────── */}
            {passo === "valor" && (
              <PassoDaVez titulo="Valor" dica="Dá para falar: mil e quinhentos">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none z-10">
                    R$
                  </span>
                  <Input
                    autoFocus
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={handleAmountChange}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && podeSeguir) {
                        e.preventDefault();
                        continuar();
                      }
                    }}
                    placeholder="0,00"
                    className="h-12 text-base pl-9 tabular-nums"
                    autoComplete="off"
                  />
                </div>
              </PassoDaVez>
            )}

            {/* ── VENCIMENTO ───────────────────────────────────────────── */}
            {passo === "vencimento" && (
              <PassoDaVez
                titulo="Vencimento"
                dica="Dá para falar: hoje, amanhã, dezoito de setembro"
              >
                <Input
                  type="date"
                  value={vencimento}
                  onChange={(e) => {
                    setVencimento(e.target.value);
                    // Mexeu na data: daqui pra frente ela é dela, e não segue
                    // mais a data da baixa.
                    setVencimentoTocado(true);
                  }}
                  className="h-12 text-base"
                />
              </PassoDaVez>
            )}

            {/* ── STATUS ───────────────────────────────────────────────── */}
            {passo === "status" && (
              <PassoDaVez
                titulo="Status"
                dica="Pendente é o normal de quem está lançando o que ainda vai vencer"
              >
                <Select
                  value={status}
                  onValueChange={(v) => {
                    const novo = v as TransactionStatus;
                    setStatus(novo);
                    // Dando baixa: a data é hoje, salvo se ele mudar embaixo.
                    if ((novo === "pago" || novo === "recebido") && !pagamento)
                      escolherPagamento(localDateISO());
                  }}
                >
                  <SelectTrigger className="h-12 text-base">
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

                {isPaid && (
                  <div className="space-y-1.5 pt-2">
                    <Label htmlFor="paid_date">
                      {type === "entrada" ? "Data do recebimento" : "Data do pagamento"}
                    </Label>
                    <Input
                      id="paid_date"
                      type="date"
                      value={pagamento}
                      onChange={(e) => escolherPagamento(e.target.value)}
                      className="h-12 text-base"
                    />
                  </div>
                )}
              </PassoDaVez>
            )}

            {/* ── CATEGORIA ────────────────────────────────────────────── */}
            {passo === "categoria" && (
              <PassoDaVez titulo="Categoria" dica="Opcional — serve para os relatórios">
                <SearchableSelect
                  items={filteredCategories}
                  value={categoryId}
                  onChange={setCategoryId}
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
              </PassoDaVez>
            )}

            {/* ── CENTRO DE CUSTO ──────────────────────────────────────── */}
            {passo === "centro" && (
              <PassoDaVez titulo="Centro de custo" dica="Opcional">
                <SearchableSelect
                  items={localCostCenters}
                  value={costCenterId}
                  onChange={setCostCenterId}
                  getId={(cc) => cc.id}
                  getLabel={(cc) => cc.name}
                  placeholder="Selecione um centro de custo..."
                  searchPlaceholder="Buscar centro de custo..."
                  emptyMessage="Nenhum centro de custo encontrado"
                  onCreateNew={() => setCCDialogOpen(true)}
                  createNewLabel="Criar novo centro de custo"
                  autoFocusSearch={false}
                />
              </PassoDaVez>
            )}

            {/* ── OBRA ─────────────────────────────────────────────────── */}
            {passo === "obra" && (
              <PassoDaVez titulo="Obra" dica="Opcional — vincula o lançamento a uma obra">
                <SearchableSelect
                  items={obras}
                  value={obraId}
                  onChange={setObraId}
                  getId={(o) => o.id}
                  getLabel={(o) => o.name}
                  placeholder="Vincular a uma obra..."
                  searchPlaceholder="Buscar obra..."
                  emptyMessage="Nenhuma obra cadastrada"
                  autoFocusSearch={false}
                />
              </PassoDaVez>
            )}

            {/* ── OBSERVAÇÕES ──────────────────────────────────────────── */}
            {passo === "notas" && (
              <PassoDaVez titulo="Observações" dica="Opcional">
                <Textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="observações opcionais..."
                  rows={3}
                  autoCapitalize="characters"
                  data-caixa="uppercase"
                />
              </PassoDaVez>
            )}

            {/* ── ANEXOS ───────────────────────────────────────────────── */}
            {passo === "anexos" && (
              <PassoDaVez titulo="Anexos" dica="Opcional — nota, recibo, foto">
                <AttachmentUploader
                  newFiles={newFiles}
                  onNewFilesChange={setNewFiles}
                  existingAttachments={existingAttachments}
                  onExistingChange={setExistingAttachments}
                  disabled={isPending}
                />
              </PassoDaVez>
            )}

            {/* ── CONFERÊNCIA ──────────────────────────────────────────── */}
            {passo === "revisao" && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <h3 className="text-base font-semibold text-produmar-800 dark:text-slate-100">
                    Confira antes de lançar
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Toque em qualquer linha para mudar só ela.
                  </p>
                </div>

                <div className="rounded-xl border border-produmar-100 dark:border-slate-700 divide-y divide-produmar-100 dark:divide-slate-700 overflow-hidden">
                  <LinhaDaFicha
                    rotulo="Tipo"
                    valor={type === "entrada" ? "Receita" : type === "saida" ? "Despesa" : null}
                    onEditar={() => editar("tipo")}
                  />
                  <LinhaDaFicha
                    rotulo={rotuloDaDescricao(type)}
                    valor={descricao.trim().toUpperCase() || null}
                    onEditar={() => editar("descricao")}
                  />
                  <LinhaDaFicha
                    rotulo="Valor"
                    valor={parseMoney(amount) > 0 ? formatBRL(parseMoney(amount)) : null}
                    onEditar={() => editar("valor")}
                  />
                  <LinhaDaFicha
                    rotulo="Vencimento"
                    valor={vencimento ? formatDate(vencimento) : null}
                    onEditar={() => editar("vencimento")}
                  />
                  <LinhaDaFicha
                    rotulo="Status"
                    valor={
                      status === "pendente"
                        ? "Pendente"
                        : status === "pago"
                          ? "Pago" + (pagamento ? " em " + formatDate(pagamento) : "")
                          : status === "recebido"
                            ? "Recebido" + (pagamento ? " em " + formatDate(pagamento) : "")
                            : status === "vencido"
                              ? "Vencido"
                              : "Cancelado"
                    }
                    onEditar={() => editar("status")}
                  />
                </div>

                {/* Os opcionais ficam à vista desde o começo: escondê-los atrás
                    de um botão era um toque a mais para ver o que já dava para
                    ver. Continuam opcionais — o "—" não impede de confirmar. */}
                <div className="rounded-xl border border-produmar-100 dark:border-slate-700 divide-y divide-produmar-100 dark:divide-slate-700 overflow-hidden">
                  <LinhaDaFicha
                    rotulo="Categoria"
                    valor={nomeDaCategoria ?? null}
                    onEditar={() => editar("categoria")}
                  />
                  <LinhaDaFicha
                    rotulo="Centro de custo"
                    valor={nomeDoCentro ?? null}
                    onEditar={() => editar("centro")}
                  />
                  {obras.length > 0 && (
                    <LinhaDaFicha
                      rotulo="Obra"
                      valor={nomeDaObra ?? null}
                      onEditar={() => editar("obra")}
                    />
                  )}
                  <LinhaDaFicha
                    rotulo="Observações"
                    valor={notas.trim().toUpperCase() || null}
                    onEditar={() => editar("notas")}
                  />
                  <LinhaDaFicha
                    rotulo="Anexos"
                    valor={anexos > 0 ? `${anexos} arquivo${anexos > 1 ? "s" : ""}` : null}
                    onEditar={() => editar("anexos")}
                  />
                </div>

                {!completo && (
                  <p className="text-[12px] text-amber-700 dark:text-amber-400">
                    Falta preencher o que está como “—”. Toque na linha para completar.
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/50">
                {error}
              </p>
            )}
          </div>

          {/* ── Botões ───────────────────────────────────────────────────── */}
          {passo === "revisao" ? (
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => (transaction ? onClose() : irPara("tipo"))}
                disabled={isPending}
              >
                {transaction ? "Cancelar" : "Editar"}
              </Button>
              <Button type="button" onClick={confirmar} disabled={isPending || !completo}>
                {isPending ? "Salvando..." : transaction ? "Confirmar alterações" : "Confirmar"}
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={voltar} disabled={isPending}>
                <ChevronLeft className="w-4 h-4" />
                {passo === "tipo" && !voltarPraRevisao ? "Cancelar" : "Voltar"}
              </Button>
              {passo !== "tipo" && (
                <Button type="button" onClick={continuar} disabled={!podeSeguir || isPending}>
                  {voltarPraRevisao ? "Pronto" : "Continuar"}
                </Button>
              )}
            </DialogFooter>
          )}
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

/** O campo da vez: título grande, dica curta e o campo em destaque. */
function PassoDaVez({
  titulo,
  dica,
  children,
}: {
  titulo: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 animate-fade-in">
      <div>
        <h3 className="text-base font-semibold text-produmar-800 dark:text-slate-100">{titulo}</h3>
        {dica && <p className="text-xs text-slate-500 dark:text-slate-400">{dica}</p>}
      </div>
      <div className="rounded-xl border-2 border-produmar-200 dark:border-produmar-900/60 bg-produmar-50/40 dark:bg-produmar-950/20 p-3 space-y-1.5">
        {children}
      </div>
    </div>
  );
}

/** Uma linha da conferência. Tocar abre o campo dela. */
function LinhaDaFicha({
  rotulo,
  valor,
  onEditar,
}: {
  rotulo: string;
  valor: string | null;
  onEditar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEditar}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-produmar-50/60 dark:hover:bg-slate-800/60 transition-colors"
    >
      <span className="text-xs text-slate-500 dark:text-slate-400 w-28 flex-shrink-0">
        {rotulo}
      </span>
      <span
        className={cn(
          "flex-1 text-sm text-right truncate",
          valor
            ? "font-medium text-slate-800 dark:text-slate-100"
            : "text-slate-400 dark:text-slate-500"
        )}
      >
        {valor ?? "—"}
      </span>
      <Pencil className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 flex-shrink-0" />
    </button>
  );
}
