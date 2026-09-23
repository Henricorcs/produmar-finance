import { randomUUID } from "crypto";
import { requisitarCora } from "./http";
import type { CoraInvoiceRequest, CoraInvoiceResponse } from "./types";

type CoraEnv = "stage" | "production";

function env(): CoraEnv {
  return process.env.CORA_ENV === "stage" ? "stage" : "production";
}

function hostname(): string {
  return env() === "stage"
    ? "matls-clients.api.stage.cora.com.br"
    : "matls-clients.api.cora.com.br";
}

function credenciais() {
  const clientId = process.env.CORA_CLIENT_ID;
  const cert = process.env.CORA_CERTIFICATE;
  const key = process.env.CORA_PRIVATE_KEY;
  if (!clientId || !cert || !key) {
    throw new Error(
      "Cora não configurada: defina CORA_CLIENT_ID, CORA_CERTIFICATE e CORA_PRIVATE_KEY"
    );
  }
  return { clientId, cert, key };
}

// Token dura 24h (expires_in da Cora) — um cache simples em memória do
// processo é suficiente, não precisa de nada externo.
let tokenCache: { token: string; expiraEm: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiraEm > Date.now()) return tokenCache.token;

  const { clientId, cert, key } = credenciais();
  const body = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}`;

  const resposta = await requisitarCora({
    method: "POST",
    hostname: hostname(),
    path: "/token",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(body)),
    },
    body,
    cert,
    key,
  });

  if (resposta.status !== 200) {
    throw new Error(
      `Falha ao autenticar na Cora (${resposta.status}): ${JSON.stringify(resposta.json)}`
    );
  }

  const { access_token, expires_in } = resposta.json as {
    access_token: string;
    expires_in: number;
  };
  // Renova 1 minuto antes de expirar, de folga.
  tokenCache = { token: access_token, expiraEm: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

async function chamar<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const { cert, key } = credenciais();
  const token = await getAccessToken();

  const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    accept: "application/json",
  };
  if (bodyStr !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = String(Buffer.byteLength(bodyStr));
  }
  // Evita duplicar o boleto se a resposta cair no caminho (a Cora garante
  // idempotência por esse header nas chamadas de criação).
  if (method === "POST") headers["Idempotency-Key"] = randomUUID();

  const resposta = await requisitarCora({
    method,
    hostname: hostname(),
    path,
    headers,
    body: bodyStr,
    cert,
    key,
  });

  if (resposta.status < 200 || resposta.status >= 300) {
    throw new Error(
      `Erro na API da Cora (${method} ${path} → ${resposta.status}): ${JSON.stringify(resposta.json)}`
    );
  }
  return resposta.json as T;
}

export async function criarBoleto(input: CoraInvoiceRequest): Promise<CoraInvoiceResponse> {
  return chamar<CoraInvoiceResponse>("POST", "/v2/invoices/", input);
}

/** Reconsulta o boleto direto na Cora — nunca confiar no conteúdo do webhook. */
export async function consultarBoleto(coraInvoiceId: string): Promise<CoraInvoiceResponse> {
  return chamar<CoraInvoiceResponse>("GET", `/v2/invoices/${encodeURIComponent(coraInvoiceId)}`);
}

export async function cancelarBoleto(coraInvoiceId: string): Promise<void> {
  await chamar<unknown>("DELETE", `/v2/invoices/${encodeURIComponent(coraInvoiceId)}`);
}
