import { createHash } from "crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";

/**
 * Onde as fotos e comprovantes moram.
 *
 * Saímos do Storage do Supabase (1 GB no plano gratuito, estourado em agosto de
 * 2026) para uma pasta no disco do próprio servidor. Disco de servidor não tem
 * cota: cresce até onde a máquina aguentar, que para o nosso volume é o mesmo
 * que dizer "não acaba".
 *
 * A forma das funções aqui imita a do `supabase.storage.from("attachments")` de
 * propósito — assim a troca nas actions é mecânica, sem repensar cada tela.
 *
 * ATENÇÃO ao operar: esta pasta é um VOLUME PERSISTENTE do EasyPanel. Se ela
 * for para dentro do container, o próximo deploy leva as fotos junto. E ela
 * precisa entrar na rotina de backup — aqui não tem ninguém guardando cópia
 * por nós, como o Supabase fazia.
 */
const RAIZ =
  process.env.STORAGE_DIR ??
  // Em desenvolvimento, uma pasta no próprio projeto (está no .gitignore).
  path.join(process.cwd(), ".storage");

/**
 * O que não estiver no disco ainda é buscado no Supabase.
 *
 * Vem LIGADO de propósito, e só desliga com STORAGE_FALLBACK_SUPABASE=0.
 * O motivo é o pior caso: alguém publica uma versão nova sem ter criado o
 * volume nem copiado as fotos. Ligado, o sistema simplesmente continua lendo do
 * Supabase e ninguém percebe nada. Desligado por padrão, as 446 fotos da
 * empresa sumiriam de todas as telas de uma vez.
 *
 * Desligue só depois que o script de migração rodar e você conferir, foto a
 * foto, que está tudo no disco (ver docs/migracao-fotos.md).
 */
const AINDA_LE_DO_SUPABASE = process.env.STORAGE_FALLBACK_SUPABASE !== "0";

// Em produção sem STORAGE_DIR, os arquivos cairiam numa pasta DENTRO do
// container — que o próximo deploy leva embora. Avisa alto no log de partida.
if (process.env.NODE_ENV === "production" && !process.env.STORAGE_DIR) {
  console.warn(
    "[storage] STORAGE_DIR não definido: gravando em " +
      path.join(process.cwd(), ".storage") +
      " (dentro do container). Fotos novas serão PERDIDAS no próximo deploy. " +
      "Aponte STORAGE_DIR para um volume — ver docs/migracao-fotos.md"
  );
}

/** Tipos de resposta no mesmo formato que as actions já tratam. */
export type ResultadoUpload = { error: { message: string } | null };

/**
 * Impede que um nome de arquivo escape da pasta.
 *
 * Os caminhos são montados pelo nosso código (`animals/<id>/<uuid>_<nome>`),
 * mas o `<nome>` vem do celular de quem enviou. Sem esta limpeza, um arquivo
 * chamado `../../etc/senha` escreveria fora da pasta de fotos.
 */
function caminhoSeguro(chave: string): string {
  const partes = chave.split(/[/\\]+/).filter(Boolean);

  // Recusa em vez de "limpar". Nossos caminhos são sempre montados aqui dentro
  // (`pasta/<uuid>_<nome>`, com o nome já sem barras), então um ".." chegando
  // significa que alguma coisa está errada — e gravar em silêncio num lugar
  // diferente do pedido esconderia o problema em vez de mostrá-lo.
  if (partes.some((parte) => parte === "." || parte === "..")) {
    throw new Error("Caminho de arquivo inválido");
  }

  const limpo = partes.join("/");
  if (!limpo) throw new Error("Caminho de arquivo inválido");

  const destino = path.join(RAIZ, limpo);
  const raizResolvida = path.resolve(RAIZ);

  // Cinto e suspensório: confere que o resultado continua dentro da raiz.
  if (!path.resolve(destino).startsWith(raizResolvida + path.sep)) {
    throw new Error("Caminho de arquivo inválido");
  }

  return destino;
}

