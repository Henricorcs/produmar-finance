"use client";

import { useState, useTransition } from "react";
import {
  Wrench,
  User,
  Building2,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createServiceOrder } from "@/app/(app)/operacoes/actions";

type SimpleMachine = { id: string; name: string; plate: string | null };

interface Props {
  open: boolean;
  onClose: () => void;
  machines: SimpleMachine[];
  recentClients: string[];
  operadorName: string;
  onCreated: () => void;
}

/**
 * Formulário SUPER simplificado para o próprio técnico lançar uma OS no campo.
 * Sem valores, sem horímetro, sem jargão — o escritório cuida do preço depois.
 * A OS é criada como prestação de serviço "pendente" com um item placeholder.
 */
export function LancarServicoDialog({
  open,
  onClose,
  machines,
  recentClients,
  operadorName,
  onCreated,
}: Props) {
  const [paraCliente, setParaCliente] = useState(true);
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [local, setLocal] = useState("");
  const [machineId, setMachineId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setParaCliente(true);
    setClientName("");
    setDescription("");
    setLocal("");
    setMachineId("");
    setError(null);
  }

  function handleClose() {
    resetForm();
    setDone(false);
    onClose();
  }

  function lancarOutro() {
    resetForm();
    setDone(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (paraCliente && !clientName.trim()) {
      setError("Diga para qual cliente é o serviço.");
      return;
    }
    if (!description.trim()) {
      setError("Escreva o que você fez.");
      return;
    }
    setError(null);
    const firstName = operadorName.split(" ")[0];
    startTransition(async () => {
      const result = await createServiceOrder({
        type: "prestacao_servico",
        freight_type: paraCliente ? "cliente" : "interno",
        status: "pendente",
        client_name: paraCliente ? clientName : null,
        machine_id: machineId || null,
        delivery_address: local || null,
        service_description: description,
        delivery_date: new Date().toISOString().split("T")[0],
        notes: `LANÇADO PELO TÉCNICO ${firstName}`,
        items: [
          {
            product_id: null,
            description: "SERVIÇO — AGUARDANDO VALOR",
            quantity: 1,
            unit: "ud",
            unit_price: 0,
          },
        ],
      });
      if (result && "error" in result) {
        setError(result.error ?? "Erro ao salvar");
      } else {
        setDone(true);
        onCreated();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg dark:text-slate-100">
            <Wrench className="w-5 h-5 text-produmar-600" />
            Lançar serviço
          </DialogTitle>
        </DialogHeader>

        {done ? (
          /* ── Sucesso ───────────────────────────────────────────── */
          <div className="space-y-5 py-4">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  Serviço lançado!
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Pronto. O escritório vai cuidar do valor e da cobrança.
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              <Button className="h-14 text-base" onClick={lancarOutro}>
                Lançar outro serviço
              </Button>
              <Button variant="outline" className="h-12" onClick={handleClose}>
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          /* ── Formulário ────────────────────────────────────────── */
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 1 — Para quem */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">
                1. Para quem é o serviço?
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setParaCliente(true)}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-colors ${
                    paraCliente
                      ? "border-produmar-500 bg-produmar-50 dark:bg-produmar-950/30"
                      : "border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <User
                    className={`w-6 h-6 ${
                      paraCliente ? "text-produmar-600" : "text-slate-400"
                    }`}
                  />
                  <span className="text-sm font-medium">Cliente</span>
                </button>
                <button
                  type="button"
                  onClick={() => setParaCliente(false)}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-colors ${
                    !paraCliente
                      ? "border-produmar-500 bg-produmar-50 dark:bg-produmar-950/30"
                      : "border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <Building2
                    className={`w-6 h-6 ${
                      !paraCliente ? "text-produmar-600" : "text-slate-400"
                    }`}
                  />
                  <span className="text-sm font-medium">Da empresa</span>
                </button>
              </div>

              {paraCliente && (
                <div className="space-y-2 pt-1">
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="nome do cliente"
                    className="h-14 text-base uppercase placeholder:normal-case placeholder:lowercase"
                    autoComplete="off"
                  />
                  {recentClients.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {recentClients.slice(0, 6).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setClientName(c)}
                          className="px-3 h-8 rounded-full text-xs border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2 — O que fez */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">
                2. O que você fez?
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ex: terraplanagem do terreno, limpeza da área..."
                className="min-h-[90px] text-base"
              />
            </div>

            {/* 3 — Onde */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">
                3. Onde foi? <span className="text-slate-400 font-normal">(opcional)</span>
              </Label>
              <Input
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="endereço ou local do serviço"
                className="h-14 text-base uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
            </div>

            {/* 4 — Máquina */}
            {machines.length > 0 && (
              <div className="space-y-2">
                <Label className="text-base font-semibold">
                  4. Qual máquina usou?{" "}
                  <span className="text-slate-400 font-normal">(opcional)</span>
                </Label>
                <select
                  value={machineId}
                  onChange={(e) => setMachineId(e.target.value)}
                  className="h-14 w-full rounded-md border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-base text-slate-900 dark:text-slate-100"
                >
                  <option value="">Nenhuma máquina</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.plate ? ` — ${m.plate}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/40">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-16 text-lg gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Salvando...
                </>
              ) : (
                "SALVAR SERVIÇO"
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
