"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, X } from "lucide-react";
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
import { createTool, updateTool, uploadToolPhoto } from "@/app/(app)/ferramentas/actions";
import { ConditionPicker } from "./tool-shared";
import type { Tool, ToolCondition } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Ferramenta em edição — null cria uma nova. */
  tool: Tool | null;
}

export function ToolDialog({ open, onClose, tool }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [condition, setCondition] = useState<ToolCondition>("bom");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(tool?.name ?? "");
    setCode(tool?.code ?? "");
    setCondition(tool?.condition ?? "bom");
    setNotes(tool?.notes ?? "");
    setPhoto(null);
    setError(null);
  }, [open, tool]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Informe o nome da ferramenta");
      return;
    }

    startTransition(async () => {
      const input = { name, code, condition, notes };
      const r = tool ? await updateTool(tool.id, input) : await createTool(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }

      // foto é opcional — sobe depois do cadastro
      const toolId = tool?.id ?? (r as { toolId?: string }).toolId;
      if (photo && toolId) {
        const fd = new FormData();
        fd.append("file", photo);
        const up = await uploadToolPhoto(toolId, fd);
        if (up && "error" in up) {
          setError(`Ferramenta salva, mas a foto falhou: ${up.error}`);
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
          <DialogTitle className="dark:text-slate-100">
            {tool ? "Editar ferramenta" : "Nova ferramenta"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tool_name">Nome *</Label>
            <Input
              id="tool_name"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="ex: furadeira, marreta, nível a laser"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tool_code">Código / patrimônio</Label>
            <Input
              id="tool_code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ex: FER-012 (opcional)"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Estado de conservação</Label>
            <ConditionPicker value={condition} onChange={setCondition} />
          </div>

          <div className="space-y-1.5">
            <Label>Foto</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
            {photo ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                  {photo.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPhoto(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                  aria-label="Remover foto"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="w-4 h-4" />
                {tool?.photo_path ? "Trocar foto" : "Adicionar foto"}
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tool_notes">Observações</Label>
            <Textarea
              id="tool_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.toUpperCase())}
              placeholder="detalhes, marca, acessórios..."
              className="uppercase placeholder:normal-case placeholder:lowercase"
              rows={2}
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
              {isPending ? "Salvando..." : tool ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
