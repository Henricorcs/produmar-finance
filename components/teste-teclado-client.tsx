"use client";

import { useCallback, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { upperKeepingCaret } from "@/lib/utils";

/**
 * TELA TEMPORÁRIA DE DIAGNÓSTICO — pode apagar depois.
 *
 * Cada campo abaixo é uma variação do que o app faz. Testando os cinco dá para
 * saber exatamente onde a digitação trava, sem chutar:
 *
 *   A trava  → é o navegador/teclado do aparelho, não o sistema.
 *   A ok, B trava → é o React controlando o campo.
 *   B ok, C trava → é a nossa conversão para caixa alta.
 *   C ok, D trava → é o diálogo (a caixa que abre por cima).
 *
 * O registro no fim mostra o que o teclado manda de verdade em cada tecla.
 */

type Evento = { n: number; campo: string; tipo: string; detalhe: string; valor: string };

const CLASSE_CAMPO =
  "w-full rounded-md border border-produmar-200 dark:border-slate-700 " +
  "bg-white dark:bg-slate-800 px-3 py-2 text-base text-slate-900 dark:text-slate-100";

export function TesteTecladoClient() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const contador = useRef(0);

  const [bruto, setBruto] = useState("");
  const [caixaAlta, setCaixaAlta] = useState("");
  const [brutoDialogo, setBrutoDialogo] = useState("");
  const [caixaAltaDialogo, setCaixaAltaDialogo] = useState("");
  const [aberto, setAberto] = useState(false);

  const anotar = useCallback((campo: string, ev: Event) => {
    const alvo = ev.target as HTMLInputElement;
    const entrada = ev as InputEvent;
    const detalhes = [
      entrada.inputType ? `tipo=${entrada.inputType}` : "",
      typeof entrada.isComposing === "boolean" ? `compondo=${entrada.isComposing}` : "",
      entrada.data ? `dado=${JSON.stringify(entrada.data)}` : "",
    ].filter(Boolean);
    contador.current += 1;
    const registro: Evento = {
      n: contador.current,
      campo,
      tipo: ev.type,
      detalhe: detalhes.join(" "),
      valor: alvo?.value ?? "",
    };
    // Só os últimos 80 — o resto não cabe na tela e não ajuda.
    setEventos((antes) => [...antes, registro].slice(-80));
  }, []);

  /** Pendura os ouvintes de registro num campo (sem interferir em nada). */
  const escutar = useCallback(
    (campo: string) => (el: HTMLInputElement | null) => {
      if (!el || el.dataset.escutando === "sim") return;
      el.dataset.escutando = "sim";
      const tipos = [
        "beforeinput",
        "input",
        "compositionstart",
        "compositionupdate",
        "compositionend",
      ];
      tipos.forEach((t) => el.addEventListener(t, (ev) => anotar(campo, ev)));
    },
    [anotar]
  );

  const textoDoRegistro = eventos
    .map((e) => `${e.n} [${e.campo}] ${e.tipo} ${e.detalhe} → "${e.valor}"`)
    .join("\n");

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 p-4 text-sm text-amber-900 dark:text-amber-100">
        <p className="font-semibold mb-1">Tela de teste — some depois que resolvermos</p>
        <p>
          Em CADA campo abaixo, faça as duas coisas: (1) escreva uma palavra e toque na
          dica do corretor; (2) toque no meio de uma palavra já escrita e tente apagar
          e inserir uma letra. Depois me diga em quais campos funcionou.
        </p>
      </div>

      <Campo
        titulo="A — campo comum, sem nada do sistema"
        explicacao="HTML puro. Se travar AQUI, o problema é do navegador/teclado do aparelho."
      >
        <input
          ref={escutar("A")}
          defaultValue=""
          placeholder="escreva aqui"
          className={CLASSE_CAMPO}
        />
      </Campo>

      <Campo
        titulo="B — campo do React, sem conversão"
        explicacao="O React guarda o texto, mas nada é convertido. Se A funciona e B trava, o problema é o React controlar o campo."
      >
        <input
          ref={escutar("B")}
          value={bruto}
          onChange={(e) => setBruto(e.target.value)}
          placeholder="escreva aqui"
          className={CLASSE_CAMPO}
        />
        <Espelho valor={bruto} />
      </Campo>

      <Campo
        titulo="C — campo do sistema (caixa alta)"
        explicacao="Igual aos campos de cadastro do app. Se B funciona e C trava, o problema é a nossa conversão."
      >
        <input
          ref={escutar("C")}
          value={caixaAlta}
          onChange={(e) => setCaixaAlta(upperKeepingCaret(e))}
          placeholder="escreva aqui"
          className={CLASSE_CAMPO}
        />
        <Espelho valor={caixaAlta} />
      </Campo>

      <div className="rounded-xl border border-produmar-200 dark:border-slate-700 p-4 space-y-2">
        <p className="font-semibold text-sm">D e E — dentro da caixa que abre por cima</p>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Se C funciona e os de dentro da caixa travam, o problema é o diálogo.
        </p>
        <Button type="button" onClick={() => setAberto(true)}>
          Abrir a caixa
        </Button>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Campos dentro do diálogo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Campo titulo="D — sem conversão" explicacao="">
              <input
                ref={escutar("D")}
                value={brutoDialogo}
                onChange={(e) => setBrutoDialogo(e.target.value)}
                placeholder="escreva aqui"
                className={CLASSE_CAMPO}
              />
              <Espelho valor={brutoDialogo} />
            </Campo>
            <Campo titulo="E — com caixa alta" explicacao="">
              <input
                ref={escutar("E")}
                value={caixaAltaDialogo}
                onChange={(e) => setCaixaAltaDialogo(upperKeepingCaret(e))}
                placeholder="escreva aqui"
                className={CLASSE_CAMPO}
              />
              <Espelho valor={caixaAltaDialogo} />
            </Campo>
            <Button type="button" onClick={() => setAberto(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="rounded-xl border border-produmar-200 dark:border-slate-700 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-sm">Registro do teclado</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                contador.current = 0;
                setEventos([]);
              }}
            >
              Limpar
            </Button>
            <Button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(textoDoRegistro).catch(() => {});
              }}
            >
              Copiar
            </Button>
          </div>
        </div>
        <pre className="text-[11px] leading-tight whitespace-pre-wrap break-all max-h-80 overflow-y-auto bg-slate-100 dark:bg-slate-900 rounded-lg p-3">
          {textoDoRegistro || "(nada ainda — digite nos campos acima)"}
        </pre>
      </div>
    </div>
  );
}

function Campo({
  titulo,
  explicacao,
  children,
}: {
  titulo: string;
  explicacao: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="font-semibold text-sm">{titulo}</p>
      {explicacao && (
        <p className="text-xs text-slate-600 dark:text-slate-400">{explicacao}</p>
      )}
      {children}
    </div>
  );
}

function Espelho({ valor }: { valor: string }) {
  return (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      guardado: <span className="font-mono">[{valor}]</span>
    </p>
  );
}
