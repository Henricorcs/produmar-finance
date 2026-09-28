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
import { formatBRLInput, localDateISO, parseMoney } from "@/lib/utils";
import { excluirNota, salvarNota } from "@/app/(app)/prefeitura/actions";
import type { PrefeituraNota, PrefeituraSecretaria, PrefeituraSituacao } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  nota: PrefeituraNota | null;
  secretarias: PrefeituraSecretaria[];
  secretariaInicial: string;
  numeroSugerido: string;
  /** O próximo número de cada grupo, para quando trocar de secretaria. */
  numeroPorGrupo: Record<string, string>;
}

const SITUACOES: { value: PrefeituraSituacao; label: string }[] = [
  { value: "pendente", label: "Pendente" },
  { value: "pago", label: "Paga (OK)" },
  { value: "cancelada", label: "Cancelada" },
];

const CAMPO_SELECT =
  "w-full h-11 text-base rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-800 dark:text-slate-100 sm:h-10 sm:text-sm";

export function NotaDialog({
  open,
  onClose,
  nota,
  secretarias,
  secretariaInicial,
  numeroSugerido,
  numeroPorGrupo,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [secretariaId, setSecretariaId] = useState("");
  const [numero, setNumero] = useState("");
  const [emissao, setEmissao] = useState("");
  const [valor, setValor] = useState("");
  const [situacao, setSituacao] = useState<PrefeituraSituacao>("pendente");
  const [baixa, setBaixa] = useState("");
  const [obs, setObs] = useState("");

  const padraoDa = (id: string) => {
    const v = secretarias.find((s) => s.id === id)?.valor_padrao;
    return v ? formatBRLInput(Number(v)) : "";
  };

  // Preenche o formulário toda vez que abre
  useEffect(() => {
    if (!open) return;
    setErro(null);
    if (nota) {
      setSecretariaId(nota.secretaria_id);
      setNumero(nota.numero);
      setEmissao(nota.data_emissao);
      setValor(formatBRLInput(Number(nota.valor)));
      setSituacao(nota.situacao);
      setBaixa(nota.data_baixa ?? "");
      setObs(nota.observacao ?? "");
    } else {
      setSecretariaId(secretariaInicial);
      setNumero(numeroSugerido);
      setEmissao(localDateISO());
      setValor(padraoDa(secretariaInicial));
      setSituacao("pendente");
      setBaixa("");
      setObs("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nota]);

  function trocarSecretaria(id: string) {
    const antes = secretarias.find((s) => s.id === secretariaId)?.grupo;
    const depois = secretarias.find((s) => s.id === id)?.grupo;
    setSecretariaId(id);
    // nota nova: o valor acompanha a secretaria escolhida, e o número o grupo
    // dela — cada grupo tem a sua numeração
    if (!nota) {
      setValor(padraoDa(id));
      if (depois && depois !== antes) setNumero(numeroPorGrupo[depois] ?? "");
    }
  }

  function trocarSituacao(s: PrefeituraSituacao) {
    setSituacao(s);
    if (s === "pago" && !baixa) setBaixa(localDateISO());
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await salvarNota(nota?.id ?? null, {
        secretaria_id: secretariaId,
        numero,
        data_emissao: emissao,
        valor: parseMoney(valor),
        situacao,
        data_baixa: situacao === "pago" ? baixa || null : null,
        observacao: obs || null,
      });
      if ("error" in r) setErro(r.error);
      else onClose();
    });
  }

  function excluir() {
    if (!nota) return;
    if (!confirm(`Excluir a nota ${nota.numero}? Isso não tem volta.`)) return;
    startTransition(async () => {
      const r = await excluirNota(nota.id);
      if ("error" in r) setErro(r.error);
      else onClose();
    });
  }

  // a lista vem separada por grupo (INTERNET, NF...); a secretaria da nota
  // pode ter sido arquivada e continua aparecendo no topo
  const grupos = Array.from(new Set(secretarias.map((s) => s.grupo)));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{nota ? `Nota ${nota.numero}` : "Nova nota"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pn_sec">Secretaria</Label>
            <select
              id="pn_sec"
              value={secretariaId}
              onChange={(e) => trocarSecretaria(e.target.value)}
              className={CAMPO_SELECT}
            >
              {nota && !secretarias.some((s) => s.id === nota.secretaria_id) && (
                <option value={nota.secretaria_id}>(secretaria arquivada)</option>
              )}
              {grupos.map((g) => (
                <optgroup key={g} label={g}>
                  {secretarias
                    .filter((s) => s.grupo === g)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pn_num">Nº da nota</Label>
              <Input
                id="pn_num"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pn_emissao">Data de emissão</Label>
              <Input
                id="pn_emissao"
                type="date"
                value={emissao}
                onChange={(e) => setEmissao(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pn_valor">Valor da nota</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                R$
              </span>
              <Input
                id="pn_valor"
                type="text"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(formatBRLInput(e.target.value))}
                placeholder="0,00"
                className="pl-9 tabular-nums"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pn_sit">Situação</Label>
              <select
                id="pn_sit"
                value={situacao}
                onChange={(e) => trocarSituacao(e.target.value as PrefeituraSituacao)}
                className={CAMPO_SELECT}
              >
                {SITUACOES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pn_baixa">Data da baixa</Label>
              <Input
                id="pn_baixa"
                type="date"
                value={situacao === "pago" ? baixa : ""}
                onChange={(e) => setBaixa(e.target.value)}
                disabled={situacao !== "pago"}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pn_obs">Observação</Label>
            <Input
              id="pn_obs"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="opcional"
              autoComplete="off"
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <DialogFooter className="gap-2">
            {nota && (
              <Button
                type="button"
                variant="outline"
                onClick={excluir}
                disabled={pending}
                className="text-red-600 sm:mr-auto"
              >
                Excluir
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
