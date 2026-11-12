"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Coordenação entre diálogos empilhados ────────────────────────────────────
// Vários diálogos podem ficar abertos ao mesmo tempo (ex.: "nova categoria" por
// cima de "lançar conta"). Todos integram com o histórico do navegador (botão
// voltar do Android). Sem coordenação, o history.back() que limpa a entrada do
// diálogo de cima dispararia um popstate que fecharia o de baixo junto.
//
// - dialogStack: pilha dos diálogos abertos; só o do TOPO reage ao "voltar".
// - suppressPopstate: nº de popstates a ignorar, gerados pelo nosso próprio
//   back() de limpeza (não devem fechar o diálogo de baixo).
const dialogStack: Array<() => void> = [];
let suppressPopstate = 0;
let dialogIdCounter = 0;

// ── A faixa da tela que o teclado deixa livre ────────────────────────────────
// No celular o teclado NÃO empurra a página: ele cobre a parte de baixo da
// tela. Uma caixa `fixed` continua centrada na tela inteira e metade dela fica
// escondida atrás do teclado — era o que atrapalhava escrever o que o diarista
// fez, cadastrar setor etc.
//
// Enquanto houver diálogo aberto, guardamos em <html> onde a parte visível
// começa (--dialog-band-top) e que altura ela tem (--dialog-band-h). Quem usa
// as duas é a classe .dialog-visible-band (globals.css), que centra a caixa
// nessa faixa e encolhe a altura máxima junto. O contador existe porque pode
// haver diálogo empilhado: só o último a fechar limpa as variáveis.
let bandWatchers = 0;

// ── O campo em que se digita fica sempre à vista ─────────────────────────────
// Ao abrir o teclado, a caixa encolhe para caber na faixa de cima. O iPhone
// rola até o campo tocado, mas NÃO desconta o rodapé grudado embaixo
// (Cancelar / Próximo): o campo ficava atrás dos botões e não se via o que
// estava sendo digitado — o nome do contratante na OS, por exemplo.
// Aqui a caixa rola sozinha até o campo ficar entre o que está grudado em cima
// e o que está grudado embaixo. Só mexe quando o campo está escondido.
const CAMPO_DE_DIGITAR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="range"]):not([type="file"]):not([type="hidden"]), textarea, [contenteditable="true"]';

function mostrarCampoEmFoco() {
  const campo = document.activeElement as HTMLElement | null;
  if (!campo || !campo.matches?.(CAMPO_DE_DIGITAR)) return;
  const caixa = campo.closest<HTMLElement>('[role="dialog"]');
  if (!caixa || caixa.scrollHeight <= caixa.clientHeight + 1) return;

  const c = caixa.getBoundingClientRect();
  let topo = c.top + 8;
  let fundo = c.bottom - 8;
  // o que está grudado (rodapé dos botões, busca presa no alto) tampa o campo
  caixa.querySelectorAll<HTMLElement>(".sticky").forEach((s) => {
    if (s.contains(campo) || getComputedStyle(s).position !== "sticky") return;
    const r = s.getBoundingClientRect();
    if (r.height === 0) return;
    if (r.top > c.top + c.height / 2) fundo = Math.min(fundo, r.top - 8);
    else topo = Math.max(topo, r.bottom + 8);
  });

  const e = campo.getBoundingClientRect();
  if (e.bottom > fundo) {
    // campo mais alto que o espaço (observação grande): mostra o começo dele
    caixa.scrollTop += Math.min(e.bottom - fundo, e.top - topo);
  } else if (e.top < topo) {
    caixa.scrollTop -= topo - e.top;
  }
}

/** Espera o layout assentar (variáveis da faixa, animação do teclado). */
function mostrarCampoDepois() {
  requestAnimationFrame(() => requestAnimationFrame(mostrarCampoEmFoco));
}

function useVisibleBand(open: boolean | undefined) {
  React.useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;

    const update = () => {
      // Com zoom de pinça a "faixa visível" é o pedaço ampliado da tela —
      // encolher o diálogo por causa disso só atrapalharia. Volta pra tela toda.
      if (vv.scale > 1.05) {
        root.style.removeProperty("--dialog-band-top");
        root.style.removeProperty("--dialog-band-h");
        return;
      }
      root.style.setProperty("--dialog-band-top", `${vv.offsetTop}px`);
      root.style.setProperty("--dialog-band-h", `${vv.height}px`);
      // o teclado abriu (ou mudou de altura): a caixa encolheu — traz o campo
      mostrarCampoDepois();
    };

    // Tocou num campo: com o teclado já aberto não há "resize", então confere
    // agora e de novo quando a animação do teclado tiver acabado.
    let espera: ReturnType<typeof setTimeout> | undefined;
    const aoFocar = () => {
      mostrarCampoDepois();
      clearTimeout(espera);
      espera = setTimeout(mostrarCampoEmFoco, 400);
    };

    bandWatchers++;
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", aoFocar);

    return () => {
      clearTimeout(espera);
      document.removeEventListener("focusin", aoFocar);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      if (--bandWatchers === 0) {
        root.style.removeProperty("--dialog-band-top");
        root.style.removeProperty("--dialog-band-h");
      }
    };
  }, [open]);
}

