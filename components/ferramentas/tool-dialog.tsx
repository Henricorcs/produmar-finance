"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, X, Settings2 } from "lucide-react";
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
import { createTool, updateTool, uploadToolPhotos } from "@/app/(app)/ferramentas/actions";
import { ConditionPicker, parseMoney, formatBRLInput } from "./tool-shared";
import { ToolUnitsDialog } from "./tool-units-dialog";
import type { Tool, ToolCondition, ToolUnit, ToolWarehouse } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Patrimônio em edição — null cria um novo. */
  tool: Tool | null;
  /** Tipos de unidade cadastrados. */
  units: ToolUnit[];
  /** Almoxarifados cadastrados. */
  warehouses: ToolWarehouse[];
  /** Almoxarifado que a tela está mostrando — já vem escolhido no cadastro. */
  defaultWarehouseId?: string | null;
}

export function ToolDialog({
  open,
  onClose,
  tool,
  units,
  warehouses,
  defaultWarehouseId,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [condition, setCondition] = useState<ToolCondition>("bom");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("unidade");
  const [unitValue, setUnitValue] = useState("");
  const [replacementValue, setReplacementValue] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(tool?.name ?? "");
    setCode(tool?.code ?? "");
    setCondition(tool?.condition ?? "bom");
    setQuantity(tool ? String(tool.quantity) : "1");
    setUnit(tool?.unit ?? "unidade");
    setUnitValue(tool?.unit_value ? formatBRLInput(tool.unit_value) : "");
    setReplacementValue(
      tool?.replacement_value ? formatBRLInput(tool.replacement_value) : ""
    );
    // item novo já nasce no almoxarifado que está sendo mostrado na tela
    setWarehouseId(
      tool?.warehouse_id ?? defaultWarehouseId ?? warehouses[0]?.id ?? ""
    );
    setNotes(tool?.notes ?? "");
    setPhotos([]);
    setError(null);
    // `warehouses` muda a cada refresh do servidor; abrir o diálogo é o gatilho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tool, defaultWarehouseId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Informe o nome do patrimônio");
      return;
    }
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));

    startTransition(async () => {
      const input = {
        name,
        code,
        condition,
        quantity: qty,
        unit,
        unit_value: parseMoney(unitValue),
        replacement_value: parseMoney(replacementValue),
        warehouse_id: warehouseId || null,
        notes,
      };
      const r = tool ? await updateTool(tool.id, input) : await createTool(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }

      // fotos são opcionais — sobem depois do cadastro
      const toolId = tool?.id ?? (r as { toolId?: string }).toolId;
      if (photos.length > 0 && toolId) {
        const fd = new FormData();
        photos.forEach((p) => fd.append("files", p));
        const up = await uploadToolPhotos(toolId, fd);
        if (up && "error" in up) {
          setError(`Patrimônio salvo, mas as fotos falharam: ${up.error}`);
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
            {tool ? "Editar patrimônio" : "Novo patrimônio"}
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

          {/* Onde fica guardado */}
          <div className="space-y-1.5">
            <Label htmlFor="tool_warehouse">Almoxarifado</Label>
            <select
              id="tool_warehouse"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-full h-11 text-base rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-800 dark:text-slate-100 sm:h-10 sm:text-sm"
            >
              <option value="">Sem almoxarifado</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            {warehouses.length === 0 && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Nenhum almoxarifado cadastrado ainda — use &quot;Almoxarifados&quot; na tela
                de patrimônio.
              </p>
            )}
          </div>

          {/* Quantidade + unidade */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="tool_quantity">Quantidade *</Label>
              <Input
                id="tool_quantity"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="tabular-nums"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="tool_unit">Unidade</Label>
                <button
                  type="button"
                  onClick={() => setUnitsOpen(true)}
                  className="flex items-center gap-1 text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
                >
                  <Settings2 className="w-3 h-3" />
                  Gerenciar
                </button>
              </div>
              <select
                id="tool_unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full h-10 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-800 dark:text-slate-100"
              >
                {/* unidade atual pode não estar mais no cadastro (foi removida) */}
                {!units.some((u) => u.name === unit) && (
                  <option value={unit}>{unit}</option>
                )}
                {units.map((u) => (
                  <option key={u.id} value={u.name}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Valores */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="tool_unit_value">Valor unitário (R$)</Label>
              <Input
                id="tool_unit_value"
                value={unitValue}
                onChange={(e) => setUnitValue(formatBRLInput(e.target.value))}
                placeholder="0,00"
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tool_replacement_value">Valor de reposição (R$)</Label>
              <Input
                id="tool_replacement_value"
                value={replacementValue}
                onChange={(e) => setReplacementValue(formatBRLInput(e.target.value))}
                placeholder="0,00"
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Estado de conservação</Label>
            <ConditionPicker value={condition} onChange={setCondition} />
          </div>

          <div className="space-y-1.5">
            <Label>Fotos</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                if (picked.length) setPhotos((prev) => [...prev, ...picked]);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            {photos.length > 0 && (
              <ul className="space-y-1.5">
                {photos.map((p, i) => (
                  <li
                    key={`${p.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2"
                  >
                    <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                      {p.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                      aria-label="Remover foto"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="w-4 h-4" />
              {photos.length > 0 ? "Adicionar mais fotos" : "Adicionar fotos"}
            </Button>
            {tool && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                As fotos atuais ficam salvas. Aqui você adiciona novas — para
                remover, use a galeria nos detalhes do patrimônio.
              </p>
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

        <ToolUnitsDialog open={unitsOpen} onClose={() => setUnitsOpen(false)} units={units} />
      </DialogContent>
    </Dialog>
  );
}
