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
import { formatBRLInput, parseMoney, upperKeepingCaret } from "@/lib/utils";
import { arquivarSecretaria, salvarSecretaria } from "@/app/(app)/prefeitura/actions";
import type { PrefeituraSecretaria } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  secretaria: PrefeituraSecretaria | null;
  onArquivada: () => void;
}

export function SecretariaDialog({ open, onClose, secretaria, onArquivada }: Props) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [contrato, setContrato] = useState("");
  const [padrao, setPadrao] = useState("");

  useEffect(() => {
    if (!open) return;
    setErro(null);
    setNome(secretaria?.nome ?? "");
    setContrato(secretaria?.valor_contrato ? formatBRLInput(Number(secretaria.valor_contrato)) : "");
    setPadrao(secretaria?.valor_padrao ? formatBRLInput(Number(secretaria.valor_padrao)) : "");
  }, [open, secretaria]);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await salvarSecretaria(secretaria?.id ?? null, {
        nome,
        valor_contrato: parseMoney(contrato) || null,
        valor_padrao: parseMoney(padrao) || null,
      });
      if ("error" in r) setErro(r.error);
      else onClose();
    });
  }

  function arquivar() {
    if (!secretaria) return;
    const ativa = !secretaria.ativa;
    if (
      !ativa &&
      !confirm("Arquivar esta secretaria? Ela some das abas, mas as notas dela continuam guardadas.")
    )
      return;
    startTransition(async () => {
      const r = await arquivarSecretaria(secretaria.id, ativa);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      if (!ativa) onArquivada();
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{secretaria ? "Editar secretaria" : "Nova secretaria"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ps_nome">Nome</Label>
            <Input
              id="ps_nome"
              value={nome}
              onChange={(e) => setNome(upperKeepingCaret(e))}
              placeholder="ex: SECRETARIA DE EDUCAÇÃO"
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CampoValor id="ps_contrato" label="Valor do contrato" value={contrato} onChange={setContrato} />
            <CampoValor id="ps_padrao" label="Valor de cada nota" value={padrao} onChange={setPadrao} />
          </div>
          <p className="text-xs text-slate-400">
            O valor de cada nota já vem preenchido ao lançar. Os dois são opcionais.
          </p>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <DialogFooter className="gap-2">
            {secretaria && (
              <Button
                type="button"
                variant="outline"
                onClick={arquivar}
                disabled={pending}
                className="sm:mr-auto"
              >
                {secretaria.ativa ? "Arquivar" : "Reativar"}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CampoValor({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
          R$
        </span>
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(formatBRLInput(e.target.value))}
          placeholder="0,00"
          className="pl-9 tabular-nums"
          autoComplete="off"
        />
      </div>
    </div>
  );
}
