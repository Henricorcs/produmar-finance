import type { PontoGps } from "./medir-cerca";

// ─────────────────────────────────────────────────────────────────────────────
// MEDIÇÕES — a conta do lote a partir dos cantos marcados pelo GPS
// ─────────────────────────────────────────────────────────────────────────────
// O GPS dá latitude e longitude (graus). Para medir área, os pontos passam
// antes para um plano em METROS, centrado no próprio lote (projeção local
// equiretangular, com os raios do elipsoide WGS84 na latitude do lote — o
// mesmo do GPS). Num lote de até alguns quilômetros o erro dessa troca é de
// milímetros, bem menor que o erro do próprio GPS.
//
// No plano, a área sai pela fórmula de Gauss (a do "laço de sapato"): soma dos
// produtos cruzados dos cantos seguidos, dividida por dois. Os lados e o
// perímetro saem do mesmo plano, então mapa, lados e área sempre batem.
// ─────────────────────────────────────────────────────────────────────────────

/** Elipsoide WGS84: semieixo maior (m) e excentricidade ao quadrado. */
const A = 6378137;
const E2 = 0.00669437999014;

const rad = (g: number) => (g * Math.PI) / 180;

export interface Xy {
  x: number;
  y: number;
}

/** O centro do lote e quantos metros vale um grau ali (norte e leste). */
export interface PlanoLocal {
  lat0: number;
  lng0: number;
  metrosPorGrauLat: number;
  metrosPorGrauLng: number;
}

export function planoDoLote(pontos: { lat: number; lng: number }[]): PlanoLocal {
  const n = Math.max(1, pontos.length);
  const lat0 = pontos.reduce((s, p) => s + p.lat, 0) / n;
  const lng0 = pontos.reduce((s, p) => s + p.lng, 0) / n;
  const s = Math.sin(rad(lat0));
  const w = 1 - E2 * s * s;
  // raio de curvatura no meridiano (norte-sul) e no primeiro vertical (leste-oeste)
  const M = (A * (1 - E2)) / Math.pow(w, 1.5);
  const N = A / Math.sqrt(w);
  return {
    lat0,
    lng0,
    metrosPorGrauLat: rad(1) * M,
    metrosPorGrauLng: rad(1) * N * Math.cos(rad(lat0)),
  };
}

/** Graus → metros no plano do lote (x = leste, y = norte). */
export function projetar(p: { lat: number; lng: number }, plano: PlanoLocal): Xy {
  return {
    x: (p.lng - plano.lng0) * plano.metrosPorGrauLng,
    y: (p.lat - plano.lat0) * plano.metrosPorGrauLat,
  };
}

/** Metros no plano do lote → graus (o caminho de volta; usado nos testes). */
export function desprojetar(xy: Xy, plano: PlanoLocal): { lat: number; lng: number } {
  return {
    lat: plano.lat0 + xy.y / plano.metrosPorGrauLat,
    lng: plano.lng0 + xy.x / plano.metrosPorGrauLng,
  };
}

const dist = (a: Xy, b: Xy) => Math.hypot(b.x - a.x, b.y - a.y);

