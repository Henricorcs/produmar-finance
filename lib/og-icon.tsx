import { ImageResponse } from "next/og";

/**
 * Gera o ícone do app (a logo sobre fundo azul cheio) em PNG, no tamanho pedido.
 * Usado pelo apple-touch-icon (iOS) e pelos ícones do manifest (PWA/Android).
 * Fundo "full-bleed" para ficar bom como ícone maskable (o SO recorta as bordas).
 */
export function brandIcon(size: number): ImageResponse {
  const mark = Math.round(size * 0.72);
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F62D8",
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 32 32">
          <path
            d="M9 9h3v14H9V9zm5 0h3v14h-3V9zm5 5h4v9h-4v-9z"
            fill="white"
          />
          <circle cx="21" cy="10.5" r="2" fill="white" />
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}
