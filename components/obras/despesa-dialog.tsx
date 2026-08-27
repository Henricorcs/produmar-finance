"use client";

import { useEffect, useState, useTransition } from "react";
import { Receipt, Trash2 } from "lucide-react";
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
import { PhotoField } from "@/components/almoxarifado/supply-shared";
import {
  createSupplyObraDespesa,
  deleteSupplyObraDespesa,
  getSupplyPhotoUrls,
  removeSupplyObraDespesaPhoto,
  updateSupplyObraDespesa,
  uploadSupplyObraDespesaPhoto,
} from "@/app/(app)/almoxarifado/actions";
import { formatBRLInput, localDateISO, parseMoney, upperKeepingCaret } from "@/lib/utils";
import type { SupplyObraDespesa } from "@/lib/types";

/**
 * As categorias que aparecem como atalho. O campo aceita qualquer texto — a
 * lista é só para não ter dez jeitos de escrever "combustível" e o relatório
 * por categoria continuar somando certo.
 */
const CATEGORIAS = [
  "COMPRA DIRETA",
  "COMBUSTÍVEL",
  "SERVIÇO DE TERCEIRO",
  "ALUGUEL DE MÁQUINA",
  "FRETE",
  "ALIMENTAÇÃO",
  "MANUTENÇÃO",
];

interface Props {
  open: boolean;
  onClose: () => void;
  obraId: string;
  obraNome: string;
  /** Despesa em edição — null lança uma nova. */
  despesa: SupplyObraDespesa | null;
}

/**
 * DESPESA AVULSA da obra — o gasto que não passa pelo Estoque nem pela diária:
 * a compra direta, o combustível, o frete, o serviço de terceiro.
 *
 * Isto NÃO cria lançamento no módulo Contas: é registro e relatório dentro de
 * Obras. A ligação com Contas fica para depois.
 */
export function DespesaDialog({
  open,
  onClose,
  obraId,
  obraNome,
  despesa,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(localDateISO());
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [person, setPerson] = useState("");
  const [notes, setNotes] = useState("");

  const [photo, setPhoto] = useState<File | null>(null);
  /** Comprovante que já está salvo — só existe na edição. */
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(despesa?.expense_date ?? localDateISO());
    setCategory(despesa?.category ?? "");
    setDescription(despesa?.description ?? "");
    setAmount(despesa ? formatBRLInput(Number(despesa.amount)) : "");
    setPerson(despesa?.person ?? "");
    setNotes(despesa?.notes ?? "");
    setPhoto(null);
    setPhotoUrl(null);
    setError(null);

    // o comprovante já salvo: o endereço é montado no servidor
    const path = despesa?.photo_path;
    if (!path) return;
    let cancelled = false;
    getSupplyPhotoUrls([path]).then((r) => {
      if (cancelled || !("urls" in r)) return;
      setPhotoUrl(r.urls[path] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, despesa]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Escreva o que foi a despesa");
      return;
    }
    const valor = parseMoney(amount);
    if (valor <= 0) {
      setError("Informe o valor da despesa");
      return;
    }

    startTransition(async () => {
      const input = {
        obra_id: obraId,
        expense_date: date || null,
        category,
        description,
        amount: valor,
        person,
        notes,
      };

      const r = despesa
        ? await updateSupplyObraDespesa(despesa.id, input)
        : await createSupplyObraDespesa(input);

      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }

      const despesaId = despesa?.id ?? (r as { despesaId?: string }).despesaId;
      if (photo && despesaId) {
        const fd = new FormData();
        fd.append("file", photo);
        const up = await uploadSupplyObraDespesaPhoto(despesaId, fd);
        if (up && "error" in up) {
          setError(`Despesa salva, mas o comprovante falhou: ${up.error}`);
          return;
        }
      }

      onClose();
    });
  }

  function handleRemovePhoto() {
    if (!despesa) return;
    startTransition(async () => {
      const r = await removeSupplyObraDespesaPhoto(despesa.id);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao remover o comprovante");
        return;
      }
      setPhotoUrl(null);
    });
  }

  function handleDelete() {
    if (!despesa) return;
    if (!confirm(`Apagar a despesa "${despesa.description}"? Isso não tem volta.`)) return;
    startTransition(async () => {
      const r = await deleteSupplyObraDespesa(despesa.id);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao apagar");
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
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
              <Receipt className="w-4 h-4" />
            </span>
            {despesa ? "Editar despesa" : "Nova despesa"}
          </DialogTitle>
          <p className="text-[11px] text-slate-400">{obraNome}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="de_desc">O que foi *</Label>
            <Input
              id="de_desc"
              value={description}
              onChange={(e) => setDescription(upperKeepingCaret(e))}
              placeholder="ex: 10 sacos de cimento"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="de_valor">Valor *</Label>
            <Input
              id="de_valor"
              value={amount}
              onChange={(e) => setAmount(formatBRLInput(e.target.value))}
              placeholder="0,00"
              inputMode="decimal"
              className="tabular-nums text-lg font-semibold"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="de_data">Data</Label>
            <Input
              id="de_data"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              O dia do gasto — é por ele que o extrato se organiza.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="de_cat">Categoria</Label>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {CATEGORIAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(category === c ? "" : c)}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                    category === c
                      ? "bg-violet-600 border-violet-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <Input
              id="de_cat"
              value={category}
              onChange={(e) => setCategory(upperKeepingCaret(e))}
              placeholder="ou escreva a sua"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="de_quem">De quem / quem fez</Label>
            <Input
              id="de_quem"
              value={person}
              onChange={(e) => setPerson(upperKeepingCaret(e))}
              placeholder="loja, fornecedor ou pessoa"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <PhotoField
            label="Comprovante"
            hint="Nota, recibo ou foto do pagamento"
            file={photo}
            onChange={setPhoto}
            currentUrl={photoUrl}
            onRemoveCurrent={handleRemovePhoto}
          />

          <div className="space-y-1.5">
            <Label htmlFor="de_obs">Observações</Label>
            <Textarea
              id="de_obs"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              rows={2}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            A despesa fica só aqui, no controle da obra — ela não vira lançamento no
            módulo Contas.
          </p>

          <DialogFooter>
            {despesa && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                aria-label="Apagar despesa"
                className="h-10 px-4 rounded-md border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors mr-auto"
              >
                <Trash2 className="w-4 h-4 inline" />
              </button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : despesa ? "Salvar" : "Lançar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
