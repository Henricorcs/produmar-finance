"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
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
import { cn, localDateISO, upperKeepingCaret } from "@/lib/utils";
import { resolveBirthRequest } from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  SPECIES_META,
  STICKY_FOOTER,
  SexPicker,
  acharMaeDoVaqueiro,
  categoryLabel,
  numeroSemZeros,
  speciesOf,
  ItemDeAnimal,
} from "./animal-shared";
import type { AnimalBirthRequest, AnimalSex, AnimalWithInfo } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  request: AnimalBirthRequest | null;
  /** Só fêmeas — a mesma lista usada no lançamento manual de parto. */
  mothers: AnimalWithInfo[];
  photoUrl: string | null;
}

/** Quantas fêmeas a lista mostra de cada vez — o resto aparece digitando. */
const MAX_NA_LISTA = 30;

/**
 * Confere o que o vaqueiro enviou e lança de verdade no rebanho. O número da
 * MÃE é um campo de digitar, que já vem com o que o vaqueiro escreveu:
 *   - se o número é de uma fêmea do cadastro (com ou sem os zeros da frente,
 *     ou pelo número antigo), ela já vem ligada;
 *   - digitando, aparece embaixo a lista das fêmeas que batem (número, número
 *     antigo ou código ABCZ) para escolher com um toque;
 *   - se ninguém for escolhido, vale o número digitado: a cria entra com a mãe
 *     escrita na ficha (sai no relatório) — a vaca 187 que não está no
 *     rebanho não trava mais o lançamento.
 * O número do bezerro também é dado aqui: quem está no curral não numera bicho
 * (migration 053).
 *
 * A lista fica DENTRO da janela, logo abaixo do campo (nada de caixinha
 * flutuante, que no iPhone travava), e ao tocar no campo a janela rola até ele
 * ficar no alto, para a lista caber acima do teclado.
 */
