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
      className={cn(
        // ── Mobile (base): "folha" que sobe de baixo, largura total ──
        "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-lg max-h-[92vh] overflow-y-auto",
        "bg-white dark:bg-slate-900 rounded-t-2xl rounded-b-none shadow-xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
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
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-60 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-produmar-500 focus:ring-offset-2 disabled:pointer-events-none">
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
