/**
 * Puxa as fotos e anexos do servidor ANTIGO para o disco DESTE servidor.
 *
 * Feito para a mudança de servidor (ver docs/migracao-servidor.md). Roda
 * DENTRO do contêiner novo, pelo terminal do EasyPanel (ícone >_): o servidor
 * novo pede ao antigo a lista de arquivos pela mesma porta que o backup do
 * escritório usa (/api/backup) e baixa o que falta. Sem SSH, e sem passar
 * 1,4 GB pela internet do escritório.
 *
 *   node scripts/puxar-fotos-do-servidor-antigo.mjs http://170.0.124.7:3000
 *   node scripts/puxar-fotos-do-servidor-antigo.mjs http://170.0.124.7:3000 --so-listar
 *
 * Use o endereço do antigo PELO IP: depois da virada o domínio aponta para o
 * novo, e a última rodada ainda precisa alcançar o antigo. (Se apontar sem
 * querer para este próprio servidor, o script percebe e para.)
 *
 * A senha é o BACKUP_TOKEN deste serviço — o roteiro manda manter o mesmo
 * valor nos dois servidores. Se o antigo tiver outro, passe o dele na frente:
 *
 *   TOKEN_DO_ANTIGO=valor-do-antigo node scripts/puxar-fotos-do-servidor-antigo.mjs <endereço>
 *
 * PODE RODAR QUANTAS VEZES QUISER: arquivo que já está aqui com o mesmo
 * tamanho é pulado; com tamanho diferente (cópia que caiu no meio), é baixado
 * de novo. NÃO APAGA NADA, nem aqui nem no antigo — foto que só existe aqui
 * continua aqui.
 *
 * Também serve para o caminho de volta: rodado no antigo, apontando para o
 * novo, traz as fotos que tiverem subido no novo.
 *
 * Não depende de pacote nenhum: só o fetch que o Node 20 já traz.
 */

