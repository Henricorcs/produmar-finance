"use client";

import { useCallback, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { upperKeepingCaret } from "@/lib/utils";

/**
 * TELA TEMPORÁRIA DE DIAGNÓSTICO — pode apagar depois.
 *
 * A suspeita agora tem nome: o `text-transform: uppercase` que os campos de
 * cadastro tinham. O texto ficava guardado de um jeito ("Cimen") e desenhado
 * de outro ("CIMEN"); o corretor do iPhone trabalha em cima do texto guardado
 * e erra o alvo ao substituir a palavra — entra só um espaço — e o cursor erra
 * o lugar ao mexer no meio do texto.
 *
 * O campo D abaixo é o único que ainda tem esse text-transform: é o teste.
 *   D trava e C funciona → confirmado, era isso.
 *   C também trava       → não era (só isso), e o registro embaixo mostra o quê.
 */

type Evento = { n: number; campo: string; tipo: string; detalhe: string; valor: string };

const CLASSE_CAMPO =
  "w-full rounded-md border border-produmar-200 dark:border-slate-700 " +
  "bg-white dark:bg-slate-800 px-3 py-2 text-base text-slate-900 dark:text-slate-100";

export function TesteTecladoClient() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const contador = useRef(0);

  const [bruto, setBruto] = useState("");
  const [comoFicou, setComoFicou] = useState("");
  const [comoEra, setComoEra] = useState("");
  const [noDialogo, setNoDialogo] = useState("");
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
    setEventos((antes) =>
      [
        ...antes,
        {
          n: contador.current,
          campo,
          tipo: ev.type,
          detalhe: detalhes.join(" "),
          valor: alvo?.value ?? "",
        },
      ].slice(-80)
    );
  }, []);

  /** Pendura os ouvintes de registro num campo (sem interferir em nada). */
  const escutar = useCallback(
    (campo: string) => (el: HTMLInputElement | null) => {
      if (!el || el.dataset.escutando === "sim") return;
      el.dataset.escutando = "sim";
      ["beforeinput", "input", "compositionstart", "compositionupdate", "compositionend"].forEach(
        (t) => el.addEventListener(t, (ev) => anotar(campo, ev))
      );
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
          Em CADA campo: escreva <b>cime</b> e toque na dica <b>Cimentos</b>. Depois toque no
          meio de uma palavra já escrita e tente apagar e inserir uma letra. Me diga em quais
          funcionou.
        </p>
      </div>

      <Campo
        titulo="A — campo comum, sem nada do sistema"
        explicacao="HTML puro. Se travar AQUI, o problema é do navegador do aparelho."
      >
        <input ref={escutar("A")} defaultValue="" placeholder="escreva aqui" className={CLASSE_CAMPO} />
      </Campo>

      <Campo
        titulo="B — campo do React, sem conversão"
        explicacao="O React guarda o texto, mas nada é convertido nem transformado."
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
        titulo="C — como os campos do app ficaram agora"
        explicacao="Sem text-transform; quem deixa maiúsculo é o teclado (autoCapitalize). ESTE precisa funcionar."
      >
        <input
          ref={escutar("C")}
          value={comoFicou}
          onChange={(e) => setComoFicou(upperKeepingCaret(e))}
          autoCapitalize="characters"
          placeholder="escreva aqui"
          className={CLASSE_CAMPO}
        />
        <Espelho valor={comoFicou} />
      </Campo>

      <Campo
        titulo="D — como os campos do app ERAM (com text-transform)"
        explicacao="É a suspeita. Se D travar e C funcionar, achamos a causa."
      >
        <input
          ref={escutar("D")}
          value={comoEra}
          onChange={(e) => setComoEra(upperKeepingCaret(e))}
          placeholder="escreva aqui"
          className={CLASSE_CAMPO}
          style={{ textTransform: "uppercase" }}
        />
        <Espelho valor={comoEra} />
      </Campo>

      <div className="rounded-xl border border-produmar-200 dark:border-slate-700 p-4 space-y-2">
        <p className="font-semibold text-sm">E — dentro da caixa que abre por cima</p>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Igual ao C. Se C funciona e E trava, o problema é o diálogo.
        </p>
        <Button type="button" onClick={() => setAberto(true)}>
          Abrir a caixa
        </Button>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Campo dentro do diálogo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Campo titulo="E — igual ao C, mas aqui dentro" explicacao="">
              <input
                ref={escutar("E")}
                value={noDialogo}
                onChange={(e) => setNoDialogo(upperKeepingCaret(e))}
                autoCapitalize="characters"
                placeholder="escreva aqui"
                className={CLASSE_CAMPO}
              />
              <Espelho valor={noDialogo} />
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
      {explicacao && <p className="text-xs text-slate-600 dark:text-slate-400">{explicacao}</p>}
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
