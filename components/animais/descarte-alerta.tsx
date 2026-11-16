"use client";

import { useMemo, useState } from "react";
import { Ban, ChevronDown, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { SPECIES_META, categoryLabel, speciesOf } from "./animal-shared";
import type { AnimalWithInfo } from "@/lib/types";

interface Props {
  /** O rebanho da escolha do menu (tipo e raça) — só ativos. */
  animals: AnimalWithInfo[];
  /** Abre a lista já aberta (vem do sino: /animais?descarte=1). */
  abertoInicial?: boolean;
  /** Abre a ficha do animal — é lá que se tira do descarte ou se dá a baixa. */
  onAbrir: (id: string) => void;
}

/**
 * ALERTA DE DESCARTE — o dono pediu: "cria um alerta de animal para descarte,
 * onde eu informo e deve aparecer este alerta". O patrão marca na ficha do
 * animal ("Marcar para descarte", com o motivo); o animal fica aqui até ser
 * tirado do descarte ou sair do rebanho — vendido ou morto (migration 147).
 */
export function DescarteAlerta({ animals, abertoInicial = false, onAbrir }: Props) {
  const [aberto, setAberto] = useState(abertoInicial);

  /** Os marcados há mais tempo primeiro — são os que estão esperando. */
  const lista = useMemo(
    () =>
      animals
        .filter((a) => !!a.descarte_em)
        .sort(
          (a, b) =>
            (a.descarte_em ?? "").localeCompare(b.descarte_em ?? "") ||
            a.tag.localeCompare(b.tag, "pt-BR", { numeric: true })
        ),
    [animals]
  );

  const n = lista.length;
  if (n === 0) return null;

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 overflow-hidden dark:border-red-900/50 dark:bg-red-950/30">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center gap-2 min-h-[48px] px-3 text-sm font-medium text-red-800 dark:text-red-300 active:bg-red-100/60 dark:active:bg-red-900/30"
      >
        <Ban className="w-5 h-5 flex-shrink-0" />
        <span className="flex-1 text-left">
          {n} {n === 1 ? "animal" : "animais"} para descarte
        </span>
        {aberto ? (
          <ChevronDown className="w-4 h-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        )}
      </button>

      {aberto && (
        <ul className="border-t border-red-200 bg-white divide-y divide-slate-100 dark:border-red-900/50 dark:bg-slate-900 dark:divide-slate-800">
          {lista.map((a) => {
            const especie = speciesOf(a.species);
            const quem = categoryLabel(a.category, a.sex, especie);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onAbrir(a.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:bg-slate-50 dark:active:bg-slate-800/60"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
                      Nº {a.tag}
                      <span className="ml-1.5 text-xs font-normal text-slate-400 dark:text-slate-500">
                        {quem}
                        {a.breed_name ? ` · ${a.breed_name}` : ""}
                        {especie !== "bovino" ? ` · ${SPECIES_META[especie].label}` : ""}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {a.descarte_motivo ? `${a.descarte_motivo} · ` : ""}
                      marcado em {formatDate(a.descarte_em!)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
