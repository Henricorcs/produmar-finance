// ─────────────────────────────────────────────────────────────────────────────
// MEDIR CERCA — a conta da distância entre pontos marcados pelo GPS
// ─────────────────────────────────────────────────────────────────────────────
// Cada ponto é a média das leituras boas do GPS (uma leitura sozinha do
// celular pula alguns metros). A distância entre dois pontos é a do chão,
// em linha reta (fórmula de Haversine) — o desnível do terreno não entra.
// ─────────────────────────────────────────────────────────────────────────────

export interface PontoGps {
  lat: number;
  lng: number;
  /** Precisão do ponto, em metros (quanto menor, melhor). */
  precisao: number;
  /** Quando foi marcado (ISO). */
  em: string;
  /** Quantas leituras entraram na média. */
  leituras?: number;
}

export interface LeituraGps {
  lat: number;
  lng: number;
  precisao: number;
}

/** Raio médio da Terra, em metros. */
const RAIO_DA_TERRA = 6371008.8;

const rad = (g: number) => (g * Math.PI) / 180;

/** Distância em metros entre dois pontos, pelo chão. */
export function distanciaEmMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_DA_TERRA * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * O ponto a partir das leituras: só as boas (até `folga` metros piores que a
 * melhor) entram, e a média dá mais peso às mais precisas. A precisão do
 * resultado é a da melhor leitura — a média só melhora a partir dela.
 */
export function pontoDasLeituras(leituras: LeituraGps[], folga = 2): PontoGps | null {
  if (leituras.length === 0) return null;
  const melhor = Math.min(...leituras.map((l) => l.precisao));
  const boas = leituras.filter((l) => l.precisao <= melhor + folga);
  let somaPeso = 0;
  let lat = 0;
  let lng = 0;
  for (const l of boas) {
    const peso = 1 / Math.max(1, l.precisao) ** 2;
    somaPeso += peso;
    lat += l.lat * peso;
    lng += l.lng * peso;
  }
  return {
    lat: lat / somaPeso,
    lng: lng / somaPeso,
    precisao: melhor,
    em: new Date().toISOString(),
    leituras: boas.length,
  };
}

/** Os trechos entre pontos seguidos (e, fechado, do último de volta ao primeiro). */
export function trechos(pontos: PontoGps[], fechado: boolean): number[] {
  const t: number[] = [];
  for (let i = 1; i < pontos.length; i++) t.push(distanciaEmMetros(pontos[i - 1], pontos[i]));
  if (fechado && pontos.length >= 3) t.push(distanciaEmMetros(pontos[pontos.length - 1], pontos[0]));
  return t;
}

/**
 * Quanto o total pode estar errado, para mais ou para menos: o erro de cada
 * ponto pesa nos dois trechos dele, mas os erros não se somam inteiros (uns
 * puxam para um lado, outros para o outro) — daí a raiz da soma dos quadrados.
 */
export function margemDoTotal(pontos: PontoGps[]): number {
  if (pontos.length < 2) return 0;
  return Math.sqrt(pontos.reduce((s, p) => s + p.precisao ** 2, 0));
}

/** "1.234,5 m" — metros com uma casa. */
export function formatarMetros(m: number): string {
  return `${m.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
}
