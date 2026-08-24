import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  etagDe,
  lerArquivo,
  storageAindaLeDoSupabase,
  tipoPelaExtensao,
} from "@/lib/storage";

/**
 * Entrega uma foto ou comprovante guardado no disco do servidor.
 *
 * Substitui a URL assinada do Supabase. Aqui o controle é por sessão: quem não
 * está logado não passa, e o endereço não vence — link copiado continua
 * funcionando para quem tem acesso, e não funciona para mais ninguém.
 *
 * ┌─ CUIDADO AO MEXER ───────────────────────────────────────────────────────┐
 * │ Esta rota confere o login ela mesma, e NÃO PODE deixar de fazer isso.    │
 * │ O matcher do middleware (middleware.ts) tira do caminho tudo que termina │
 * │ em .jpg/.png/.webp e afins, para os ícones do PWA carregarem sem sessão. │
 * │ Como quase todo arquivo daqui termina em .jpg, o middleware NÃO roda     │
 * │ nestas URLs — sem a conferência abaixo, as fotos da empresa ficariam     │
 * │ abertas para qualquer um com o link.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { caminho: string[] } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const chave = params.caminho.map(decodeURIComponent).join("/");

  let bytes = await lerArquivo(chave);

  // Foto antiga que ainda não passou pelo script de migração: busca no Supabase
  // desta vez. Assim a virada acontece sem nenhuma imagem sumir da tela.
  if (!bytes && storageAindaLeDoSupabase) {
    const { data } = await supabase.storage.from("attachments").download(chave);
    if (data) bytes = Buffer.from(await data.arrayBuffer());
  }

  if (!bytes) {
    return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  }

  const etag = etagDe(bytes);

  // O caminho tem um UUID, então o conteúdo nunca muda: o celular pode guardar
  // à vontade em vez de baixar a mesma foto toda vez que a tela abre.
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": tipoPelaExtensao(chave),
      "Content-Length": String(bytes.length),
      ETag: etag,
      // `private`: é conteúdo da empresa, não pode ficar em cache compartilhado.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": "inline",
    },
  });
}
