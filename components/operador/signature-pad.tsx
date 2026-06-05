"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

interface Props {
  /** Recebe o PNG (data-URL) a cada traço concluído, ou null quando limpo/vazio. */
  onChange: (dataUrl: string | null) => void;
}

/**
 * Pad de assinatura simples (sem dependências). Funciona com dedo (touch),
 * caneta e mouse via Pointer Events. O fundo é sempre branco para imprimir bem.
 */
export function SignaturePad({ onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  // Fundo branco + estilo do traço
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
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
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current) onChange(canvasRef.current!.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className="relative rounded-xl border border-slate-300 dark:border-slate-600 bg-white overflow-hidden">
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        className="block w-full h-40 touch-none cursor-crosshair"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
      {empty && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-300 select-none">
          Assine aqui com o dedo
        </span>
      )}
      <button
        type="button"
        onClick={clear}
        className="absolute top-1.5 right-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-white/90 border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50 transition-colors"
      >
        <Eraser className="w-3 h-3" />
        Limpar
      </button>
    </div>
  );
}
