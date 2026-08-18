"use client";

import { Baby, Maximize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { categoryLabel } from "./animal-shared";
import type { AnimalBirthRequest, AnimalWithInfo } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  request: AnimalBirthRequest | null;
  /** Foto que o vaqueiro mandou (URL assinada). */
  photoUrl: string | null;
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
  mothers,
  discarding,
  onResolve,
  onDiscard,
}: Props) {
  if (!request) return null;

  const typed = request.mother_tag.trim().toUpperCase();
  const mother = mothers.find((m) => m.tag.trim().toUpperCase() === typed) ?? null;

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
              alt={`Bezerro da mãe ${request.mother_tag}`}
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

        <div className="space-y-3">
          <div>
            <p className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              Bezerro {request.calf_sex === "macho" ? "macho" : "fêmea"}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Mãe informada: {request.mother_tag}
            </p>
          </div>

          {mother ? (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-2.5 py-2">
              O número {mother.tag} casou com o cadastro —{" "}
              {categoryLabel(mother.category, mother.sex, mother.species)}
              {mother.breed_name ? ` · ${mother.breed_name}` : ""}.
            </p>
          ) : (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-2.5 py-2">
              Não achamos esse número entre as fêmeas — busque a mãe certa ao lançar.
            </p>
          )}

          <dl className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <Linha rotulo="Sexo" valor={request.calf_sex === "macho" ? "Macho" : "Fêmea"} />
            <Linha rotulo="Data do nascimento" valor={formatDate(request.birth_date)} />
            <Linha rotulo="Enviado em" valor={sentAt} />
            {/* envio antigo, de antes da 053, quando o vaqueiro ainda numerava */}
            {request.calf_tag && <Linha rotulo="Nº que veio no envio" valor={request.calf_tag} />}
          </dl>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            O número do bezerro é seu — você dá na hora de lançar no rebanho.
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
