/**
 * Traz as fotos e comprovantes do Storage do Supabase para uma pasta no disco.
 *
 * Como usar (na raiz do projeto):
 *
 *   node scripts/migrar-fotos.mjs                 # baixa para ./fotos-migradas
 *   node scripts/migrar-fotos.mjs --destino D:/backup-fotos
 *   node scripts/migrar-fotos.mjs --so-listar     # não baixa nada, só mostra o tamanho
 *   node scripts/migrar-fotos.mjs --sem-comprimir # copia igual ao original
 *
 * PODE RODAR QUANTAS VEZES QUISER: arquivo que já está no destino é pulado. Se
 * a internet cair no meio de 1,2 GB, é só chamar de novo que ele continua de
 * onde parou.
 *
 * NÃO APAGA NADA no Supabase. O bucket continua intacto — o que é de propósito:
 * enquanto a pasta nova não estiver conferida e com backup, o Supabase é a sua
 * rede de segurança. A limpeza de lá é o último passo da migração, feita à mão.
 *
 * A compressão usa `sharp`, se estiver instalado (`npm i -D sharp`). Sem ele o
 * script copia os arquivos como estão e avisa no fim — copiar sem comprimir é
 * melhor do que não copiar.
 */

import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const RAIZ_PROJETO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ── Configuração ────────────────────────────────────────────────────────────
const BUCKET = "attachments";
const LADO_MAXIMO = 1600;
const QUALIDADE = 80;
/** Abaixo disto não vale a pena mexer — já é uma foto pequena. */
const TAMANHO_MINIMO_PARA_MEXER = 300 * 1024;

const args = process.argv.slice(2);
const temFlag = (nome) => args.includes(nome);
const valorDe = (nome, padrao) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};

const DESTINO = path.resolve(valorDe("--destino", path.join(RAIZ_PROJETO, "fotos-migradas")));
const SO_LISTAR = temFlag("--so-listar");
const SEM_COMPRIMIR = temFlag("--sem-comprimir");

// ── Credenciais (lidas do .env.local, sem depender de pacote extra) ─────────
async function carregarEnv() {
  try {
    const texto = await readFile(path.join(RAIZ_PROJETO, ".env.local"), "utf8");
    for (const linha of texto.split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // Sem .env.local: as variáveis podem já estar no ambiente.
  }
}

// ── Compressão (opcional) ───────────────────────────────────────────────────
let sharp = null;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  // segue sem comprimir
}

const EH_IMAGEM = /\.(jpe?g|png|webp)$/i;
const EH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function talvezComprimir(nomeArquivo, bytes) {
  if (SEM_COMPRIMIR || !sharp) return { bytes, comprimida: false };
  if (!EH_IMAGEM.test(nomeArquivo)) return { bytes, comprimida: false };
  if (bytes.length <= TAMANHO_MINIMO_PARA_MEXER) return { bytes, comprimida: false };

  try {
    const menor = await sharp(bytes)
      .rotate() // respeita a orientação da câmera gravada no EXIF
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: QUALIDADE })
      .toBuffer();

    // Se "encolher" engordou o arquivo, fica o original.
    return menor.length < bytes.length
      ? { bytes: menor, comprimida: true }
      : { bytes, comprimida: false };
  } catch (e) {
    console.warn(`   ! não deu para comprimir (${e.message}) — copiando original`);
    return { bytes, comprimida: false };
  }
}

// ── Percorre o bucket inteiro ───────────────────────────────────────────────
async function listarTudo(supabase, prefixo = "") {
  const encontrados = [];
  const PAGINA = 100;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefixo, { limit: PAGINA, offset, sortBy: { column: "name", order: "asc" } });

    if (error) throw new Error(`Erro ao listar "${prefixo}": ${error.message}`);
    if (!data || data.length === 0) break;

    for (const item of data) {
      const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
      // No Supabase, "pasta" é o item que não tem id — não é um arquivo de verdade.
      if (item.id === null) {
        encontrados.push(...(await listarTudo(supabase, caminho)));
      } else {
        encontrados.push({ caminho, tamanho: item.metadata?.size ?? 0 });
      }
    }

    if (data.length < PAGINA) break;
    offset += PAGINA;
  }

  return encontrados;
}

