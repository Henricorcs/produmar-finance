"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Check } from "lucide-react";

interface Props {
  /** Recebe o PNG (data-URL) confirmado, ou null quando não há assinatura. */
  onChange: (dataUrl: string | null) => void;
}

/**
 * Campo de assinatura: mostra um botão "Assinar". Ao tocar, abre uma tela
 * cheia preta com o quadro branco para assinar (dedo/caneta/mouse) e os
 * botões "Limpar" e "OK". Sem dependências externas.
 */
export function SignaturePad({ onChange }: Props) {
  const [value, setValue] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function confirm(dataUrl: string | null) {
    setValue(dataUrl);
    onChange(dataUrl);
    setOpen(false);
  }

  return (
    <>
      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Assinatura"
            className="h-16 flex-1 min-w-0 object-contain rounded-lg border border-slate-200 dark:border-slate-700 bg-white"
          />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-medium text-produmar-600 dark:text-produmar-400 hover:underline px-2 py-1 flex-shrink-0"
          >
            Refazer
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-produmar-400 hover:text-produmar-600 dark:hover:text-produmar-400 transition-colors font-medium"
        >
          <PenLine className="w-4 h-4" />
          Assinar
        </button>
      )}

      {open && <SignatureOverlay onCancel={() => setOpen(false)} onConfirm={confirm} />}
    </>
  );
}

// ── Tela cheia de assinatura ──────────────────────────────────────────────────

function SignatureOverlay({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  // Dimensiona o canvas para o tamanho exibido + fundo branco
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width));
    canvas.height = Math.max(1, Math.round(rect.height));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  // Trava o scroll do fundo enquanto a tela está aberta
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext("2d")!;
    const { x, y } = point(e);
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk.current) {
      hasInk.current = true;
      setEmpty(false);
    }
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setEmpty(true);
  }

  function ok() {
    onConfirm(hasInk.current ? canvasRef.current!.toDataURL("image/png") : null);
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      {/* Quadro de assinatura — ocupa tudo até os botões */}
      <div
        className="relative flex-1 min-h-0"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full bg-white touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl text-slate-300 select-none">
            Assine aqui
          </span>
        )}
      </div>

      {/* Apenas dois botões */}
      <div
        className="flex gap-3 p-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={clear}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl border border-white/30 text-white text-lg font-medium active:bg-white/10 transition-colors"
        >
          <Eraser className="w-5 h-5" />
          Limpar
        </button>
        <button
          type="button"
          onClick={ok}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold transition-colors"
        >
          <Check className="w-5 h-5" />
          OK
        </button>
      </div>
    </div>
  );
}
