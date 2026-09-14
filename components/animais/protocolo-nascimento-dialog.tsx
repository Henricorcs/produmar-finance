"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Pencil, Plus, Syringe, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actionError } from "@/lib/action-result";
import { cn, upperKeepingCaret } from "@/lib/utils";
import {
  addProtocoloItens,
  deleteProtocoloItem,
  updateProtocoloItem,
} from "@/app/(app)/animais/actions";
import { PARTO_SPECIES_OPTIONS, SPECIES_META } from "./animal-shared";
import type { AnimalSpecies, ProtocoloNascimentoItem } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  protocolo: ProtocoloNascimentoItem[];
}

/** Uma linha nova ainda não salva — só existe na tela até tocar em Salvar. */
interface LinhaNova {
  chave: number;
  medicine: string;
  dose: string;
}

/**
 * O PROTOCOLO DO NASCIMENTO — os medicamentos que a cria toma assim que nasce.
 *
 * Quem decide é o dono, bicho por bicho: o bezerro toma uma coisa, o leitão
 * outra. São QUANTOS MEDICAMENTOS ELE QUISER, cada um na sua linha com a sua
 * dose. A primeira versão desta tela tinha um formulário só embaixo da lista, e
 * parecia que o protocolo era um medicamento: o segundo acabava escrito dentro
 * da dose do primeiro. Agora a tela abre com linhas para preencher e um botão
 * "Mais um medicamento" que acrescenta outra — e salva todas de uma vez.
 *
 * O que entrar aqui aparece no celular do vaqueiro no ato de informar o
 * nascimento, e ele só salva depois de marcar cada item como aplicado. Ao
 * lançar a cria no rebanho, cada item vira um tratamento na ficha dela.
 */