/**
 * Wrapper sobre Radix Dialog.Root que integra com o histórico do navegador:
 * - Ao abrir, empurra uma entrada de história (sem mudar a URL)
 * - Ao usuário pressionar o botão "voltar" do navegador / Android, fecha
 *   apenas o diálogo do topo da pilha ao invés de navegar
 * - Ao fechar manualmente (X, click no overlay, ESC, programaticamente),
 *   remove a entrada que adicionamos para manter o histórico limpo, sem
 *   fechar diálogos empilhados abaixo
 */
const Dialog = ({
  open,
  onOpenChange,
  children,
  ...rest
}: React.ComponentProps<typeof DialogPrimitive.Root>) => {
  useVisibleBand(open);

  // Mantém a referência ao callback estável entre renders para evitar
  // disparar o efeito a cada render do pai
  const onOpenChangeRef = React.useRef(onOpenChange);
  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;

    // Empurra uma entrada de histórico ao abrir (sem alterar a URL).
    // IMPORTANTE: preserva o state interno do Next.js App Router (árvore de
    // rotas guardada em window.history.state). Se sobrescrevermos com um
    // objeto cru, o router perde a referência da rota e, quando um Server
    // Action chama revalidatePath, o refresh joga o usuário de volta para a
    // rota inicial (/ → /dashboard).
    const dialogId = ++dialogIdCounter;
    window.history.pushState(
      { ...window.history.state, __dialog: true, __dialogId: dialogId },
      ""
    );
    let closedByPop = false;

    const close = () => {
      closedByPop = true;
      onOpenChangeRef.current?.(false);
    };
    dialogStack.push(close);

    const handlePopState = () => {
      // popstate gerado pelo nosso próprio back() de limpeza: ignora um
      if (suppressPopstate > 0) {
        suppressPopstate--;
        return;
      }
      // botão "voltar" de verdade: só o diálogo do topo fecha
      if (dialogStack[dialogStack.length - 1] !== close) return;
      close();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      const idx = dialogStack.lastIndexOf(close);
      if (idx !== -1) dialogStack.splice(idx, 1);
      if (closedByPop) return;

      // Se fechou por outro caminho (X, overlay, ESC, programático), remove
      // a entrada de histórico que adicionamos. Adia pro próximo microtask
      // (em vez de rodar na hora) porque, quando este diálogo fecha e outro
      // abre na MESMA ação (ex.: "Editar" fechando o detalhe e abrindo o
      // formulário), o effect do diálogo novo roda logo em seguida, ainda
      // síncrono — o React resolve todos os cleanups antes de rodar os
      // effects novos da mesma leva. Se checássemos aqui (síncrono), ainda
      // veríamos NOSSA própria entrada como topo (o novo diálogo ainda não
      // empilhou) e chamaríamos back() mesmo assim — o popstate assíncrono
      // resultante chegaria DEPOIS do novo diálogo já ter empilhado, e como
      // nosso próprio listener já foi removido, quem escuta é o listener do
      // diálogo novo: ele veria a pilha com só ele mesmo no topo e se
      // fecharia sozinho, por engano. Adiando a checagem pro microtask,
      // damos tempo do effect do diálogo novo (se houver) já ter empilhado
      // sua própria entrada — só chamamos back() se AINDA formos o topo.
      queueMicrotask(() => {
        if (window.history.state?.__dialogId !== dialogId) return;
        // Ainda há diálogo(s) abaixo: o popstate do nosso back() seria
        // capturado por eles — suprime para que não fechem junto.
        if (dialogStack.length > 0) suppressPopstate++;
        window.history.back();
      });
    };
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} {...rest}>
      {children}
    </DialogPrimitive.Root>
  );
};
Dialog.displayName = "Dialog";

const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      // Não fecha ao clicar fora da caixa (evita perda acidental do
      // preenchimento). Fecha apenas pelo X, botão Cancelar ou Esc.
      onInteractOutside={(e) => e.preventDefault()}
      // O teclado não sobe sozinho ao abrir: em vez de focar o primeiro campo
      // (padrão do Radix), o foco vai para a própria caixa — dá para LER o que
      // está escrito antes de digitar. Quem vai escrever toca no campo.
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
      }}
      className={cn(
        // ── Mobile (base): caixa centrada na faixa livre acima do teclado ──
        // (o `top` e a altura máxima vêm de .dialog-visible-band)
        "fixed inset-x-0 z-50 mx-auto w-[calc(100%-1.5rem)] max-w-lg -translate-y-1/2",
        "dialog-visible-band overflow-y-auto overflow-x-hidden overscroll-contain",
        "bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-5",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]",
        "duration-200",
        // ── Desktop (sm+): caixa centralizada (inalterado) ──
        "sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:mx-0 sm:w-[calc(100%-2rem)] sm:translate-x-[-50%] sm:translate-y-[-50%]",
        "sm:max-h-[90vh] sm:rounded-xl sm:p-6 sm:pb-6",
        "sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
        "sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]",
        "sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]",
        className
      )}
      {...props}
    >
      {children}
      {/* Área de toque de 44px. No celular o X desce um pouco (top-2): a caixa
          já não encosta mais no topo da tela (ver .dialog-visible-band), e essa
          folga extra tira o botão de vez da beirada onde o iPhone desenha o
          relógio e a bateria. No desktop volta ao lugar de antes. */}
      <DialogPrimitive.Close className="absolute right-0.5 top-2 sm:top-0.5 w-11 h-11 flex items-center justify-center rounded-lg opacity-60 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-produmar-500 focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Fechar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 mb-4", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-semibold text-produmar-800 dark:text-slate-100", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
