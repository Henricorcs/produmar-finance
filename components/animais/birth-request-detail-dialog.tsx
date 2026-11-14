"use client";

import { Baby, CheckSquare, Maximize2, Syringe } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { SPECIES_META, acharMaeDoVaqueiro, categoryLabel, speciesOf } from "./animal-shared";
import type { AnimalBirthRequest, AnimalWithInfo, ProtocoloPendencia } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  request: AnimalBirthRequest | null;
  /** Foto que o vaqueiro mandou (URL assinada). */
  photoUrl: string | null;
  /** Foto da MÃE que ele mandou (migration 138). */
  motherPhotoUrl?: string | null;
  /** O protocolo que ele deixou pendente neste envio (migration 138). */
  pendentes?: ProtocoloPendencia[];
  /** Só fêmeas — para dizer se o número que ele digitou existe no rebanho. */
  mothers: AnimalWithInfo[];
  discarding: boolean;
  onResolve: () => void;
  onDiscard: () => void;
}

/**
 * O envio do vaqueiro por inteiro. O cartão da aba "Nascimentos" mostra o
 * resumo numa linha só (é uma fila, tem que caber na tela); a foto grande, a
 * hora exata e se o número da mãe casou com o cadastro ficam aqui — antes de o
 * patrão decidir se lança ou descarta.
 */