/** Área pela fórmula de Gauss (shoelace), em m². Sempre positiva. */
export function areaGauss(xy: Xy[]): number {
  if (xy.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Os lados do contorno fechado: do 1º ao 2º, …, e do último de volta ao 1º. */
export function ladosDoContorno(xy: Xy[]): number[] {
  if (xy.length < 2) return [];
  if (xy.length === 2) return [dist(xy[0], xy[1])];
  return xy.map((p, i) => dist(p, xy[(i + 1) % xy.length]));
}

/** Os dois segmentos se cruzam de verdade (encostar na ponta não conta)? */
function cruzam(a: Xy, b: Xy, c: Xy, d: Xy): boolean {
  const lado = (p: Xy, q: Xy, r: Xy) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = lado(c, d, a);
  const d2 = lado(c, d, b);
  const d3 = lado(a, b, c);
  const d4 = lado(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Os pares de lados que se cruzam (numerados como na tela: lado 1 vai do ponto
 * 1 ao 2). Contorno que se cruza vira um "laço" e a área sai errada — quase
 * sempre é ponto marcado fora de ordem.
 */
export function ladosQueSeCruzam(xy: Xy[]): [number, number][] {
  const n = xy.length;
  const achados: [number, number][] = [];
  if (n < 4) return achados;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // vizinhos pelo fechamento
      if (cruzam(xy[i], xy[(i + 1) % n], xy[j], xy[(j + 1) % n])) achados.push([i + 1, j + 1]);
    }
  }
  return achados;
}

/**
 * Quanto a área pode estar errada, para mais ou para menos. Mexer um canto
 * muda a área em metade da distância entre os dois vizinhos dele vezes o
 * quanto ele mexeu; os erros dos cantos não se somam inteiros — daí a raiz da
 * soma dos quadrados.
 */
export function margemDaArea(xy: Xy[], precisoes: number[]): number {
  const n = xy.length;
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = dist(xy[(i - 1 + n) % n], xy[(i + 1) % n]);
    s += (precisoes[i] ?? 0) ** 2 * d * d;
  }
  return Math.sqrt(s) / 2;
}

/**
 * Põe os pontos em volta do centro, no sentido horário a partir do norte. Para
 * quando marcou fora de ordem: num lote sem "dente" (convexo) isso desfaz o
 * cruzamento. Lote em L ou com reentrância pode precisar de ajuste à mão.
 */
export function ordenarEmVolta<T extends { lat: number; lng: number }>(pontos: T[]): T[] {
  const plano = planoDoLote(pontos);
  return pontos
    .map((p) => {
      const { x, y } = projetar(p, plano);
      return { p, ang: (Math.atan2(x, y) + 2 * Math.PI) % (2 * Math.PI) };
    })
    .sort((a, b) => a.ang - b.ang)
    .map((c) => c.p);
}

export interface ContaDoLote {
  xy: Xy[];
  lados: number[];
  perimetro: number;
  areaM2: number;
  hectares: number;
  margemM2: number;
  cruzamentos: [number, number][];
  /** Tem cantos o bastante para ser um lote (3 fecha; o pedido é 4 ou mais). */
  fechado: boolean;
}

export function contaDoLote(pontos: PontoGps[]): ContaDoLote {
  const plano = planoDoLote(pontos);
  const xy = pontos.map((p) => projetar(p, plano));
  const lados = ladosDoContorno(xy);
  const fechado = pontos.length >= 3;
  const areaM2 = fechado ? areaGauss(xy) : 0;
  return {
    xy,
    lados,
    perimetro: fechado ? lados.reduce((s, l) => s + l, 0) : 0,
    areaM2,
    hectares: areaM2 / 10000,
    margemM2: margemDaArea(
      xy,
      pontos.map((p) => p.precisao)
    ),
    cruzamentos: ladosQueSeCruzam(xy),
    fechado,
  };
}

// ── O desenho ───────────────────────────────────────────────────────────────

export interface Desenho {
  /** Os cantos já na escala do quadro (y para baixo, norte em cima). */
  cantos: Xy[];
  /** Metros por unidade do quadro. */
  escala: number;
  /** A barra de escala: quantos metros e o comprimento no quadro. */
  barra: { metros: number; comprimento: number };
}

/** Um número "redondo" para a barra de escala: 1, 2, 5, 10, 20, 50… */
function redondo(m: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  for (const f of [1, 2, 5, 10]) if (f * p >= m) return f * p;
  return 10 * p;
}

/** Encaixa o contorno no quadro (largura × altura), com folga nas bordas. */
export function encaixar(xy: Xy[], largura: number, altura: number, folga: number): Desenho {
  if (xy.length === 0) return { cantos: [], escala: 1, barra: { metros: 0, comprimento: 0 } };
  const xs = xy.map((p) => p.x);
  const ys = xy.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const util = { w: largura - 2 * folga, h: altura - 2 * folga };
  const k = Math.min(util.w / w, util.h / h);
  // centraliza no quadro
  const ox = folga + (util.w - w * k) / 2;
  const oy = folga + (util.h - h * k) / 2;
  const cantos = xy.map((p) => ({ x: ox + (p.x - minX) * k, y: oy + (maxY - p.y) * k }));
  const metros = redondo(Math.max(w, h) / 5);
  return { cantos, escala: 1 / k, barra: { metros, comprimento: metros * k } };
}

/**
 * Lado do contorno é escrito do lado de FORA do lote, no meio do lado. O texto
 * é deitado: num lado em pé ele precisa de mais folga, de meia largura do
 * texto (`meiaLargura`), para não encostar na linha.
 */
export function posicaoDoRotulo(cantos: Xy[], i: number, afastar: number, meiaLargura = 0): Xy {
  const n = cantos.length;
  const a = cantos[i];
  const b = cantos[(i + 1) % n];
  const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const cx = cantos.reduce((s, p) => s + p.x, 0) / n;
  const cy = cantos.reduce((s, p) => s + p.y, 0) / n;
  let nx = -(b.y - a.y);
  let ny = b.x - a.x;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  // a normal aponta para longe do centro
  if (nx * (meio.x - cx) + ny * (meio.y - cy) < 0) {
    nx = -nx;
    ny = -ny;
  }
  const total = afastar + Math.abs(nx) * meiaLargura;
  return { x: meio.x + nx * total, y: meio.y + ny * total };
}

/** Rótulo do canto: um pouco para fora do lote, na direção do centro → canto. */
export function posicaoDoNumero(cantos: Xy[], i: number, afastar: number): Xy {
  const n = cantos.length;
  const cx = cantos.reduce((s, p) => s + p.x, 0) / n;
  const cy = cantos.reduce((s, p) => s + p.y, 0) / n;
  const p = cantos[i];
  const dx = p.x - cx;
  const dy = p.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / len) * afastar, y: p.y + (dy / len) * afastar };
}

// ── Os números na tela ──────────────────────────────────────────────────────

/** "10.000,00 m²" */
export function formatarM2(m2: number): string {
  return `${m2.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

/** "1,0000 ha" — quatro casas, como em escritura e no CAR. */
export function formatarHectares(m2: number): string {
  return `${(m2 / 10000).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ha`;
}

/** "-3,4567890, -44,1234567" (para conferir num mapa). */
export function coordenada(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(7)}, ${p.lng.toFixed(7)}`;
}