export function BirthRequestDialog({ open, onClose, request, mothers, photoUrl }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [maeTexto, setMaeTexto] = useState("");
  const [motherId, setMotherId] = useState("");
  const [listaAberta, setListaAberta] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [calfSex, setCalfSex] = useState<AnimalSex>("femea");
  const [calfTag, setCalfTag] = useState("");

  const blocoMaeRef = useRef<HTMLDivElement>(null);
  const campoMaeRef = useRef<HTMLInputElement>(null);

  // Preenche só ao ABRIR (ou trocar de envio): a lista de animais que atualiza
  // por trás não pode apagar o que o patrão já digitou.
  useEffect(() => {
    if (!open || !request) return;
    const casou = acharMaeDoVaqueiro(mothers, request.mother_tag, request.species);
    setMaeTexto(casou?.tag ?? request.mother_tag.trim().toUpperCase());
    setMotherId(casou?.id ?? "");
    setListaAberta(false);
    setBirthDate(request.birth_date || localDateISO());
    setCalfSex(request.calf_sex ?? "femea");
    setCalfTag(request.calf_tag ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request?.id]);

  const tipoMarcado = speciesOf(request?.species);

  // As fêmeas que batem com o que está digitado — as do bicho marcado primeiro.
  const sugestoes = useMemo(() => {
    const q = maeTexto.trim().toUpperCase().replace(/\s+/g, "");
    const qSemZeros = numeroSemZeros(maeTexto);
    const bate = (v?: string | null) => {
      if (!v) return false;
      const s = v.toUpperCase().replace(/\s+/g, "");
      return s.includes(q) || numeroSemZeros(v).includes(qSemZeros);
    };
    const lista = q
      ? mothers.filter((a) => bate(a.tag) || bate(a.tag_antigo) || bate(a.abcz_code))
      : mothers.filter((a) => speciesOf(a.species) === tipoMarcado);
    const exato = (a: AnimalWithInfo) => numeroSemZeros(a.tag) === qSemZeros;
    return lista
      .slice()
      .sort((a, b) => {
        const ta = speciesOf(a.species) === tipoMarcado ? 0 : 1;
        const tb = speciesOf(b.species) === tipoMarcado ? 0 : 1;
        if (ta !== tb) return ta - tb;
        const ea = exato(a) ? 0 : 1;
        const eb = exato(b) ? 0 : 1;
        if (ea !== eb) return ea - eb;
        return a.tag.localeCompare(b.tag, "pt-BR", { numeric: true });
      })
      .slice(0, MAX_NA_LISTA);
  }, [maeTexto, mothers, tipoMarcado]);

  if (!request) return null;

  const selecionada = mothers.find((m) => m.id === motherId) ?? null;
  const digitadoPeloVaqueiro = request.mother_tag.trim().toUpperCase();
  const textoMae = maeTexto.trim().toUpperCase();

  /**
   * Como chamar a cria nesta tela. O vaqueiro marcou o bicho no celular
   * (migration 091), mas quando a mãe é do cadastro quem manda é ELA: é dela
   * que `createBirth` puxa tipo e raça. Mãe só escrita → vale o que ele marcou.
   */
  const nomes = SPECIES_META[speciesOf(selecionada?.species ?? request.species)];
  const cria = nomes.youngMale.toLowerCase();
  const tipoDivergente = !!selecionada && speciesOf(selecionada.species) !== tipoMarcado;
  const metaMarcado = SPECIES_META[tipoMarcado];

  /** Põe o campo da mãe no alto da janela, para a lista caber acima do teclado. */
  function subirCampoMae() {
    const bloco = blocoMaeRef.current;
    const caixa = bloco?.closest<HTMLElement>('[role="dialog"]');
    if (!bloco || !caixa) return;
    const delta = bloco.getBoundingClientRect().top - caixa.getBoundingClientRect().top - 12;
    if (delta > 0) caixa.scrollTop += delta;
  }

  function aoFocarMae() {
    setListaAberta(true);
    // espera o teclado subir e a janela encolher para a faixa visível
    setTimeout(subirCampoMae, 120);
    setTimeout(subirCampoMae, 450);
  }

  function aoDigitarMae(e: React.ChangeEvent<HTMLInputElement>) {
    const v = upperKeepingCaret(e);
    setMaeTexto(v);
    // número que é de uma fêmea do cadastro já liga sozinho
    const casou = v.trim() ? acharMaeDoVaqueiro(mothers, v, request!.species) : null;
    setMotherId(casou?.id ?? "");
    setListaAberta(true);
    setError(null);
  }

  function escolherMae(a: AnimalWithInfo) {
    setMotherId(a.id);
    setMaeTexto(a.tag);
    setListaAberta(false);
    setError(null);
    campoMaeRef.current?.blur(); // fecha o teclado
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!motherId && !textoMae) {
      campoMaeRef.current?.focus();
      return setError("Digite o número da mãe");
    }
    if (!birthDate) return setError("Informe a data do nascimento");
    if (!calfTag.trim()) return setError(`Informe o número do ${cria}`);

    startTransition(async () => {
      const r = await resolveBirthRequest(request!.id, {
        mother_id: motherId || null,
        mother_tag: motherId ? null : textoMae,
        birth_date: birthDate,
        calf_sex: calfSex,
        calf_tag: calfTag,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao lançar o nascimento");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Conferir nascimento</DialogTitle>
        </DialogHeader>

        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={`${nomes.youngMale} da mãe ${request.mother_tag}`}
            className="w-full h-48 object-cover rounded-xl border border-slate-200 dark:border-slate-700 mb-4"
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div ref={blocoMaeRef} className="space-y-1.5">
            <Label htmlFor="brq_mae">Mãe (número) *</Label>
            <Input
              id="brq_mae"
              ref={campoMaeRef}
              value={maeTexto}
              onChange={aoDigitarMae}
              onFocus={aoFocarMae}
              placeholder="Digite o número da mãe"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              className={cn(
                "h-11 sm:h-10 text-lg font-semibold tabular-nums",
                selecionada && "border-emerald-400 dark:border-emerald-700"
              )}
            />

            {/* A lista das fêmeas que batem — dentro da janela, logo abaixo do campo */}
            {listaAberta && (
              <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <div
                  className="overflow-y-auto overscroll-contain py-1"
                  style={{ maxHeight: "max(8rem, calc(var(--dialog-band-h, 100dvh) * 0.38))" }}
                >
                  {sugestoes.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400 text-center">
                      Nenhuma fêmea do cadastro com {textoMae} — tudo bem, vale o número digitado.
                    </p>
                  ) : (
                    sugestoes.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => escolherMae(a)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-produmar-50 dark:hover:bg-slate-700",
                          a.id === motherId && "bg-produmar-100/70 dark:bg-slate-700"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <ItemDeAnimal
                            numero={a.tag}
                            detalhe={`${categoryLabel(a.category, a.sex, a.species)}${a.breed_name ? ` · ${a.breed_name}` : ""}`}
                          />
                        </div>
                        {a.id === motherId && (
                          <Check className="w-4 h-4 text-produmar-600 dark:text-produmar-400 flex-shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setListaAberta(false);
                    campoMaeRef.current?.blur();
                  }}
                  className="w-full border-t border-slate-100 dark:border-slate-700 px-3 py-2.5 text-xs font-medium text-produmar-600 dark:text-produmar-400"
                >
                  {selecionada ? `Fica a ${selecionada.tag}` : textoMae ? `Usar ${textoMae} como digitado` : "Fechar a lista"}
                </button>
              </div>
            )}

            {/* Onde a mãe vai parar: ligada ao cadastro ou escrita na ficha */}
            {selecionada ? (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                Ligada à {categoryLabel(selecionada.category, selecionada.sex, selecionada.species).toLowerCase()}{" "}
                {selecionada.tag} do cadastro
                {selecionada.breed_name ? ` · ${selecionada.breed_name}` : ""}
                {textoMae === digitadoPeloVaqueiro || selecionada.tag === digitadoPeloVaqueiro
                  ? " — é a que o vaqueiro informou."
                  : ` — o vaqueiro tinha informado ${digitadoPeloVaqueiro}.`}
              </p>
            ) : textoMae ? (
              <p className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-2.5 py-2">
                {textoMae === digitadoPeloVaqueiro ? (
                  <>
                    O vaqueiro informou a mãe <strong>{textoMae}</strong>, que não é uma fêmea do
                    cadastro.{" "}
                  </>
                ) : (
                  <>
                    <strong>{textoMae}</strong> não é uma fêmea do cadastro.{" "}
                  </>
                )}
                Se for assim mesmo, o {cria} entra com a mãe {textoMae} escrita na ficha (sai no
                relatório). Se é outra, toque no campo e escolha na lista.
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                O vaqueiro informou {digitadoPeloVaqueiro || "—"}. Digite o número da mãe.
              </p>
            )}

            {/* A cria puxa tipo e raça da mãe: se a mãe escolhida é de outro
                bicho, o que vai entrar no rebanho não é o que ele marcou. */}
            {tipoDivergente && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-2.5 py-2">
                O vaqueiro marcou {metaMarcado.label.toLowerCase()}, mas esta mãe é{" "}
                {nomes.label.toLowerCase()} — a cria vai entrar como {nomes.label.toLowerCase()},
                com o tipo e a raça dela.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brq_date">Data do nascimento *</Label>
            <Input
              id="brq_date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="h-11 sm:h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Sexo do {cria} *</Label>
            <SexPicker value={calfSex} onChange={setCalfSex} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brq_calf_tag">Nº do {cria} *</Label>
            <Input
              id="brq_calf_tag"
              value={calfTag}
              onChange={(e) => setCalfTag(upperKeepingCaret(e))}
              onFocus={() => setListaAberta(false)}
              placeholder="ex: 1046"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              O vaqueiro não numera o {cria} — o número é seu, agora.
            </p>
          </div>

          {request.protocolo_aplicado && request.protocolo_aplicado.length > 0 && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-2.5 py-2">
              O vaqueiro aplicou{" "}
              {request.protocolo_aplicado.map((i) => i.medicine).join(", ")} — entra como
              tratamento na ficha do {cria}.
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter className={STICKY_FOOTER}>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
              className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}>
              {isPending ? "Lançando..." : "Lançar no rebanho"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
