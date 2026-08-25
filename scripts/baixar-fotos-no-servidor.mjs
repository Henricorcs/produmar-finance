/**
 * Traz as fotos do Supabase direto para o disco do servidor.
 *
 * Roda DENTRO do contêiner, pelo terminal do EasyPanel — nada de SSH, nada de
 * copiar 1,3 GB do seu computador para o servidor. O contêiner puxa do Supabase
 * sozinho, e como quem grava é o próprio usuário do site, os arquivos já nascem
 * com o dono certo.
 *
 *   node scripts/baixar-fotos-no-servidor.mjs
 *   node scripts/baixar-fotos-no-servidor.mjs --so-listar
 *
 * Usa as variáveis que já existem no serviço (NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, STORAGE_DIR) e NÃO depende de nenhum pacote: fala
 * com a API de Storage do Supabase por HTTP, com o fetch que o Node 20 já traz.
 * O `@supabase/supabase-js` não existe solto na imagem — o Next empacota ele
 * dentro do código compilado —, por isso aqui é HTTP na mão.
 *
 * PODE RODAR QUANTAS VEZES QUISER: o que já está no disco é pulado. Se cair no
 * meio, chame de novo que ele continua de onde parou.
 *
 * NÃO APAGA NADA no Supabase.
 */

import { mkdir, stat, writeFile } from "fs/promises";
import path from "path";

const BUCKET = "attachments";
const SO_LISTAR = process.argv.includes("--so-listar");

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DESTINO = process.env.STORAGE_DIR || "/data/attachments";

if (!URL_BASE || !CHAVE) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente do serviço."
  );
  process.exit(1);
}

const cabecalhos = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` };
const mb = (b) => (b / 1024 / 1024).toFixed(1) + " MB";

/** Uma página da listagem do bucket. */
async function listarPagina(prefixo, offset, limite) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...cabecalhos, "Content-Type": "application/json" },
    body: JSON.stringify({
      prefix: prefixo,
      limit: limite,
      offset,
      sortBy: { column: "name", order: "asc" },
    }),
  });

  if (!r.ok) throw new Error(`listagem de "${prefixo}" falhou: ${r.status} ${await r.text()}`);
  return r.json();
}

/** Percorre o bucket inteiro, entrando nas subpastas. */
async function listarTudo(prefixo = "") {
  const encontrados = [];
  const PAGINA = 100;
  let offset = 0;

  for (;;) {
    const itens = await listarPagina(prefixo, offset, PAGINA);
    if (!itens || itens.length === 0) break;

    for (const item of itens) {
      const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
      // "Pasta" é o item sem id — não é arquivo de verdade.
      if (item.id === null) {
        encontrados.push(...(await listarTudo(caminho)));
      } else {
        encontrados.push({ caminho, tamanho: item.metadata?.size ?? 0 });
      }
    }

    if (itens.length < PAGINA) break;
    offset += PAGINA;
  }

  return encontrados;
}

async function jaEstaNoDisco(destinoArquivo) {
  try {
    return (await stat(destinoArquivo)).isFile();
  } catch {
    return false;
  }
}

async function main() {
  console.log(`Destino: ${DESTINO}`);

  // Confere logo que dá para gravar — melhor descobrir agora do que depois de
  // baixar 1,3 GB. Se o dono da pasta estiver errado, para aqui e explica.
  try {
    await mkdir(DESTINO, { recursive: true });
    const teste = path.join(DESTINO, ".teste-de-escrita");
    await writeFile(teste, "ok");
    await (await import("fs/promises")).rm(teste, { force: true });
    console.log("Gravação: ok\n");
  } catch (e) {
    console.error(`\nNão consigo gravar em ${DESTINO}: ${e.message}`);
    console.error(
      "A pasta provavelmente ainda pertence ao root. Publique de novo pelo\n" +
        "EasyPanel: a partida do contêiner acerta o dono sozinha."
    );
    process.exit(1);
  }

  console.log("Lendo a lista de arquivos do Supabase...");
  const arquivos = await listarTudo();
  const total = arquivos.reduce((s, a) => s + a.tamanho, 0);
  console.log(`${arquivos.length} arquivos · ${mb(total)}\n`);

  if (SO_LISTAR) {
    console.log("(--so-listar: nada foi baixado)");
    return;
  }

  let baixados = 0;
  let pulados = 0;
  let falhas = 0;
  let bytes = 0;

  for (const [i, arquivo] of arquivos.entries()) {
    const destinoArquivo = path.join(DESTINO, arquivo.caminho);
    const posicao = `[${i + 1}/${arquivos.length}]`;

    if (await jaEstaNoDisco(destinoArquivo)) {
      pulados++;
      continue;
    }

    const r = await fetch(
      `${URL_BASE}/storage/v1/object/${BUCKET}/${arquivo.caminho
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      { headers: cabecalhos }
    );

    if (!r.ok) {
      console.error(`${posicao} FALHOU  ${arquivo.caminho} — ${r.status}`);
      falhas++;
      continue;
    }

    const conteudo = Buffer.from(await r.arrayBuffer());
    await mkdir(path.dirname(destinoArquivo), { recursive: true });
    await writeFile(destinoArquivo, conteudo);

    bytes += conteudo.length;
    baixados++;
    console.log(`${posicao} ${arquivo.caminho}`);
  }

  console.log("\n──────────────────────────────────────────");
  console.log(`Baixados : ${baixados}  (${mb(bytes)})`);
  console.log(`Já tinha : ${pulados}`);
  console.log(`Falhas   : ${falhas}`);

  // O terminal do EasyPanel entra como root, então o que este script gravou
  // nasceu pertencendo ao root — e o site, que roda como uid 1001, não
  // conseguiria acrescentar foto numa pasta já existente. Acerta o dono aqui
  // mesmo, para não depender de ninguém lembrar de reiniciar depois.
  if (baixados > 0 && typeof process.getuid === "function" && process.getuid() === 0) {
    const { chown } = await import("fs/promises");
    const acertarDono = async (alvo) => {
      const { readdir } = await import("fs/promises");
      await chown(alvo, 1001, 1001).catch(() => {});
      const itens = await readdir(alvo, { withFileTypes: true }).catch(() => []);
      for (const item of itens) {
        const filho = path.join(alvo, item.name);
        if (item.isDirectory()) await acertarDono(filho);
        else await chown(filho, 1001, 1001).catch(() => {});
      }
    };
    await acertarDono(DESTINO);
    console.log("\nDono dos arquivos ajustado para o usuário do site.");
  }

  if (falhas > 0) {
    console.log("\nRode de novo para tentar os que falharam (os prontos são pulados).");
    process.exitCode = 1;
  } else {
    console.log("\nPronto. Confira as fotos no site antes de mexer no Supabase.");
  }
}

main().catch((e) => {
  console.error("\nErro:", e.message);
  process.exit(1);
});
