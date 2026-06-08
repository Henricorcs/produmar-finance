"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Wrapper sobre Radix Dialog.Root que integra com o histórico do navegador:
 * - Ao abrir, empurra uma entrada de história (sem mudar a URL)
 * - Ao usuário pressionar o botão "voltar" do navegador / Android, fecha o
 *   diálogo ao invés de navegar
 * - Ao fechar manualmente (X, click no overlay, ESC, programaticamente),
 *   remove a entrada que adicionamos para manter o histórico limpo
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
    window.history.pushState({ ...window.history.state, __dialog: true }, "");
    let poppedFromBack = false;

    const handlePopState = () => {
      poppedFromBack = true;
      onOpenChangeRef.current?.(false);
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      // Se fechou por outro caminho (X, overlay, ESC, programático),
      // remove a entrada de histórico que adicionamos — mas só se ela ainda
      // for o topo da pilha. Sem essa checagem, um back() poderia pular para
      // antes da página e levar o usuário para fora da rota atual.
      if (!poppedFromBack && window.history.state?.__dialog) {
        window.history.back();
      }
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
        "fixed left-[50%] top-[50%] z-50 w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%]",
        "max-h-[90vh] overflow-y-auto",
        "bg-white dark:bg-slate-900 rounded-xl shadow-xl p-6",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
        "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        "duration-200",
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
