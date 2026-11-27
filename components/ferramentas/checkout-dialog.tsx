"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SignaturePad } from "@/components/operador/signature-pad";
import { checkoutTool, uploadLoanReceiverPhoto } from "@/app/(app)/ferramentas/actions";
import type { Obra, ToolWithStatus } from "@/lib/types";
import { upperKeepingCaret } from "@/lib/utils";
import { comprimirImagem } from "@/lib/comprimir-imagem";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Patrimônio com saldo disponível para emprestar. */
  availableTools: ToolWithStatus[];
  /** Pré-seleciona o item (quando aberto a partir do card/detalhe). */
  presetToolId?: string | null;
  obras?: Obra[];
}

export function CheckoutDialog({ open, onClose, availableTools, presetToolId, obras = [] }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [toolId, setToolId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [borrower, setBorrower] = useState("");
  const [destination, setDestination] = useState("");
  const [obraId, setObraId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setToolId(presetToolId ?? "");
    setQuantity("1");
    setBorrower("");
    setDestination("");
    setObraId("");
    setExpectedDate("");
    setNotes("");
    setSignature(null);
    setPhoto(null);
    setError(null);
  }, [open, presetToolId]);

  const presetTool = presetToolId
    ? availableTools.find((t) => t.id === presetToolId) ?? null
    : null;

  // saldo do item selecionado (preset ou escolhido no select)
  const selectedTool = availableTools.find((t) => t.id === toolId) ?? presetTool;
  const maxQty = selectedTool?.available_qty ?? 1;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!toolId) {
      setError("Selecione o patrimônio");
      return;
    }
    if (!borrower.trim()) {
      setError("Informe quem está levando emprestado");
      return;
    }
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    if (qty > maxQty) {
      setError(`Saldo insuficiente (disponível: ${maxQty})`);
      return;
    }

    startTransition(async () => {
      const r = await checkoutTool({
        tool_id: toolId,
        quantity: qty,
        borrower_name: borrower,
        destination,
        obra_id: obraId || null,
        expected_return_date: expectedDate || null,
        notes,
        receiver_signature: signature,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao registrar o empréstimo");
        return;
      }

      // foto é opcional — sobe depois de criar o empréstimo
      const loanId = (r as { loanId?: string }).loanId;
      if (photo && loanId) {
        const fd = new FormData();
        fd.append("file", photo);
        const up = await uploadLoanReceiverPhoto(loanId, fd);
        if (up && "error" in up) {
          setError(`Empréstimo registrado, mas a foto falhou: ${up.error}`);
          return;
        }
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Emprestar patrimônio</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Patrimônio *</Label>
            {presetTool ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                {presetTool.name}
                {presetTool.code ? (
                  <span className="text-xs text-slate-400 ml-1.5">{presetTool.code}</span>
                ) : null}
              </div>
            ) : (
              <SearchableSelect
                items={availableTools}
                value={toolId}
                onChange={setToolId}
                getId={(t) => t.id}
                getLabel={(t) => t.name}
                renderItem={(t) => (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate">{t.name}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">
                      {t.code ? `${t.code} · ` : ""}
                      {t.available_qty} disp.
                    </span>
                  </div>
                )}
                placeholder="Selecione o patrimônio..."
                searchPlaceholder="Buscar patrimônio..."
                emptyMessage="Nenhum patrimônio disponível"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="co_quantity">Quantidade *</Label>
            <Input
              id="co_quantity"
              type="number"
              min={1}
              max={maxQty}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="tabular-nums"
              inputMode="numeric"
              autoComplete="off"
            />
            {selectedTool && (
              <p className="text-[11px] text-slate-400">
                Saldo disponível: {maxQty} {selectedTool.unit}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="co_borrower">Quem está levando *</Label>
            <Input
              id="co_borrower"
              value={borrower}
              onChange={(e) => setBorrower(upperKeepingCaret(e))}
              placeholder="nome de quem pegou emprestado"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="co_destination">Onde vai usar</Label>
            <Input
              id="co_destination"
              value={destination}
              onChange={(e) => setDestination(upperKeepingCaret(e))}
              placeholder="obra / local (opcional)"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>

          {obras.length > 0 && (
            <div className="space-y-1.5">
              <Label>Obra</Label>
              <SearchableSelect
                items={obras}
                value={obraId}
                onChange={setObraId}
                getId={(o) => o.id}
                getLabel={(o) => o.name}
                placeholder="Vincular a uma obra (opcional)..."
                searchPlaceholder="Buscar obra..."
                telaCheia
                titulo="Escolher obra"
                lembrarRecentes="obras"
                emptyMessage="Nenhuma obra cadastrada"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="co_expected">Previsão de devolução</Label>
            <Input
              id="co_expected"
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Foto de quem recebeu</Label>
            {/* `capture` força a câmera no celular — o segundo input é para quem
                já tirou a foto antes. */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={async (e) => {
                const escolhida = e.target.files?.[0] ?? null;
                e.target.value = "";
                // Encolhe no próprio celular antes de subir.
                setPhoto(escolhida ? await comprimirImagem(escolhida) : null);
              }}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const escolhida = e.target.files?.[0] ?? null;
                e.target.value = "";
                // Encolhe no próprio celular antes de subir.
                setPhoto(escolhida ? await comprimirImagem(escolhida) : null);
              }}
            />
            {photo ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                  {photo.name}
                </span>
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                  aria-label="Remover foto"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => fileRef.current?.click()}
                >
                  <Camera className="w-4 h-4" />
                  Tirar foto
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => galleryRef.current?.click()}
                >
                  <ImagePlus className="w-4 h-4" />
                  Escolher foto
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Assinatura de quem recebeu</Label>
            <SignaturePad onChange={setSignature} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="co_notes">Observações</Label>
            <Input
              id="co_notes"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Registrando..." : "Emprestar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
