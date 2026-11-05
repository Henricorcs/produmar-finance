import { contaDoLote, encaixar, posicaoDoNumero, posicaoDoRotulo } from "@/lib/medicao-lote";
import type { PontoGps } from "@/lib/medir-cerca";

// ─────────────────────────────────────────────────────────────────────────────
// O MAPA DO LOTE — o contorno desenhado com o norte para cima, os cantos
// numerados na ordem em que foram marcados e a medida de cada lado. O círculo
// claro em volta de cada canto é a precisão do GPS naquele ponto, na escala.
// ─────────────────────────────────────────────────────────────────────────────

const L = 400;
const A = 300;

const metros = (m: number) =>
  `${m.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;

export function MapaDoLote({
  pontos,
  simples = false,
  className,
  claro = false,
}: {
  pontos: PontoGps[];
  /** Miniatura da lista: só o contorno, sem números. */
  simples?: boolean;
  className?: string;
  /** Sempre nas cores claras, mesmo com o tema escuro ligado (folha impressa). */
  claro?: boolean;
}) {
  const c = (classes: string) =>
    claro
      ? classes
          .split(" ")
          .filter((k) => !k.startsWith("dark:"))
          .join(" ")
      : classes;
  const largura = simples ? 120 : L;
  const altura = simples ? 90 : A;
  const conta = contaDoLote(pontos);
  const d = encaixar(conta.xy, largura, altura, simples ? 8 : 48);
  const n = d.cantos.length;
  const ladosRuins = new Set(conta.cruzamentos.flat());
  const caminho = d.cantos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  if (n === 0) {
    return (
      <svg viewBox={`0 0 ${largura} ${altura}`} className={className} role="img" aria-label="Lote sem pontos">
        <rect width={largura} height={altura} rx={8} className={c("fill-slate-50 dark:fill-slate-800/60")} />
        {!simples && (
          <text x={largura / 2} y={altura / 2} textAnchor="middle" fontSize={13} className="fill-slate-400">
            Marque os cantos do lote para ver o mapa
          </text>
        )}
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className={className} role="img" aria-label="Mapa do lote">
      <rect width={largura} height={altura} rx={8} className={c("fill-lime-50/60 dark:fill-slate-800/60")} />

      {/* a precisão de cada canto, na escala do mapa */}
      {!simples &&
        pontos.map((p, i) => {
          const r = p.precisao / d.escala;
          return r > 1.5 && r < 60 ? (
            <circle
              key={`prec-${i}`}
              cx={d.cantos[i].x}
              cy={d.cantos[i].y}
              r={r}
              className="fill-sky-400/15 stroke-sky-400/40"
              strokeWidth={0.75}
            />
          ) : null;
        })}

      {n >= 3 ? (
        <polygon
          points={caminho}
          className={c("fill-lime-500/25 stroke-lime-700 dark:stroke-lime-400")}
          strokeWidth={simples ? 1.5 : 2}
          strokeLinejoin="round"
        />
      ) : (
        n === 2 && (
          <polyline points={caminho} className={c("stroke-lime-700 dark:stroke-lime-400")} strokeWidth={2} fill="none" />
        )
      )}

      {/* lado que cruza outro: em vermelho */}
      {n >= 4 &&
        [...ladosRuins].map((lado) => {
          const a = d.cantos[lado - 1];
          const b = d.cantos[lado % n];
          return (
            <line
              key={`cruz-${lado}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className="stroke-red-600"
              strokeWidth={simples ? 1.5 : 2.5}
              strokeDasharray="6 4"
            />
          );
        })}

      {!simples &&
        conta.lados.map((m, i) => {
          if (n === 2 && i > 0) return null;
          const texto = metros(m);
          // ~6 unidades por letra em fonte 11
          const pos = posicaoDoRotulo(d.cantos, i, 10, texto.length * 3.1);
          return (
            <text
              key={`lado-${i}`}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fontWeight={600}
              className={c("fill-slate-700 stroke-white dark:fill-slate-200 dark:stroke-slate-900")}
              strokeWidth={3}
              paintOrder="stroke"
            >
              {texto}
            </text>
          );
        })}

      {d.cantos.map((p, i) => (
        <g key={`canto-${i}`}>
          <circle
            cx={p.x}
            cy={p.y}
            r={simples ? 2.5 : 4}
            className={c("fill-white stroke-lime-800 dark:fill-slate-900 dark:stroke-lime-300")}
            strokeWidth={1.5}
          />
          {!simples &&
            (() => {
              const pos = n >= 2 ? posicaoDoNumero(d.cantos, i, 13) : { x: p.x, y: p.y - 13 };
              return (
                <g>
                  <circle cx={pos.x} cy={pos.y} r={8} className={c("fill-lime-700 dark:fill-lime-500")} />
                  <text
                    x={pos.x}
                    y={pos.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={10}
                    fontWeight={700}
                    className={c("fill-white dark:fill-slate-900")}
                  >
                    {i + 1}
                  </text>
                </g>
              );
            })()}
        </g>
      ))}

      {!simples && (
        <>
          {/* o norte */}
          <g transform={`translate(${largura - 22}, 14)`}>
            <path d="M0 0 L6 16 L0 12 L-6 16 Z" className={c("fill-slate-700 dark:fill-slate-300")} />
            <text x={0} y={28} textAnchor="middle" fontSize={10} fontWeight={700} className={c("fill-slate-700 dark:fill-slate-300")}>
              N
            </text>
          </g>
          {/* a escala */}
          {n >= 2 && d.barra.comprimento > 0 && (
            <g transform={`translate(12, ${altura - 14})`}>
              <line x1={0} y1={0} x2={d.barra.comprimento} y2={0} className={c("stroke-slate-700 dark:stroke-slate-300")} strokeWidth={2} />
              <line x1={0} y1={-4} x2={0} y2={4} className={c("stroke-slate-700 dark:stroke-slate-300")} strokeWidth={1.5} />
              <line
                x1={d.barra.comprimento}
                y1={-4}
                x2={d.barra.comprimento}
                y2={4}
                className={c("stroke-slate-700 dark:stroke-slate-300")}
                strokeWidth={1.5}
              />
              <text x={d.barra.comprimento + 6} y={0} dominantBaseline="middle" fontSize={10} className={c("fill-slate-600 dark:fill-slate-400")}>
                {d.barra.metros.toLocaleString("pt-BR")} m
              </text>
            </g>
          )}
        </>
      )}
    </svg>
  );
}