import { randomBytes } from "crypto";
import { chown, mkdir, readdir, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";

const argumentos = process.argv.slice(2);
const SO_LISTAR = argumentos.includes("--so-listar");
const enderecoDigitado = argumentos.find((a) => !a.startsWith("--"));

const DESTINO = path.resolve(process.env.STORAGE_DIR || "/data/attachments");
const TOKEN = process.env.TOKEN_DO_ANTIGO || process.env.BACKUP_TOKEN;

/** Quantos arquivos baixam ao mesmo tempo. Servidor com servidor aguenta. */
const AO_MESMO_TEMPO = 4;
/** Quantas vezes insiste num arquivo antes de dar como falha. */
const TENTATIVAS = 3;

const mb = (b) => (b / 1024 / 1024).toFixed(1) + " MB";
const somar = (lista) => lista.reduce((s, a) => s + a.tamanho, 0);

if (!enderecoDigitado) {
  console.error(
    "Uso: node scripts/puxar-fotos-do-servidor-antigo.mjs <endereço-do-servidor-antigo> [--so-listar]\n" +
      "Exemplo: node scripts/puxar-fotos-do-servidor-antigo.mjs http://170.0.124.7:3000"
  );
  process.exit(1);
}

let ORIGEM;
try {
  const url = new URL(enderecoDigitado);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
  ORIGEM = url.origin;
} catch {
  console.error(`Endereço inválido: "${enderecoDigitado}". Use algo como http://170.0.124.7:3000`);
  process.exit(1);
}

if (!TOKEN) {
  console.error(
    "Falta o BACKUP_TOKEN no ambiente deste serviço. Ele precisa ter o mesmo\n" +
      "valor do servidor antigo (aba Ambiente do EasyPanel). Ou passe o do antigo\n" +
      "na frente do comando: TOKEN_DO_ANTIGO=<valor> node scripts/..."
  );
  process.exit(1);
}

const cabecalhos = { Authorization: `Bearer ${TOKEN}` };

/** Traduz o erro de rede do fetch para algo que diga o que fazer. */
function explicar(e) {
  const codigo = e?.cause?.code || e?.code;
  if (codigo === "ECONNREFUSED")
    return `o antigo recusou a conexão em ${ORIGEM}. Ele está ligado? A porta está certa?`;
  if (codigo === "ENOTFOUND" || codigo === "EAI_AGAIN")
    return `não achei o endereço ${ORIGEM}. Confira se digitou certo.`;
  if (
    e?.name === "TimeoutError" ||
    codigo === "ETIMEDOUT" ||
    codigo === "UND_ERR_CONNECT_TIMEOUT"
  )
    return `o antigo não respondeu a tempo (${ORIGEM}). A porta pode estar fechada no firewall.`;
  return codigo ? `${e.message} (${codigo})` : String(e?.message ?? e);
}

/**
 * Caminho que veio do outro servidor → caminho no disco daqui. `null` se for
 * suspeito: o nome vem de fora, e um `../../etc/algo` gravaria fora da pasta
 * das fotos. Mesma regra do `caminhoSeguro` de lib/storage.ts.
 */
function caminhoAqui(caminho) {
  if (typeof caminho !== "string" || caminho === "") return null;
  if (caminho.startsWith("/") || caminho.includes("\\") || caminho.includes("\0")) return null;
  const partes = caminho.split("/");
  if (partes.some((p) => p === "" || p === "." || p === "..")) return null;
  const destino = path.resolve(DESTINO, ...partes);
  if (!destino.startsWith(DESTINO + path.sep)) return null;
  return destino;
}

/**
 * Nome começando com ponto é coisa interna (teste de escrita, cópia pela
 * metade, o marcador abaixo) — nunca é foto. Upload de verdade é sempre
 * `pasta/<uuid>_<nome>`.
 */
const ehInterno = (caminho) => path.posix.basename(String(caminho)).startsWith(".");

async function tamanhoAqui(destino) {
  try {
    const info = await stat(destino);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

/** Cada pasta e arquivo dentro da pasta daqui, descendo nas subpastas. */
async function* percorrerAqui(pasta = DESTINO, prefixo = "") {
  const itens = await readdir(pasta, { withFileTypes: true }).catch(() => []);
  for (const item of itens) {
    const completo = path.join(pasta, item.name);
    const relativo = prefixo ? `${prefixo}/${item.name}` : item.name;
    yield { completo, relativo, item };
    if (item.isDirectory()) yield* percorrerAqui(completo, relativo);
  }
}

/** Tudo o que existe na pasta daqui (para o resumo do fim). */
async function listarAqui() {
  const achados = [];
  for await (const { completo, relativo, item } of percorrerAqui()) {
    if (!item.isFile() || ehInterno(relativo)) continue;
    const info = await stat(completo).catch(() => null);
    if (info) achados.push({ caminho: relativo, tamanho: info.size });
  }
  return achados;
}

/** Cópia pela metade de uma rodada que foi derrubada (ver `baixar`). */
const ehResto = (nome) => /^\..+\.[0-9a-f]{8}\.baixando$/.test(nome);

async function limparRestos() {
  for await (const { completo, item } of percorrerAqui()) {
    if (item.isFile() && ehResto(item.name)) await rm(completo, { force: true });
  }
}

async function pedirLista() {
  let r;
  try {
    r = await fetch(`${ORIGEM}/api/backup`, {
      headers: cabecalhos,
      // Redirecionamento para outro endereço derruba o cabeçalho da senha no
      // caminho, e o erro viraria um 401 sem sentido. Melhor avisar.
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw new Error(`Não consegui falar com o servidor antigo: ${explicar(e)}`);
  }

  if (r.status >= 300 && r.status < 400) {
    throw new Error(
      `O antigo mandou para outro endereço (${r.headers.get("location") ?? "?"}).\n` +
        "Use esse endereço no comando."
    );
  }
  if (r.status === 404) {
    throw new Error(
      "O antigo respondeu 404. Ou lá o BACKUP_TOKEN não está definido (ou tem\n" +
        "menos de 32 caracteres), ou esse endereço não é o do sistema."
    );
  }
  if (r.status === 401) {
    throw new Error(
      "Senha recusada: o BACKUP_TOKEN daqui não é o mesmo do antigo.\n" +
        "Passe o do antigo na frente: TOKEN_DO_ANTIGO=<valor> node scripts/..."
    );
  }
  if (!r.ok) throw new Error(`O antigo respondeu ${r.status}.`);

  const corpo = await r.json().catch(() => null);
  if (!Array.isArray(corpo?.arquivos)) {
    throw new Error("O antigo respondeu, mas não com a lista de arquivos. Esse endereço é mesmo o do sistema?");
  }
  return corpo.arquivos;
}

/**
 * Baixa um arquivo e só o coloca no lugar depois de inteiro: grava num nome
 * provisório e renomeia. Assim o site nunca entrega foto pela metade, nem se
 * a conexão cair no meio.
 */
async function baixar(arquivo) {
  const r = await fetch(`${ORIGEM}/api/backup?arquivo=${encodeURIComponent(arquivo.caminho)}`, {
    headers: cabecalhos,
    redirect: "manual",
    signal: AbortSignal.timeout(5 * 60_000),
  });
  if (!r.ok) throw new Error(`o antigo respondeu ${r.status}`);

  const conteudo = Buffer.from(await r.arrayBuffer());
  if (conteudo.length !== arquivo.tamanho) {
    throw new Error(`veio com ${conteudo.length} bytes, a lista dizia ${arquivo.tamanho}`);
  }

  const pasta = path.dirname(arquivo.destino);
  const provisorio = path.join(
    pasta,
    `.${path.basename(arquivo.destino)}.${randomBytes(4).toString("hex")}.baixando`
  );
  await mkdir(pasta, { recursive: true });
  try {
    await writeFile(provisorio, conteudo);
    await rename(provisorio, arquivo.destino);
  } catch (e) {
    await rm(provisorio, { force: true });
    throw e;
  }
  return conteudo.length;
}

/**
 * O terminal do EasyPanel entra como root, então o que este script gravou
 * nasceu pertencendo ao root — e o site, que roda como uid 1001, não
 * conseguiria acrescentar foto numa pasta criada agora. Acerta aqui mesmo.
 */
async function acertarDono() {
  await chown(DESTINO, 1001, 1001).catch(() => {});
  for await (const { completo } of percorrerAqui()) {
    await chown(completo, 1001, 1001).catch(() => {});
  }
}

async function main() {
  console.log(`Servidor antigo : ${ORIGEM}`);
  console.log(`Destino (aqui)  : ${DESTINO}\n`);

  // Confere logo que dá para gravar — melhor descobrir agora do que depois de
  // baixar 1,4 GB. O mesmo arquivo serve de marcador: se ele aparecer na lista
  // "do antigo", é porque o endereço aponta para este próprio servidor.
  const marcador = `.migracao-${randomBytes(8).toString("hex")}`;
  try {
    await mkdir(DESTINO, { recursive: true });
    await writeFile(path.join(DESTINO, marcador), "ok");
  } catch (e) {
    throw new Error(
      `Não consigo gravar em ${DESTINO}: ${e.message}\n` +
        "Confira se o volume está montado em /data/attachments e publique de\n" +
        "novo pelo EasyPanel: a partida do contêiner acerta o dono da pasta."
    );
  }

  await limparRestos();

  let lista;
  try {
    console.log("Pedindo a lista de arquivos ao antigo...");
    lista = await pedirLista();
  } finally {
    await rm(path.join(DESTINO, marcador), { force: true });
  }

  if (lista.some((a) => a?.caminho === marcador)) {
    throw new Error(
      `${ORIGEM} é ESTE servidor, não o antigo. Depois da virada o domínio\n` +
        "aponta para cá — use o endereço do antigo pelo IP, ex.: http://170.0.124.7:3000"
    );
  }

  const doAntigo = [];
  const suspeitos = [];
  for (const a of lista) {
    if (ehInterno(a?.caminho)) continue;
    const destino = caminhoAqui(a?.caminho);
    if (!destino || !Number.isSafeInteger(a?.tamanho) || a.tamanho < 0) {
      suspeitos.push(String(a?.caminho));
      continue;
    }
    doAntigo.push({ caminho: a.caminho, tamanho: a.tamanho, destino });
  }

  console.log(`No antigo       : ${doAntigo.length} arquivos · ${mb(somar(doAntigo))}`);
  if (suspeitos.length > 0) {
    console.warn(
      `Ignorados       : ${suspeitos.length} com nome estranho (gravariam fora da pasta das fotos):\n` +
        suspeitos.slice(0, 5).map((s) => `                  ${s}`).join("\n")
    );
  }

  const faltando = [];
  for (const a of doAntigo) {
    if ((await tamanhoAqui(a.destino)) !== a.tamanho) faltando.push(a);
  }
  console.log(`Já estão aqui   : ${doAntigo.length - faltando.length}`);
  console.log(`Faltam baixar   : ${faltando.length} · ${mb(somar(faltando))}\n`);

  if (SO_LISTAR) {
    console.log("(--so-listar: nada foi baixado)");
    return;
  }

  let feitos = 0;
  let baixados = 0;
  let bytes = 0;
  let falhas = 0;
  const fila = [...faltando];

  async function trabalhar() {
    for (let arquivo = fila.shift(); arquivo; arquivo = fila.shift()) {
      let erro = null;
      for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
        try {
          // Em duas linhas de propósito: `bytes += await ...` lê `bytes` ANTES
          // de esperar, e com 4 baixando juntos um apagaria a soma do outro.
          const recebidos = await baixar(arquivo);
          bytes += recebidos;
          baixados++;
          erro = null;
          break;
        } catch (e) {
          erro = e;
          if (tentativa < TENTATIVAS) await new Promise((ok) => setTimeout(ok, 2000 * tentativa));
        }
      }
      feitos++;
      const posicao = `[${feitos}/${faltando.length}]`;
      if (erro) {
        falhas++;
        console.error(`${posicao} FALHOU  ${arquivo.caminho} — ${explicar(erro)}`);
      } else {
        console.log(`${posicao} ${arquivo.caminho}`);
      }
    }
  }

  if (faltando.length > 0) {
    await Promise.all(Array.from({ length: AO_MESMO_TEMPO }, trabalhar));
  }

  if (baixados > 0 && typeof process.getuid === "function" && process.getuid() === 0) {
    await acertarDono();
    console.log("\nDono dos arquivos ajustado para o usuário do site.");
  }

  // Conferência final: olha o disco de novo, não confia só na contagem acima.
  let aindaFaltam = 0;
  for (const a of doAntigo) {
    if ((await tamanhoAqui(a.destino)) !== a.tamanho) aindaFaltam++;
  }
  const aqui = await listarAqui();

  console.log("\n──────────────────────────────────────────");
  console.log(`Baixados agora  : ${baixados} · ${mb(bytes)}`);
  console.log(`Falhas          : ${falhas}`);
  console.log(`No antigo       : ${doAntigo.length} arquivos · ${mb(somar(doAntigo))}`);
  console.log(`Neste servidor  : ${aqui.length} arquivos · ${mb(somar(aqui))}`);
  if (aqui.length > doAntigo.length) {
    console.log("                  (o que passa do antigo são fotos que subiram direto aqui)");
  }

  if (aindaFaltam > 0) {
    console.log(`\nAinda faltam ${aindaFaltam} arquivos do antigo. Rode de novo — os prontos são pulados.`);
    process.exitCode = 1;
  } else {
    console.log(`\nConferido: os ${doAntigo.length} arquivos do antigo estão aqui, com o mesmo tamanho.`);
  }
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
