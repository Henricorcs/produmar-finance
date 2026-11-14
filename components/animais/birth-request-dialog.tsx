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

/**
 * Confere o que o vaqueiro enviou e lança de verdade no rebanho.
 *
 * A MÃE é sempre uma fêmea do CADASTRO, escolhida na lista — número que não
 * existe no rebanho não passa (nem aqui nem no servidor). A lista com TODAS as
 * fêmeas do tipo já vem aberta; o campo de cima só filtra. Quando o número que
 * o vaqueiro digitou existe (com ou sem os zeros da frente, ou pelo número
 * antigo), ela já vem escolhida; quando não existe (a 187), a tela avisa e
 * espera o patrão escolher a mãe certa.
 *
 * A lista fica DENTRO da janela, no fluxo da página (nada de caixinha
 * flutuante, que no iPhone travava), e ao tocar na busca a janela rola até ela
 * ficar no alto, para a lista caber acima do teclado. O número do bezerro
 * também é dado aqui: quem está no curral não numera bicho (migration 053).
 */
export function BirthRequestDialog({ open, onClose, request, mothers, photoUrl }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [motherId, setMotherId] = useState("");
  const [todosOsTipos, setTodosOsTipos] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [calfSex, setCalfSex] = useState<AnimalSex>("femea");
  const [calfTag, setCalfTag] = useState("");

  const blocoMaeRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  // A fêmea do cadastro que o número digitado pelo vaqueiro aponta (ou null).
  const casou = useMemo(
    () => (request ? acharMaeDoVaqueiro(mothers, request.mother_tag, request.species) : null),
    [request, mothers]
  );

  // Preenche só ao ABRIR (ou trocar de envio): a lista de animais que atualiza
  // por trás não pode apagar o que o patrão já digitou ou escolheu.
  useEffect(() => {
    if (!open || !request) return;
    setMotherId(casou?.id ?? "");
    setBusca("");
    setTodosOsTipos(false);
    setBirthDate(request.birth_date || localDateISO());
    setCalfSex(request.calf_sex ?? "femea");
    setCalfTag(request.calf_tag ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request?.id]);

  // O tipo da lista: o bicho que o vaqueiro marcou — ou o da mãe que casou,
  // quando ele marcou errado (o número 117 é de uma ovelha).
  const tipoDaLista = speciesOf(casou?.species ?? request?.species);

  /** Todas as fêmeas do tipo (ou de todos), em ordem de número. */
  const todas = useMemo(() => {
    const lista = todosOsTipos
      ? mothers
      : mothers.filter((a) => speciesOf(a.species) === tipoDaLista);
    return lista
      .slice()
      .sort((a, b) => a.tag.localeCompare(b.tag, "pt-BR", { numeric: true }));
  }, [mothers, todosOsTipos, tipoDaLista]);

  /** As que batem com a busca (número, número antigo, código ABCZ ou raça). */
  const filtradas = useMemo(() => {
    const q = busca.trim().toUpperCase().replace(/\s+/g, "");
    if (!q) return todas;
    const qSemZeros = numeroSemZeros(busca);
    const bate = (v?: string | null) => {
      if (!v) return false;
      const s = v.toUpperCase().replace(/\s+/g, "");
      return s.includes(q) || numeroSemZeros(v).includes(qSemZeros);
    };
    return todas.filter(
      (a) => bate(a.tag) || bate(a.tag_antigo) || bate(a.abcz_code) || bate(a.breed_name)
    );
  }, [todas, busca]);

  if (!request) return null;

  const selecionada = mothers.find((m) => m.id === motherId) ?? null;
  const digitado = request.mother_tag.trim().toUpperCase();
  const textoBusca = busca.trim().toUpperCase();
  // a busca não achou ninguém: mostra todas, para nunca ficar sem saída
  const semResultado = textoBusca !== "" && filtradas.length === 0;
  const naTela = semResultado ? todas : filtradas;

  /**
   * Como chamar a cria nesta tela. O vaqueiro marcou o bicho no celular
   * (migration 091), mas quem manda é a MÃE escolhida aqui: é dela que
   * `createBirth` puxa tipo e raça.
   */
  const nomes = SPECIES_META[speciesOf(selecionada?.species ?? request.species)];
  const cria = nomes.youngMale.toLowerCase();
  const tipoMarcado = SPECIES_META[speciesOf(request.species)];
  const tipoDivergente =
    !!selecionada && speciesOf(selecionada.species) !== speciesOf(request.species);
  const metaLista = SPECIES_META[tipoDaLista];

  /** Põe a busca no alto da janela, para a lista caber acima do teclado. */
  function subirBusca() {
    const bloco = blocoMaeRef.current;
    const caixa = bloco?.closest<HTMLElement>('[role="dialog"]');
    if (!bloco || !caixa) return;
    const delta = bloco.getBoundingClientRect().top - caixa.getBoundingClientRect().top - 12;
    if (delta > 0) caixa.scrollTop += delta;
  }

  function aoFocarBusca() {
    // espera o teclado subir e a janela encolher para a faixa visível
    setTimeout(subirBusca, 120);
    setTimeout(subirBusca, 450);
  }

  function escolher(a: AnimalWithInfo) {
    setMotherId(a.id);
    setError(null);
    buscaRef.current?.blur(); // fecha o teclado
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!motherId || !selecionada) {
      subirBusca();
      return setError("Escolha a mãe na lista das fêmeas cadastradas");
    }
    if (!birthDate) return setError("Informe a data do nascimento");
    if (!calfTag.trim()) return setError(`Informe o número do ${cria}`);

    startTransition(async () => {
      const r = await resolveBirthRequest(request!.id, {
        mother_id: motherId,
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
            <Label htmlFor="brq_busca_mae">Mãe *</Label>

            {/* O número do vaqueiro não existe no rebanho: avisa e espera a escolha */}
            {!casou && (
              <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg px-3 py-2">
                O vaqueiro digitou <strong>{digitado || "—"}</strong>, mas não existe essa fêmea —
                escolha a mãe certa na lista.
              </p>
            )}

            {/* A mãe escolhida — é ela que vai para o parto */}
            {selecionada ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20 px-3 py-2">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <p className="text-sm text-emerald-800 dark:text-emerald-300 min-w-0">
                  <span className="font-bold tabular-nums">{selecionada.tag}</span>
                  <span className="text-xs">
                    {" "}
                    · {categoryLabel(selecionada.category, selecionada.sex, selecionada.species)}
                    {selecionada.breed_name ? ` · ${selecionada.breed_name}` : ""}
                    {casou && casou.id === selecionada.id
                      ? " — é a que o vaqueiro informou"
                      : ` — o vaqueiro tinha digitado ${digitado}`}
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Nenhuma mãe escolhida ainda — toque nela na lista.
              </p>
            )}

            {/* A busca só FILTRA a lista; quem decide é o toque */}
            <Input
              id="brq_busca_mae"
              ref={buscaRef}
              value={busca}
              onChange={(e) => setBusca(upperKeepingCaret(e))}
              onFocus={aoFocarBusca}
              placeholder="Filtrar pelo número ou raça..."
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-11 sm:h-10"
            />

            {/* TODAS as fêmeas do tipo, sempre à mostra, dentro da janela */}
            <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              {semResultado && (
                <p className="px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400 border-b border-slate-100 dark:border-slate-700">
                  Nenhuma fêmea com &quot;{textoBusca}&quot; — abaixo estão todas.
                </p>
              )}
              <div
                className="overflow-y-auto overscroll-contain py-1"
                style={{ maxHeight: "max(8rem, calc(var(--dialog-band-h, 100dvh) * 0.38))" }}
              >
                {naTela.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                    Nenhuma {metaLista.female.toLowerCase()} cadastrada
                    {todosOsTipos ? "" : " — veja todos os tipos"}.
                  </p>
                ) : (
                  naTela.map((a) => {
                    const escolhida = a.id === motherId;
                    const codigos = [
                      a.tag_antigo ? `antigo ${a.tag_antigo}` : null,
                      a.abcz_code ? `ABCZ ${a.abcz_code}` : null,
                    ].filter(Boolean);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => escolher(a)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-produmar-50 dark:hover:bg-slate-700",
                          escolhida && "bg-emerald-50 dark:bg-emerald-950/30"
                        )}
                      >
                        <span className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100 flex-shrink-0">
                          {a.tag}
                        </span>
                        <span className="flex-1 min-w-0 text-right">
                          <span className="block text-xs text-slate-600 dark:text-slate-300 truncate">
                            {categoryLabel(a.category, a.sex, a.species)}
                            {a.breed_name ? ` · ${a.breed_name}` : " · sem raça"}
                          </span>
                          {codigos.length > 0 && (
                            <span className="block text-[10px] text-slate-400 truncate">
                              {codigos.join(" · ")}
                            </span>
                          )}
                        </span>
                        {escolhida && (
                          <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              <button
                type="button"
                onClick={() => setTodosOsTipos((v) => !v)}
                className="w-full border-t border-slate-100 dark:border-slate-700 px-3 py-2 text-[11px] font-medium text-produmar-600 dark:text-produmar-400"
              >
                {todosOsTipos
                  ? `Mostrar só ${metaLista.females.toLowerCase()}`
                  : `${todas.length} ${metaLista.females.toLowerCase()} · ver fêmeas de todos os tipos`}
              </button>
            </div>

            {/* A cria puxa tipo e raça da mãe: se a mãe escolhida é de outro
                bicho, o que vai entrar no rebanho não é o que ele marcou. */}
            {tipoDivergente && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-2.5 py-2">
                O vaqueiro marcou {tipoMarcado.label.toLowerCase()}, mas esta mãe é{" "}
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
