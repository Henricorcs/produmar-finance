import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { lerArquivo, listarTodosOsArquivos, tipoPelaExtensao } from "@/lib/storage";

/**
 * Porta de saída do backup: deixa o PC do escritório copiar as fotos guardadas
 * aqui, sem precisar de SSH no servidor.
 *
 * Duas perguntas só:
 *   GET /api/backup                    → lista o que existe (JSON)
 *   GET /api/backup?arquivo=<caminho>  → devolve um arquivo
 *
 * O PC compara a lista com o que já baixou e pede só o que falta. Depois da
 * primeira cópia, o backup diário passa a levar segundos.
 *
 * ┌─ SOBRE A SEGURANÇA DESTA ROTA ───────────────────────────────────────────┐
 * │ Ela serve TODOS os arquivos da empresa a quem tiver a senha — por isso:  │
 * │                                                                          │
 * │ · Sem BACKUP_TOKEN definido, ela não existe: responde 404, igual a uma   │
 * │   rota inexistente. Quem não usa backup não fica com essa porta aberta.  │
 * │ · A senha precisa ter 32 caracteres ou mais. Senha curta é recusada na   │
 * │   partida, para ninguém deixar um "123456" protegendo tudo.              │
 * │ · A comparação é feita em tempo constante, para a senha não poder ser    │
 * │   descoberta letra por letra medindo o tempo de resposta.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Sem isto o Next congela esta rota no build.
 *
 * Durante o build não existe BACKUP_TOKEN, então o código devolve 404 sem
 * chegar a olhar a requisição — e o Next conclui que a resposta é sempre a
 * mesma e a guarda pronta. Depois, com o token configurado de verdade, a rota
 * continuaria respondendo o 404 que ficou gravado. Erro difícil de achar:
 * tudo parece certo e nada funciona.
 */
export const dynamic = "force-dynamic";

const TAMANHO_MINIMO_DO_TOKEN = 32;

/** Lido a cada chamada, não uma vez só: no build a variável ainda não existe. */
function tokenConfigurado(): string | null {
  const t = process.env.BACKUP_TOKEN;
  if (!t) return null;
  if (t.length < TAMANHO_MINIMO_DO_TOKEN) {
    console.warn(
      `[backup] BACKUP_TOKEN tem ${t.length} caracteres; o mínimo é ` +
        `${TAMANHO_MINIMO_DO_TOKEN}. A rota de backup fica DESLIGADA até trocar.`
    );
    return null;
  }
  return t;
}

/** Compara sem entregar pistas pelo tempo de resposta. */
function senhaConfere(recebida: string, esperada: string): boolean {
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  // Tamanhos diferentes já não batem, e timingSafeEqual exige tamanhos iguais.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const token = tokenConfigurado();

  // Desligada = inexistente. Nada de 401 aqui: responder "não autorizado"
  // contaria que existe uma porta de backup neste endereço.
  if (!token) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const cabecalho = request.headers.get("authorization") ?? "";
  const recebida = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";

  if (!senhaConfere(recebida, token)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const pedido = request.nextUrl.searchParams.get("arquivo");

  // Sem "arquivo": é a lista.
  if (!pedido) {
    const arquivos = await listarTodosOsArquivos();
    const total = arquivos.reduce((s, a) => s + a.tamanho, 0);
    return NextResponse.json({ arquivos, quantidade: arquivos.length, total });
  }

  const bytes = await lerArquivo(pedido);
  if (!bytes) {
    return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": tipoPelaExtensao(pedido),
      "Content-Length": String(bytes.length),
    },
  });
}
