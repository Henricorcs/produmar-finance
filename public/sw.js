/* eslint-disable no-restricted-globals */
/**
 * O AJUDANTE QUE DEIXA A TELA DO VAQUEIRO ABRIR SEM REDE.
 *
 * Guardar o nascimento no celular (o IndexedDB, em lib/fila-nascimentos.ts) só
 * resolve metade do problema: sem rede o celular nem CHEGA na tela, porque a
 * página vem do servidor a cada abertura. Este arquivo guarda uma cópia da tela
 * no aparelho e a serve quando o sinal some.
 *
 * Ele é instalado SÓ no celular do vaqueiro (veja components/vaqueiro/
 * vaqueiro-client.tsx): no aparelho de quem anda pelo sistema inteiro, uma
 * cópia velha de tela seria dor de cabeça — lá tudo continua vindo do servidor
 * como sempre veio.
 *
 * O que ele NÃO faz, de propósito:
 *   • não mexe em envio (POST): a fila do celular já cuida disso;
 *   • não guarda nada do banco — nenhum dado de animal passa por aqui;
 *   • com rede, tudo vem do servidor primeiro. A cópia é o para-quedas.
 */

/** Muda quando a receita daqui muda — o navegador joga fora a cópia velha. */
const VERSAO = "produmar-vaqueiro-v1";

const CACHE_TELA = VERSAO + "-tela";
const CACHE_ARQUIVOS = VERSAO + "-arquivos";

/** A única tela que este ajudante conhece. */
const TELA = "/vaqueiro";

/** Teto de arquivos guardados: cada publicação do sistema deixa os antigos
 *  para trás, e sem um teto isso ia crescendo sem parar no celular. */
const LIMITE_DE_ARQUIVOS = 300;

/** O que dá para guardar com segurança: arquivo de programa com nome carimbado
 *  (muda de nome a cada publicação, então cópia velha nunca é servida por
 *  engano) e os ícones do atalho. */
function ehArquivoFixo(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/manifest.json"
  );
}

/**
 * Na instalação já busca a tela e os arquivos que ela pede, para o vaqueiro
 * estar protegido desde o primeiro dia — sem depender de abrir a tela uma
 * segunda vez ainda com sinal.
 */
async function guardarTelaEArquivos() {
  const resposta = await fetch(TELA, { credentials: "same-origin" });
  // Deslogado o servidor manda para o login: não é a tela, não guarda.
  if (!resposta.ok || resposta.redirected) return;

  const copia = resposta.clone();
  const cacheTela = await caches.open(CACHE_TELA);
  await cacheTela.put(TELA, copia);

  // A página traz dentro dela os endereços dos arquivos de programa que
  // precisa. Pescando esses endereços agora, a tela abre inteira sem rede.
  const html = await resposta.text();
  const achados = html.match(/\/_next\/static\/[A-Za-z0-9._%()\[\]@+\-\/]+/g) || [];
  const enderecos = Array.from(new Set(achados)).filter(
    (e) => e.endsWith(".js") || e.endsWith(".css") || e.endsWith(".woff2")
  );

  const cacheArquivos = await caches.open(CACHE_ARQUIVOS);
  // Um a um: se um arquivo falhar, os outros continuam entrando.
  await Promise.allSettled(enderecos.map((e) => cacheArquivos.add(e)));
}

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    guardarTelaEArquivos()
      .catch(() => {})
      // Assume o lugar do ajudante antigo na hora, sem esperar fechar o app:
      // depois de uma publicação, cópia velha rodando é o que mais confunde.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(
        nomes
          .filter((n) => n.startsWith("produmar-vaqueiro-") && n !== CACHE_TELA && n !== CACHE_ARQUIVOS)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

/** Joga fora os arquivos mais velhos quando passa do teto (a lista vem na
 *  ordem em que entraram, então os primeiros são os mais antigos). */
async function aparar(cache) {
  const chaves = await cache.keys();
  if (chaves.length <= LIMITE_DE_ARQUIVOS) return;
  await Promise.all(chaves.slice(0, chaves.length - LIMITE_DE_ARQUIVOS).map((c) => cache.delete(c)));
}

/** Arquivo de programa: usa a cópia se tiver, senão busca e guarda. */
async function arquivoFixo(requisicao) {
  const cache = await caches.open(CACHE_ARQUIVOS);
  const guardado = await cache.match(requisicao);
  if (guardado) return guardado;

  const resposta = await fetch(requisicao);
  if (resposta.ok) {
    await cache.put(requisicao, resposta.clone());
    aparar(cache);
  }
  return resposta;
}

/**
 * Abrir a tela: tenta o servidor primeiro (com rede, nada muda). Se não for,
 * entrega a cópia guardada — é aí que o vaqueiro consegue trabalhar no mato.
 */
async function abrirTela(requisicao) {
  const cache = await caches.open(CACHE_TELA);
  try {
    const resposta = await fetch(requisicao);
    if (resposta.ok && !resposta.redirected && new URL(requisicao.url).pathname === TELA) {
      cache.put(TELA, resposta.clone());
    }
    return resposta;
  } catch (semRede) {
    const guardado = await cache.match(TELA);
    if (guardado) return guardado;
    // Nunca abriu a tela com sinal: não há o que servir. Pelo menos explica.
    return new Response(
      "<!doctype html><meta charset='utf-8'>" +
        "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
        "<div style=\"font-family:system-ui;padding:2rem;text-align:center\">" +
        "<h1 style='font-size:1.1rem'>Sem rede</h1>" +
        "<p style='color:#555'>Abra esta tela uma vez com sinal — depois disso ela funciona no mato.</p>" +
        "</div>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;

  // Envio de nascimento é POST e não passa por aqui: quem cuida de esperar a
  // rede é a fila do celular, que sabe o que já subiu e o que não subiu.
  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin) return;

  // Abrir uma tela. No celular do vaqueiro o sistema inteiro é esta tela —
  // o servidor manda ele para cá de qualquer endereço —, então sem rede
  // qualquer abertura cai na cópia dela.
  if (requisicao.mode === "navigate") {
    evento.respondWith(abrirTela(requisicao));
    return;
  }

  if (ehArquivoFixo(url)) {
    evento.respondWith(arquivoFixo(requisicao));
  }
});
