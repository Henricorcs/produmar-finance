"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn, localDateISO, upperKeepingCaret } from "@/lib/utils";
import { createAnimal, resolveBirthRequest } from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  SPECIES_META,
  STICKY_FOOTER,
  SexPicker,
  acharMaeDoVaqueiro,
  categoryLabel,
  daCriacao,
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

/**
 * Confere o que o vaqueiro enviou e lança de verdade no rebanho. O vaqueiro só
 * digitou a numeração da mãe (texto livre); aqui ela é casada com o cadastro
 * de verdade — bate sozinho quando o número existe entre as fêmeas (com ou sem
 * os zeros da frente, ou pelo número antigo), senão o patrão escolhe na lista
 * ou cadastra a mãe ali mesmo. O número do bezerro também é dado aqui: quem
 * está no curral não numera bicho (migration 053).
 *
 * A lista de mães é ABERTA, dentro da própria janela — nada de caixinha que
 * cai por cima: no iPhone a caixinha dentro de uma janela que rola travava
 * (era rolar a lista e a tela não mexia).
 */
export function BirthRequestDialog({ open, onClose, request, mothers, photoUrl }: Props) {
  const [isPending, startTransition] = useTransition();
  const [cadastrando, startCadastro] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [motherId, setMotherId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [calfSex, setCalfSex] = useState<AnimalSex>("femea");
  const [calfTag, setCalfTag] = useState("");
  /** Lista de mães aberta (para escolher ou trocar a que casou). */
  const [escolhendo, setEscolhendo] = useState(false);
  /** Mostrar fêmeas de todos os tipos, e não só do bicho que ele marcou. */
  const [todosOsTipos, setTodosOsTipos] = useState(false);
  /** A mãe cadastrada aqui mesmo, até ela chegar na lista que vem do servidor. */
  const [maeCriada, setMaeCriada] = useState<{ id: string; tag: string } | null>(null);

  // A mãe que o número digitado pelo vaqueiro aponta no cadastro.
  const casou = useMemo(
    () => (request ? acharMaeDoVaqueiro(mothers, request.mother_tag, request.species) : null),
    [request, mothers]
  );

  // Preenche só ao ABRIR (ou trocar de envio). Antes a tela se refazia toda vez
  // que a lista de animais atualizava, e apagava o que o patrão já tinha digitado.
  useEffect(() => {
    if (!open || !request) return;
    setMotherId(casou?.id ?? "");
    setEscolhendo(!casou);
    setTodosOsTipos(false);
    setMaeCriada(null);
    setBirthDate(request.birth_date || localDateISO());
    setCalfSex(request.calf_sex ?? "femea");
    setCalfTag(request.calf_tag ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request?.id]);

  if (!request) return null;

  const selecionada = mothers.find((m) => m.id === motherId) ?? null;
  const digitado = request.mother_tag.trim().toUpperCase();

  /**
   * Como chamar a cria nesta tela. O vaqueiro marcou o bicho no celular
   * (migration 091), mas quem manda é a MÃE escolhida aqui: é dela que
   * `createBirth` puxa tipo e raça. Escolheu uma ovelha, é cordeiro — mesmo
   * que ele tenha marcado bovino sem prestar atenção.
   */
  const nomes = SPECIES_META[speciesOf(selecionada?.species ?? request.species)];
  const cria = nomes.youngMale.toLowerCase();
  const tipoDivergente =
    !!selecionada && speciesOf(selecionada.species) !== speciesOf(request.species);
  const tipoMarcado = SPECIES_META[speciesOf(request.species)];

  // A lista: só as fêmeas do bicho que ele marcou (bezerro → vacas), a não ser
  // que o número tenha casado com outro tipo ou o patrão peça todos.
  const tipoDaLista = speciesOf(casou?.species ?? request.species);
  const listaDeMaes = todosOsTipos ? mothers : daCriacao(mothers, tipoDaLista);

  function escolher(id: string) {
    setMotherId(id);
    if (id) setEscolhendo(false);
    setError(null);
  }

  /** O número que o vaqueiro digitou não existe: cadastra a mãe com ele. */
  function cadastrarMae() {
    setError(null);
    const especie = speciesOf(request!.species);
    startCadastro(async () => {
      const r = await createAnimal({ tag: digitado, sex: "femea", species: especie });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao cadastrar a mãe");
        return;
      }
      const id = (r as { animalId?: string }).animalId;
      if (!id) return;
      setMaeCriada({ id, tag: digitado });
      setMotherId(id);
      setEscolhendo(false);
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!motherId) {
      setEscolhendo(true);
      return setError("Escolha a mãe na lista (ou cadastre a que o vaqueiro informou)");
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

  // A mãe já escolhida: a da lista ou, logo depois de cadastrar, a recém-criada.
  const maeEscolhida =
    selecionada ??
    (maeCriada && maeCriada.id === motherId ? { tag: maeCriada.tag, detalhe: "cadastrada agora" } : null);

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
          <div className="space-y-1.5">
            <Label>Mãe *</Label>

            {/* O número não bate com ninguém: diz por quê e dá a saída */}
            {!casou && !maeEscolhida && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2.5 space-y-2">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  O vaqueiro informou a mãe <strong>{digitado}</strong>, mas não existe nenhuma
                  fêmea {digitado} no cadastro (procuramos pelo número, sem os zeros da frente e
                  pelo número antigo). Ou ele errou o número, ou essa{" "}
                  {tipoMarcado.female.toLowerCase()} ainda não foi cadastrada.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={cadastrarMae}
                  disabled={cadastrando || isPending}
                  className="w-full h-11 sm:h-10 bg-white dark:bg-slate-900"
                >
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  {cadastrando
                    ? "Cadastrando..."
                    : `Cadastrar a ${tipoMarcado.female.toLowerCase()} ${digitado} e usar como mãe`}
                </Button>
                <p className="text-[11px] text-amber-700/90 dark:text-amber-400/90">
                  Ou escolha a mãe certa na lista abaixo.
                </p>
              </div>
            )}

            {maeEscolhida && !escolhendo ? (
              <div className="flex items-center gap-2 rounded-md border border-produmar-200 dark:border-slate-600 bg-produmar-50/60 dark:bg-slate-800 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <ItemDeAnimal
                    numero={maeEscolhida.tag}
                    detalhe={
                      "detalhe" in maeEscolhida
                        ? maeEscolhida.detalhe
                        : `${categoryLabel(maeEscolhida.category, maeEscolhida.sex, maeEscolhida.species)}${maeEscolhida.breed_name ? ` · ${maeEscolhida.breed_name}` : ""}`
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEscolhendo(true)}
                  disabled={isPending}
                  className="h-9 px-3 flex-shrink-0"
                >
                  Trocar
                </Button>
              </div>
            ) : (
              <>
                <SearchableSelect
                  inline
                  items={listaDeMaes}
                  value={motherId}
                  onChange={escolher}
                  getId={(a) => a.id}
                  getLabel={(a) => a.tag}
                  renderItem={(a) => (
                    <ItemDeAnimal
                      numero={a.tag}
                      detalhe={`${categoryLabel(a.category, a.sex, a.species)}${a.breed_name ? ` · ${a.breed_name}` : ""}`}
                    />
                  )}
                  searchPlaceholder="Buscar pelo número..."
                  emptyMessage={
                    todosOsTipos
                      ? "Nenhuma fêmea com esse número"
                      : `Nenhuma ${SPECIES_META[tipoDaLista].female.toLowerCase()} com esse número`
                  }
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setTodosOsTipos((v) => !v)}
                    className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 py-1"
                  >
                    {todosOsTipos
                      ? `Mostrar só ${SPECIES_META[tipoDaLista].females.toLowerCase()}`
                      : "Mostrar fêmeas de todos os tipos"}
                  </button>
                  {maeEscolhida && (
                    <button
                      type="button"
                      onClick={() => setEscolhendo(false)}
                      className="text-[11px] font-medium text-slate-500 dark:text-slate-400 py-1"
                    >
                      Manter {maeEscolhida.tag}
                    </button>
                  )}
                </div>
              </>
            )}

            {casou && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {selecionada && selecionada.id === casou.id
                  ? `O vaqueiro digitou ${digitado} — já casou com o cadastro.`
                  : `O vaqueiro digitou ${digitado} (no cadastro: ${casou.tag}), mas você escolheu outra mãe.`}
              </p>
            )}
            {maeCriada && maeCriada.id === motherId && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                {tipoMarcado.female} {maeCriada.tag} cadastrada sem raça — complete a ficha dela
                depois.
              </p>
            )}
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
            <Button
              type="submit"
              disabled={isPending || cadastrando}
              className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
            >
              {isPending ? "Lançando..." : "Lançar no rebanho"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