/** Grava o arquivo. Cria as pastas do caminho se ainda não existirem. */
export async function uploadArquivo(chave: string, file: File): Promise<ResultadoUpload> {
  try {
    const destino = caminhoSeguro(chave);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, Buffer.from(await file.arrayBuffer()));
    return { error: null };
  } catch (e) {
    return { error: { message: e instanceof Error ? e.message : "Erro ao gravar o arquivo" } };
  }
}

/** Grava a partir de bytes já em memória (usado pelo script de migração). */
export async function uploadBytes(chave: string, bytes: Buffer): Promise<ResultadoUpload> {
  try {
    const destino = caminhoSeguro(chave);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, bytes);
    return { error: null };
  } catch (e) {
    return { error: { message: e instanceof Error ? e.message : "Erro ao gravar o arquivo" } };
  }
}

/**
 * Apaga arquivos. Silencioso quando o arquivo não existe — apagar duas vezes
 * não é erro, e várias telas chamam isto "por garantia" ao desfazer.
 */
export async function removerArquivos(chaves: string[]): Promise<void> {
  await Promise.all(
    chaves.map(async (chave) => {
      try {
        await rm(caminhoSeguro(chave), { force: true });
      } catch {
        // Caminho inválido ou arquivo já removido: não há o que fazer.
      }
    })
  );
}

/** Lê o arquivo do disco. `null` quando ele não está lá. */
export async function lerArquivo(chave: string): Promise<Buffer | null> {
  try {
    const origem = caminhoSeguro(chave);
    const info = await stat(origem);
    if (!info.isFile()) return null;
    return await readFile(origem);
  } catch {
    return null;
  }
}

/**
 * Todos os arquivos guardados, com o caminho relativo e o tamanho.
 *
 * Usado pelo backup: o PC do escritório pergunta o que existe aqui e baixa só
 * o que ainda não tem. Pasta vazia devolve lista vazia, sem reclamar.
 */
export async function listarTodosOsArquivos(): Promise<
  { caminho: string; tamanho: number }[]
> {
  const encontrados: { caminho: string; tamanho: number }[] = [];

  async function percorrer(pasta: string, prefixo: string) {
    const itens = await readdir(pasta, { withFileTypes: true }).catch(() => []);
    for (const item of itens) {
      const completo = path.join(pasta, item.name);
      const relativo = prefixo ? `${prefixo}/${item.name}` : item.name;
      if (item.isDirectory()) {
        await percorrer(completo, relativo);
      } else if (item.isFile()) {
        const info = await stat(completo).catch(() => null);
        if (info) encontrados.push({ caminho: relativo, tamanho: info.size });
      }
    }
  }

  await percorrer(RAIZ, "");
  return encontrados;
}

export async function arquivoExiste(chave: string): Promise<boolean> {
  try {
    return (await stat(caminhoSeguro(chave))).isFile();
  } catch {
    return false;
  }
}

/**
 * Endereço para abrir o arquivo no navegador.
 *
 * Diferente do Supabase, aqui não assinamos uma URL temporária: quem serve o
 * arquivo é a rota /api/arquivo, que confere a sessão antes de entregar. Sai
 * mais seguro (link copiado por engano não dá acesso a ninguém deslogado) e
 * mais simples (o endereço não vence em uma hora, então nada quebra se a
 * pessoa demorar para abrir).
 */
export function urlDoArquivo(chave: string): string {
  const limpo = chave
    .split(/[/\\]+/)
    .filter((parte) => parte && parte !== "." && parte !== "..")
    .map(encodeURIComponent)
    .join("/");
  return `/api/arquivo/${limpo}`;
}

/** Tipo do conteúdo pela extensão — o navegador precisa para exibir em vez de baixar. */
export function tipoPelaExtensao(chave: string): string {
  const ext = path.extname(chave).toLowerCase();
  const tabela: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".pdf": "application/pdf",
    ".xml": "text/xml",
  };
  return tabela[ext] ?? "application/octet-stream";
}

/** Etiqueta de cache/validação para o navegador não rebaixar a mesma foto toda hora. */
export function etagDe(bytes: Buffer): string {
  return `"${createHash("sha1").update(bytes).digest("hex")}"`;
}

export const storageAindaLeDoSupabase = AINDA_LE_DO_SUPABASE;
export const raizDoStorage = RAIZ;