export function ProtocoloNascimentoDialog({ open, onClose, protocolo }: Props) {
  const [species, setSpecies] = useState<AnimalSpecies>("bovino");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const proximaChave = useRef(1);
  const novaLinha = (): LinhaNova => ({ chave: proximaChave.current++, medicine: "", dose: "" });
  const [novas, setNovas] = useState<LinhaNova[]>([]);
  /** O campo de medicamento que deve ganhar o foco (a linha recém-criada). */
  const [focar, setFocar] = useState<number | null>(null);

  /** O item já salvo em correção, com o texto que está sendo digitado. */
  const [editando, setEditando] = useState<{ id: string; medicine: string; dose: string } | null>(
    null
  );

  const doBicho = protocolo.filter((i) => i.species === species);
  const nomes = SPECIES_META[species];

  // Ao abrir e ao trocar de bicho: a lista vazia já vem com uma linha para
  // preencher; a que já tem itens mostra os itens e o botão de acrescentar.
  useEffect(() => {
    if (!open) return;
    setErro(null);
    setAviso(null);
    setEditando(null);
    setNovas(protocolo.some((i) => i.species === species) ? [] : [novaLinha()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, species]);

  function maisUm() {
    const linha = novaLinha();
    setNovas((atual) => [...atual, linha]);
    setFocar(linha.chave);
    setAviso(null);
  }

  function mudar(chave: number, campo: "medicine" | "dose", valor: string) {
    setNovas((atual) => atual.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));
  }

  function tirarLinha(chave: number) {
    setNovas((atual) => atual.filter((l) => l.chave !== chave));
  }

  const preenchidas = novas.filter((l) => l.medicine.trim());

  function salvarNovas() {
    setErro(null);
    setAviso(null);
    if (preenchidas.length === 0) return setErro("Escreva o nome do medicamento");
    startTransition(async () => {
      const r = await addProtocoloItens(
        species,
        preenchidas.map((l) => ({ medicine: l.medicine, dose: l.dose }))
      );
      const falha = actionError(r);
      if (falha) return setErro(falha);
      const n = preenchidas.length;
      setNovas([]);
      setAviso(
        n === 1
          ? "Medicamento adicionado ao protocolo."
          : `${n} medicamentos adicionados ao protocolo.`
      );
    });
  }

  function salvarEdicao() {
    if (!editando) return;
    setErro(null);
    if (!editando.medicine.trim()) return setErro("Escreva o medicamento");
    startTransition(async () => {
      const falha = actionError(
        await updateProtocoloItem(editando.id, {
          medicine: editando.medicine,
          dose: editando.dose,
        })
      );
      if (falha) return setErro(falha);
      setEditando(null);
    });
  }

  function remover(item: ProtocoloNascimentoItem) {
    if (!confirm(`Tirar ${item.medicine} do protocolo do ${nomes.youngMale.toLowerCase()}?`)) return;
    setErro(null);
    setAviso(null);
    startTransition(async () => {
      const falha = actionError(await deleteProtocoloItem(item.id));
      if (falha) setErro(falha);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <Syringe className="w-4 h-4" />
            </span>
            Protocolo do nascimento
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
          Os medicamentos que a cria toma assim que nasce — quantos precisar, um em cada
          linha. O vaqueiro só salva o nascimento depois de marcar cada um como aplicado.
        </p>

        {/* De que bicho é o protocolo */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mt-3">
          {PARTO_SPECIES_OPTIONS.map((opt) => {
            const qtd = protocolo.filter((i) => i.species === opt.value).length;
            const ativo = species === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSpecies(opt.value)}
                className={cn(
                  "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  ativo
                    ? "bg-produmar-600 border-produmar-600 text-white"
                    : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                )}
              >
                {SPECIES_META[opt.value].label}
                {qtd > 0 && <span className="ml-1 tabular-nums opacity-80">({qtd})</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            O {nomes.youngMale.toLowerCase()} toma ao nascer
            {doBicho.length > 0 && ` · ${doBicho.length} ${doBicho.length === 1 ? "medicamento" : "medicamentos"}`}
          </p>

          {/* Os que já estão no protocolo */}
          {doBicho.length > 0 && (
            <ol className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {doBicho.map((item, i) =>
                editando?.id === item.id ? (
                  <li key={item.id} className="p-2.5 space-y-2 bg-produmar-50/40 dark:bg-slate-800/40">
                    <Input
                      value={editando.medicine}
                      onChange={(e) =>
                        setEditando({ ...editando, medicine: upperKeepingCaret(e) })
                      }
                      autoCapitalize="characters"
                      placeholder="Medicamento"
                      autoComplete="off"
                    />
                    <div className="flex gap-2">
                      <Input
                        value={editando.dose}
                        onChange={(e) => setEditando({ ...editando, dose: upperKeepingCaret(e) })}
                        autoCapitalize="characters"
                        placeholder="Dose (opcional)"
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => setEditando(null)}
                        disabled={isPending}
                        aria-label="Cancelar"
                        className="h-11 w-11 sm:h-10 sm:w-10 flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        onClick={salvarEdicao}
                        disabled={isPending}
                        aria-label="Salvar"
                        className="h-11 w-11 sm:h-10 sm:w-10 flex-shrink-0"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    </div>
                  </li>
                ) : (
                  <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[11px] font-bold flex items-center justify-center tabular-nums flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 break-words">
                        {item.medicine}
                      </p>
                      {item.dose && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 break-words">
                          {item.dose}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setEditando({ id: item.id, medicine: item.medicine, dose: item.dose ?? "" })
                      }
                      disabled={isPending}
                      aria-label={`Corrigir ${item.medicine}`}
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-produmar-600 flex-shrink-0"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remover(item)}
                      disabled={isPending}
                      aria-label={`Tirar ${item.medicine}`}
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                )
              )}
            </ol>
          )}

          {/* As linhas novas, uma por medicamento */}
          {novas.map((linha, n) => (
            <div
              key={linha.chave}
              className="rounded-xl border-2 border-dashed border-produmar-200 dark:border-produmar-900/60 bg-produmar-50/30 dark:bg-slate-800/40 p-2.5 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-produmar-700 dark:text-produmar-400">
                  Medicamento {doBicho.length + n + 1}
                </span>
                <button
                  type="button"
                  onClick={() => tirarLinha(linha.chave)}
                  disabled={isPending}
                  aria-label="Tirar esta linha"
                  className="w-8 h-8 -m-1 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <Input
                value={linha.medicine}
                onChange={(e) => mudar(linha.chave, "medicine", upperKeepingCaret(e))}
                placeholder="Nome — ex: UMBICURA NO UMBIGO"
                autoCapitalize="characters"
                autoComplete="off"
                autoFocus={focar === linha.chave}
              />
              <Input
                value={linha.dose}
                onChange={(e) => mudar(linha.chave, "dose", upperKeepingCaret(e))}
                placeholder="Dose — ex: 2 ML (opcional)"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={maisUm}
            disabled={isPending}
            className="w-full h-11 border-dashed"
          >
            <Plus className="w-4 h-4" />
            {doBicho.length + novas.length === 0 ? "Adicionar medicamento" : "Mais um medicamento"}
          </Button>

          {novas.length > 0 && (
            <Button
              type="button"
              onClick={salvarNovas}
              disabled={isPending || preenchidas.length === 0}
              className="w-full h-11"
            >
              <Check className="w-4 h-4" />
              {isPending
                ? "Salvando..."
                : preenchidas.length <= 1
                  ? "Salvar no protocolo"
                  : `Salvar ${preenchidas.length} medicamentos`}
            </Button>
          )}
        </div>

        {aviso && (
          <p className="mt-3 text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-400">
            {aviso}
          </p>
        )}
        {erro && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
            {erro}
          </p>
        )}

        <Button
          type="button"
          variant="ghost"
          className="w-full mt-3"
          onClick={() => {
            // Linha preenchida e não salva: avisa antes de perder o que digitou.
            if (preenchidas.length > 0 && !confirm("Tem medicamento digitado e não salvo. Fechar mesmo assim?"))
              return;
            onClose();
          }}
        >
          Fechar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