async function jaBaixado(destinoArquivo) {
  try {
    return (await stat(destinoArquivo)).isFile();
  } catch {
    return false;
  }
}

const mb = (b) => (b / 1024 / 1024).toFixed(1) + " MB";

// ── Programa ────────────────────────────────────────────────────────────────
async function main() {
  await carregarEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    console.error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (no .env.local ou no ambiente)."
    );
    process.exit(1);
  }

  const supabase = createClient(url, chave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Lendo a lista de arquivos do Supabase...");
  const arquivos = await listarTudo(supabase);
  const totalOriginal = arquivos.reduce((s, a) => s + a.tamanho, 0);

  console.log(`\n${arquivos.length} arquivos · ${mb(totalOriginal)} no total`);

  // Quanto cada módulo ocupa — ajuda a entender de onde veio o estouro.
  const porPasta = {};
  for (const a of arquivos) {
    const primeira = a.caminho.split("/")[0];
    // Os anexos de Contas ficam em uma pasta por lançamento, nomeada com o id
    // da transação. Listar centenas de UUIDs não diz nada — vão todos juntos.
    const pasta = EH_UUID.test(primeira) ? "(anexos de Contas)" : primeira;
    porPasta[pasta] = porPasta[pasta] ?? { n: 0, bytes: 0 };
    porPasta[pasta].n++;
    porPasta[pasta].bytes += a.tamanho;
  }
  console.log("\nPor pasta:");
  for (const [pasta, info] of Object.entries(porPasta).sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${pasta.padEnd(20)} ${String(info.n).padStart(5)} arquivos  ${mb(info.bytes)}`);
  }

  if (SO_LISTAR) {
    console.log("\n(--so-listar: nada foi baixado)");
    return;
  }

  if (!sharp && !SEM_COMPRIMIR) {
    console.log(
      "\nAVISO: `sharp` não está instalado — os arquivos serão copiados sem encolher."
    );
    console.log("Para comprimir: npm i -D sharp   (e rode o script de novo)\n");
  }

  console.log(`\nBaixando para ${DESTINO}\n`);

  let baixados = 0;
  let pulados = 0;
  let falhas = 0;
  let bytesGravados = 0;
  let bytesLidos = 0;

  for (const [i, arquivo] of arquivos.entries()) {
    const destinoArquivo = path.join(DESTINO, arquivo.caminho);
    const posicao = `[${String(i + 1).padStart(String(arquivos.length).length)}/${arquivos.length}]`;

    if (await jaBaixado(destinoArquivo)) {
      pulados++;
      continue;
    }

    const { data, error } = await supabase.storage.from(BUCKET).download(arquivo.caminho);
    if (error || !data) {
      console.error(`${posicao} FALHOU  ${arquivo.caminho} — ${error?.message ?? "sem conteúdo"}`);
      falhas++;
      continue;
    }

    const originais = Buffer.from(await data.arrayBuffer());
    const { bytes, comprimida } = await talvezComprimir(arquivo.caminho, originais);

    await mkdir(path.dirname(destinoArquivo), { recursive: true });
    await writeFile(destinoArquivo, bytes);

    bytesLidos += originais.length;
    bytesGravados += bytes.length;
    baixados++;

    const marca = comprimida
      ? `${(originais.length / bytes.length).toFixed(1)}x menor`
      : "como estava";
    console.log(`${posicao} ${arquivo.caminho}  (${marca})`);
  }

  console.log("\n──────────────────────────────────────────");
  console.log(`Baixados : ${baixados}`);
  console.log(`Já tinha : ${pulados}`);
  console.log(`Falhas   : ${falhas}`);
  if (bytesLidos > 0) {
    console.log(`\nTamanho  : ${mb(bytesLidos)} → ${mb(bytesGravados)}`);
    console.log(`Economia : ${(100 - (bytesGravados / bytesLidos) * 100).toFixed(0)}%`);
  }
  console.log(`\nPasta    : ${DESTINO}`);

  if (falhas > 0) {
    console.log("\nRode de novo para tentar os que falharam (os prontos são pulados).");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("\nErro:", e.message);
  process.exit(1);
});
