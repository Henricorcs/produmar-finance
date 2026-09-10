"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * O mínimo que a lista precisa saber de um material: o nome que aparece e a
 * unidade. Quem chama passa o cadastro dele — o técnico manda o catálogo enxuto
 * e a obra manda o item com saldo; aqui só interessam estes três campos.
 */
export interface MaterialPickerItem {
  id: string;
  name: string;
  unit: string;
}

/** Os acentos, para tirar da comparação: "areia" tem que achar "AREIA". */
const ACENTOS = /[̀-ͯ]/g;

/** Sem acento e em caixa alta: "cola" acha "COLA", "cano" acha "CANO PVC". */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(ACENTOS, "").toUpperCase();
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: MaterialPickerItem[];
  /** Ids já escolhidos — aparecem marcados e não entram duas vezes. */
  escolhidos: string[];
  /** Tocou num material: entra na lista (ou sai, se já estava). */
  onToggle: (item: MaterialPickerItem) => void;
  /**
   * "Não achei" — abre uma linha para escrever o nome na mão. Sem isto o botão
   * some: na obra o lançamento vira saída do estoque na hora, e saída só
   * existe de item cadastrado.
   */
  onEscrever?: () => void;
  /**
   * "Cadastrar material" — a saída de quem NÃO pode escrever na mão: o chefe
   * cadastra o item que faltava sem sair da obra e já continua a baixa.
   */
  onCadastrar?: () => void;
  /**
   * O que aparece na ponta direita de cada linha. O padrão é a unidade — a obra
   * troca pelo saldo, que o chefe precisa ver e o técnico não pode.
   */
  getHint?: (item: MaterialPickerItem) => string;
  /** O título da caixa — cada tela pergunta do seu jeito. */
  titulo?: string;
}

/**
 * A LISTA DE MATERIAIS DO ESTOQUE, para o técnico escolher.
 *
 * Antes, cada material pedia uma caixa nova na tela e uma busca separada — com
 * cinco materiais a tela virava um rolo. Agora é um botão só: abre esta lista,
 * ele vai digitando e a lista vai afinando (a primeira letra mostra tudo que
 * começa com ela; a segunda tira o que não bate, e assim por diante), toca no
 * que usou — pode tocar em vários — e fecha.
 *
 * O que ele tocar já entra marcado com o certo, para ele saber o que já pegou
 * sem precisar fechar e conferir.
 *
 * A mesma lista serve ao chefe em Obras, quando é ele quem lança o material que
 * o técnico não avisou — lá ela mostra o saldo e não deixa escrever na mão.
 */
export function MaterialPickerDialog({
  open,
  onClose,
  items,
  escolhidos,
  onToggle,
  onEscrever,
  onCadastrar,
  getHint,
  titulo = "Qual material você usou?",
}: Props) {
  const [busca, setBusca] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setBusca("");
    // o teclado já sobe: quem abriu esta caixa veio para digitar o material
    const t = setTimeout(() => campo.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  /**
   * A lista que vai afinando. O que COMEÇA com o que foi digitado vem primeiro,
   * depois o que começa uma palavra ("EMENDA 50" aparece ao digitar "50"), e por
   * último o que só contém as letras no meio.
   */
  const encontrados = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return items;

    const achados: { item: MaterialPickerItem; peso: number; pos: number }[] = [];
    for (const item of items) {
      const nome = normalizar(item.name);
      const pos = nome.indexOf(q);
      if (pos < 0) continue;
      const comecaPalavra = pos === 0 || nome[pos - 1] === " ";
      achados.push({ item, peso: pos === 0 ? 0 : comecaPalavra ? 1 : 2, pos });
    }

    achados.sort(
      (a, b) => a.peso - b.peso || a.pos - b.pos || a.item.name.localeCompare(b.item.name)
    );
    return achados.map((a) => a.item);
  }, [items, busca]);

  const marcados = escolhidos.length;
  /** Lista vazia sem ninguém ter digitado nada: falta cadastro, não busca. */
  const vazio = onEscrever
    ? "Nenhum material cadastrado ainda."
    : "Nenhum material com saldo no estoque.";

  /**
   * A saída de quem não achou o que procurava. O técnico escreve o nome na mão
   * (o chefe acha no cadastro depois); o chefe cadastra o material na hora,
   * porque na obra o lançamento já vira baixa — e baixa só existe de item
   * cadastrado.
   */
  const semSaida = onEscrever
    ? { curto: "Não achei", longo: "Escrever o nome na mão", acao: onEscrever }
    : onCadastrar
      ? { curto: "Cadastrar", longo: "Cadastrar este material", acao: onCadastrar }
      : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">{titulo}</DialogTitle>
        </DialogHeader>

        {/* A busca que vai afinando a lista */}
        <div className="relative flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            ref={campo}
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Digite as primeiras letras..."
            className="w-full h-12 pl-11 pr-11 rounded-lg border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-lg text-slate-900 dark:text-slate-100 placeholder:text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-produmar-500"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {busca && (
            <button
              type="button"
              onClick={() => {
                setBusca("");
                campo.current?.focus();
              }}
              aria-label="Limpar a busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* A lista */}
        <div className="flex-1 overflow-y-auto min-h-[8rem]">
          {encontrados.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400 px-4">
                {busca ? `Nenhum material com “${busca}”.` : vazio}
              </p>
              {semSaida && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    semSaida.acao();
                    onClose();
                  }}
                >
                  <Pencil className="w-4 h-4" />
                  {semSaida.longo}
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {encontrados.map((item) => {
                const marcado = escolhidos.includes(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(item)}
                      className={cn(
                        "w-full flex items-center gap-3 px-2 py-3 text-left rounded-lg transition-colors min-h-[52px]",
                        marcado
                          ? "bg-emerald-50 dark:bg-emerald-950/30"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      )}
                    >
                      <span
                        className={cn(
                          "w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0",
                          marcado
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-slate-300 dark:border-slate-600"
                        )}
                      >
                        {marcado && <Check className="w-4 h-4" />}
                      </span>
                      <span className="flex-1 min-w-0 text-base font-medium text-slate-800 dark:text-slate-100 truncate">
                        {item.name}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0 tabular-nums">
                        {getHint ? getHint(item) : item.unit}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* O rodapé: escrever na mão, ou fechar com o que já foi marcado */}
        <div className="flex-shrink-0 flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          {semSaida && (
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12"
              onClick={() => {
                semSaida.acao();
                onClose();
              }}
            >
              <Pencil className="w-4 h-4" />
              {semSaida.curto}
            </Button>
          )}
          <Button type="button" className="flex-[2] h-12 font-semibold" onClick={onClose}>
            {marcados > 0 ? `Pronto (${marcados})` : "Fechar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
