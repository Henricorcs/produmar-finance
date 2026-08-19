"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { DiaristaObra } from "./lancar-dia-dialog";
import type { Diarista } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  diaristas: Diarista[];
  obras: DiaristaObra[];
  /** Período que já está na tela (o mês aberto) — vem preenchido. */
  defaultFrom: string;
  defaultTo: string;
}

/**
 * "Puxar o relatório": escolhe o período (e, se quiser, uma pessoa ou uma obra)
 * e abre a folha de fechamento numa aba nova — a que o chefe usa para conferir
 * e pagar, com a chave PIX de cada um e o total.
 */
export function RelatorioDialog({
  open,
  onClose,
  diaristas,
  obras,
  defaultFrom,
  defaultTo,
}: Props) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [diaristaId, setDiaristaId] = useState("");
  const [obraId, setObraId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFrom(defaultFrom);
    setTo(defaultTo);
    setDiaristaId("");
    setObraId("");
    setError(null);
  }, [open, defaultFrom, defaultTo]);

  function abrir() {
    if (!from || !to) return setError("Informe o período");
    if (from > to) return setError("A data inicial não pode ser depois da final");

    const params = new URLSearchParams({ de: from, ate: to });
    if (diaristaId) params.set("diarista", diaristaId);
    if (obraId) params.set("obra", obraId);
    window.open(`/imprimir/diaristas?${params.toString()}`, "_blank");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-produmar-50 text-produmar-600 dark:bg-produmar-900/40 dark:text-produmar-300">
              <FileText className="w-4 h-4" />
            </span>
            Relatório de diaristas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="rd_de">De</Label>
              <Input
                id="rd_de"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rd_ate">Até</Label>
              <Input
                id="rd_ate"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Diarista</Label>
            <SearchableSelect
              items={diaristas}
              value={diaristaId}
              onChange={setDiaristaId}
              getId={(d) => d.id}
              getLabel={(d) => d.name}
              placeholder="Todos"
              searchPlaceholder="Buscar diarista..."
              emptyMessage="Nenhum diarista cadastrado"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Obra</Label>
            <SearchableSelect
              items={obras}
              value={obraId}
              onChange={setObraId}
              getId={(o) => o.id}
              getLabel={(o) => o.name}
              placeholder="Todas"
              searchPlaceholder="Buscar obra..."
              emptyMessage="Nenhuma obra cadastrada"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <Button type="button" onClick={abrir} className="w-full h-12 font-semibold">
            Abrir relatório
          </Button>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Abre numa aba nova, pronto para imprimir ou salvar em PDF. Sai um bloco
            por diarista, com os dias, o que foi feito, a chave PIX e o total.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
