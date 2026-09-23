/**
 * Registra na Cora o endereço para onde ela deve avisar quando um boleto
 * mudar de status (pago, vencido, cancelado...).
 *
 * É um passo ÚNICO por ambiente (stage e produção) — roda uma vez depois do
 * primeiro deploy, porque precisa da URL pública de verdade do site. Rodar de
 * novo não duplica nada de errado, só cadastra outro endpoint junto do
 * anterior (para trocar a URL, é preciso excluir o antigo pelo painel da
 * Cora ou pela API "Exclusão de endpoint").
 *
 * Como usar:
 *
 *   CORA_ENV=stage \
 *   CORA_CLIENT_ID=int-xxxxx \
 *   CORA_CERTIFICATE="$(cat certificate.pem)" \
 *   CORA_PRIVATE_KEY="$(cat private-key.key)" \
 *   node scripts/cora-registrar-webhook.mjs https://seusite.com.br/api/webhooks/cora
 *
 * CORA_ENV=stage testa contra o ambiente de testes da Cora; sem essa
 * variável (ou com CORA_ENV=production) vai para produção — boleto real.
 */

import { request } from "https";
import { randomUUID } from "crypto";

const url = process.argv[2];
if (!url) {
  console.error("Uso: node scripts/cora-registrar-webhook.mjs <url-do-webhook>");
  process.exit(1);
}

const ambiente = process.env.CORA_ENV === "stage" ? "stage" : "production";
const hostname =
  ambiente === "stage"
    ? "matls-clients.api.stage.cora.com.br"
    : "matls-clients.api.cora.com.br";

const clientId = process.env.CORA_CLIENT_ID;
const cert = process.env.CORA_CERTIFICATE;
const key = process.env.CORA_PRIVATE_KEY;

if (!clientId || !cert || !key) {
  console.error("Defina CORA_CLIENT_ID, CORA_CERTIFICATE e CORA_PRIVATE_KEY no ambiente.");
  process.exit(1);
}

function chamar({ method, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = request({ method, hostname, path, headers, cert, key }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const texto = Buffer.concat(chunks).toString("utf-8");
        let json = null;
        try {
          json = texto ? JSON.parse(texto) : null;
        } catch {
          json = texto;
        }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log(`Autenticando na Cora (${ambiente})...`);
  const tokenBody = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}`;
  const tokenResp = await chamar({
    method: "POST",
    path: "/token",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(tokenBody)),
    },
    body: tokenBody,
  });
  if (tokenResp.status !== 200) {
    console.error("Falha ao autenticar:", tokenResp.status, tokenResp.json);
    process.exit(1);
  }
  const token = tokenResp.json.access_token;

  console.log(`Registrando webhook em ${url}...`);
  const body = JSON.stringify({ url, resource: "invoice", trigger: "*" });
  const resp = await chamar({
    method: "POST",
    path: "/endpoints/",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body)),
      "Idempotency-Key": randomUUID(),
      accept: "application/json",
    },
    body,
  });

  if (resp.status !== 200) {
    console.error("Falha ao registrar webhook:", resp.status, resp.json);
    process.exit(1);
  }

  console.log("Webhook registrado:", resp.json);
}

main();
