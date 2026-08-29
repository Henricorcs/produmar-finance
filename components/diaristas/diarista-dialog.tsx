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
import { Textarea } from "@/components/ui/textarea";
import { createDiarista, updateDiarista } from "@/app/(app)/diaristas/actions";
import { formatBRLInput, parseMoney, upperKeepingCaret } from "@/lib/utils";
import { PROFISSOES_SUGERIDAS, type Diarista, type WorkerType } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Colaborador em edição — null cadastra um novo. */
  diarista: Diarista | null;
  onCreated?: (diaristaId: string) => void;
}

/**
 * Cadastro do colaborador — só o chefe. É aqui que ficam as coisas que o
 * técnico não decide: se a pessoa é DIARISTA ou EMPREITEIRO, qual é a profissão
 * dela, quanto vale o dia e para onde vai o PIX.
 *
 * O tipo é o que muda a vida da pessoa no sistema: o diarista ganha pelo dia
 * marcado no calendário; o empreiteiro ganha pelo serviço fechado no setor da
 * obra. Os dois recebem pela mesma porta — o acerto.
 */
export function DiaristaDialog({ open, onClose, diarista, onCreated }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [workerType, setWorkerType] = useState<WorkerType>("diarista");
  const [profession, setProfession] = useState("");
  const [phone, setPhone] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(diarista?.name ?? "");
    // quem foi cadastrado antes da migration 069 não tem tipo: é diarista, que
    // era o único que existia
    setWorkerType(diarista?.worker_type ?? "diarista");
    setProfession(diarista?.profession ?? "");
    setPhone(diarista?.phone ?? "");
    setPixKey(diarista?.pix_key ?? "");
    setDailyRate(diarista ? formatBRLInput(Number(diarista.daily_rate)) : "");
    setNotes(diarista?.notes ?? "");
    setError(null);
  }, [open, diarista]);

  const empreiteiro = workerType === "empreiteiro";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Informe o nome do colaborador");
      return;
    }

    startTransition(async () => {
      const input = {
        name,
        phone,
        pix_key: pixKey,
        daily_rate: parseMoney(dailyRate),
        worker_type: workerType,
        profession,
        notes,
      };
      const r = diarista
        ? await updateDiarista(diarista.id, input)
        : await createDiarista(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      const id = (r as { diaristaId?: string }).diaristaId;
      if (!diarista && id) onCreated?.(id);
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {diarista ? "Editar colaborador" : "Novo colaborador"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="di_name">Nome *</Label>
            <Input
              id="di_name"
              value={name}
              onChange={(e) => setName(upperKeepingCaret(e))}
              placeholder="ex: joão da silva"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          {/* Como ele ganha — é o que muda a tela dele no sistema inteiro */}
          <div className="space-y-1.5">
            <Label>Como ele ganha *</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { v: "diarista", label: "Diarista", hint: "por dia trabalhado" },
                  { v: "empreiteiro", label: "Empreiteiro", hint: "por serviço fechado" },
                ] as const
              ).map((t) => (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => setWorkerType(t.v)}
                  className={`min-h-[56px] rounded-xl border px-3 py-2 text-left transition-colors ${
                    workerType === t.v
                      ? "bg-produmar-50 border-produmar-400 dark:bg-produmar-950/40 dark:border-produmar-700"
                      : "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700"
                  }`}
                >
                  <span
                    className={`block text-sm font-semibold ${
                      workerType === t.v
                        ? "text-produmar-700 dark:text-produmar-300"
                        : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {t.label}
                  </span>
                  <span className="block text-[10px] text-slate-400">{t.hint}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {empreiteiro
                ? "O empreiteiro recebe pelo serviço lançado no setor da obra — empreita ou por metro. Ele não precisa ser marcado no calendário."
                : "O diarista é marcado no calendário e ganha por dia. Ele também pode pegar um serviço por empreita, se for o caso."}
            </p>
          </div>

          {/* A profissão */}
          <div className="space-y-1.5">
            <Label htmlFor="di_prof">Profissão</Label>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {PROFISSOES_SUGERIDAS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProfession(profession === p ? "" : p)}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                    profession === p
                      ? "bg-produmar-600 border-produmar-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <Input
              id="di_prof"
              value={profession}
              onChange={(e) => setProfession(upperKeepingCaret(e))}
              placeholder="ex: pedreiro, pintor, carpinteiro"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="di_rate">
              Valor da diária (R$){empreiteiro ? " — se ele também vier por dia" : ""}
            </Label>
            <Input
              id="di_rate"
              value={dailyRate}
              onChange={(e) => setDailyRate(formatBRLInput(e.target.value))}
              placeholder="0,00"
              inputMode="decimal"
              className="tabular-nums text-lg font-semibold"
              autoComplete="off"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {empreiteiro
                ? "O empreiteiro ganha pelo serviço; a diária aqui só vale se um dia ele for marcado no calendário. Pode ficar zerada."
                : "É o que cada dia marcado no calendário passa a valer. Mudar aqui NÃO mexe no que já foi lançado."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="di_pix">Chave PIX</Label>
            <Input
              id="di_pix"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="CPF, celular, e-mail ou chave aleatória"
              className="tabular-nums"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Sai no relatório na hora de pagar — copiada exatamente como você
              escrever (e-mail e chave aleatória diferenciam maiúscula de minúscula).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="di_phone">Telefone</Label>
            <Input
              id="di_phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="opcional"
              inputMode="tel"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="di_notes">Observações</Label>
            <Textarea
              id="di_notes"
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : diarista ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
