"use client";

import { useEffect, useState, useTransition } from "react";
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
import { formatBRL, localDateISO } from "@/lib/utils";
import { darBaixa } from "@/app/(app)/prefeitura/actions";

interface Props {
  open: boolean;
  onClose: () => void;
  ids: string[];
  valor: number;
  onFeito: () => void;
}

/** A prefeitura paga várias notas num depósito só: uma data para todas. */
export function BaixaDialog({ open, onClose, ids, valor, onFeito }: Props) {
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setData(localDateISO());
      setErro(null);
    }
  }, [open]);

  function confirmar() {
    startTransition(async () => {
      const r = await darBaixa(ids, data);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      onFeito();
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Dar baixa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {ids.length} {ids.length === 1 ? "nota" : "notas"} · {formatBRL(valor)}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="pb_data">Data do pagamento</Label>
            <Input id="pb_data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || !data}>
            {pending ? "Salvando..." : "Confirmar baixa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