export function BirthRequestDetailDialog({
  open,
  onClose,
  request,
  photoUrl,
  motherPhotoUrl = null,
  pendentes = [],
  mothers,
  discarding,
  onResolve,
  onDiscard,
}: Props) {
  if (!request) return null;

  // o mesmo casamento da conferência: número exato, sem zeros da frente ou antigo
  const mother = acharMaeDoVaqueiro(mothers, request.mother_tag, request.species);

  // O bicho que o vaqueiro marcou (migration 091). Envio antigo é bovino.
  const nomes = SPECIES_META[speciesOf(request.species)];
  // A mãe achada é de outro bicho? O tipo que vale no cadastro é o DELA — então
  // ou o vaqueiro marcou errado, ou esse número é de outro animal.
  const tipoDivergente = mother ? speciesOf(mother.species) !== speciesOf(request.species) : false;

  const sentAt = new Date(request.created_at).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50 text-amber-500 dark:bg-amber-900/30 dark:text-amber-400">
              <Baby className="w-4 h-4" />
            </span>
            Nascimento enviado
          </DialogTitle>
        </DialogHeader>

        {photoUrl ? (
          <a href={photoUrl} target="_blank" rel="noreferrer" className="block relative mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={`${nomes.youngMale} da mãe ${request.mother_tag}`}
              className="w-full h-48 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
            />
            {/* o curral é escuro e a foto sai pequena: o patrão precisa abrir inteira */}
            <span className="absolute bottom-2 right-2 h-8 px-2.5 rounded-full bg-black/60 text-white text-[11px] font-medium flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5" />
              Ver a foto
            </span>
          </a>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2 mb-4">
            Este envio veio sem foto.
          </p>
        )}

        {/* A FOTO DA MÃE (migration 138) — ao lançar, entra na ficha da cria e,
            se a mãe ainda não tem foto, na dela também */}
        {motherPhotoUrl && (
          <a href={motherPhotoUrl} target="_blank" rel="noreferrer" className="block relative -mt-2 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={motherPhotoUrl}
              alt={`Mãe ${request.mother_tag}`}
              className="w-full h-40 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
            />
            <span className="absolute top-2 left-2 h-7 px-2.5 rounded-full bg-black/60 text-white text-[11px] font-semibold flex items-center">
              Mãe
            </span>
            <span className="absolute bottom-2 right-2 h-8 px-2.5 rounded-full bg-black/60 text-white text-[11px] font-medium flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5" />
              Ver a foto
            </span>
          </a>
        )}

        <div className="space-y-3">
          <div>
            <p className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              {nomes.youngMale} {request.calf_sex === "macho" ? "macho" : "fêmea"}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Mãe informada: {request.mother_tag}
            </p>
          </div>

          {mother && tipoDivergente ? (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-2.5 py-2">
              Atenção: o vaqueiro marcou {nomes.youngMale.toLowerCase()}, mas o número{" "}
              {mother.tag} do cadastro é {categoryLabel(mother.category, mother.sex, mother.species)}
              {mother.breed_name ? ` · ${mother.breed_name}` : ""}. Confira a mãe ao lançar: o tipo
              e a raça da cria saem dela.
            </p>
          ) : mother ? (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-2.5 py-2">
              O número {mother.tag} casou com o cadastro —{" "}
              {categoryLabel(mother.category, mother.sex, mother.species)}
              {mother.breed_name ? ` · ${mother.breed_name}` : ""}.
            </p>
          ) : (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-2.5 py-2">
              Não existe nenhuma fêmea {request.mother_tag.trim().toUpperCase()} no cadastro — ou o
              vaqueiro errou o número, ou essa {nomes.female.toLowerCase()} ainda não foi
              cadastrada. Ao lançar, escolha a mãe certa na lista das fêmeas cadastradas.
            </p>
          )}

          <dl className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <Linha rotulo="Tipo do animal" valor={nomes.label} />
            <Linha rotulo="Sexo" valor={request.calf_sex === "macho" ? "Macho" : "Fêmea"} />
            <Linha rotulo="Data do nascimento" valor={formatDate(request.birth_date)} />
            <Linha rotulo="Enviado em" valor={sentAt} />
            {/* envio antigo, de antes da 053, quando o vaqueiro ainda numerava */}
            {request.calf_tag && <Linha rotulo="Nº que veio no envio" valor={request.calf_tag} />}
          </dl>

          {/* Como reconhecer a cria — vira a observação da ficha dela */}
          {request.caracteristicas && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                Características
              </p>
              <p className="text-sm text-slate-800 dark:text-slate-100 break-words">
                {request.caracteristicas}
              </p>
            </div>
          )}

          {/* O que ele NÃO aplicou na hora — pendência dele até dar baixa */}
          {pendentes.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-1.5">
                <Syringe className="w-3.5 h-3.5" />
                Protocolo pendente com o vaqueiro
              </p>
              <ul className="space-y-1">
                {pendentes.map((p) => (
                  <li key={p.id} className="text-xs text-slate-700 dark:text-slate-200">
                    {p.applied_at ? "✓ " : "• "}
                    {p.medicine}
                    {p.dose ? <span className="text-slate-500"> · {p.dose}</span> : null}
                    {p.applied_at ? (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {" "}
                        — aplicado {formatDate(p.applied_at)}
                      </span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400"> — falta aplicar</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-1.5">
                Quando ele der baixa, o remédio entra como tratamento na ficha da cria.
              </p>
            </div>
          )}

          {/* O PROTOCOLO que o vaqueiro marcou como aplicado, no ato */}
          {request.protocolo_aplicado && request.protocolo_aplicado.length > 0 ? (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 mb-1.5">
                <Syringe className="w-3.5 h-3.5" />
                Aplicado no nascimento
              </p>
              <ul className="space-y-1">
                {request.protocolo_aplicado.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-slate-700 dark:text-slate-200">
                      {item.medicine}
                      {item.dose ? <span className="text-slate-500"> · {item.dose}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 mt-1.5">
                Ao lançar no rebanho, cada item entra como tratamento na ficha da cria.
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-2.5 py-2">
              Este envio veio sem protocolo do nascimento — ou não havia protocolo para{" "}
              {nomes.youngMale.toLowerCase()} na hora, ou foi enviado antes da regra.
            </p>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            O número do {nomes.youngMale.toLowerCase()} é seu — você dá na hora de lançar no
            rebanho.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDiscard} disabled={discarding}>
            Descartar
          </Button>
          <Button type="button" onClick={onResolve} disabled={discarding}>
            Lançar no rebanho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <dt className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">{rotulo}</dt>
      <dd className="text-xs font-medium text-slate-700 dark:text-slate-200 text-right break-words">
        {valor}
      </dd>
    </div>
  );
}
