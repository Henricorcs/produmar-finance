import { request } from "https";

/**
 * A Cora autentica por mTLS: o certificado do cliente entra no próprio
 * handshake TLS, não num header. O fetch global do Node não expõe isso de
 * forma simples/tipada, então a chamada é feita com `https.request` puro —
 * sem precisar de nenhuma dependência nova.
 */

export interface RespostaCora {
  status: number;
  json: unknown;
}

interface OpcoesRequisicao {
  method: "GET" | "POST" | "DELETE";
  hostname: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  /** mTLS: certificado + chave privada do ambiente (stage ou produção). */
  cert: string;
  key: string;
}

export function requisitarCora(opcoes: OpcoesRequisicao): Promise<RespostaCora> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        method: opcoes.method,
        hostname: opcoes.hostname,
        path: opcoes.path,
        headers: opcoes.headers,
        cert: opcoes.cert,
        key: opcoes.key,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const texto = Buffer.concat(chunks).toString("utf-8");
          let json: unknown = null;
          if (texto) {
            try {
              json = JSON.parse(texto);
            } catch {
              json = texto;
            }
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      }
    );

    req.on("error", reject);
    if (opcoes.body) req.write(opcoes.body);
    req.end();
  });
}
