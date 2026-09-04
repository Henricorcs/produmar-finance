/* eslint-disable no-restricted-globals */
/**
 * O AJUDANTE QUE DEIXA A TELA DO VAQUEIRO ABRIR SEM REDE.
 *
 * Guardar o nascimento no celular (o IndexedDB, em lib/fila-nascimentos.ts) só
 * resolve metade do problema: sem rede o celular nem CHEGA na tela, porque a
 * página vem do servidor a cada abertura. Este arquivo guarda uma cópia da tela
 * no aparelho e a serve quando o sinal some.
 *
 * A CÓPIA DA TELA é instalada só no celular do vaqueiro (veja components/
 * vaqueiro/vaqueiro-client.tsx): no aparelho de quem anda pelo sistema inteiro,
 * uma cópia velha de tela seria dor de cabeça — lá tudo continua vindo do
 * servidor como sempre veio. Quem não é vaqueiro não guarda nada: a busca da
 * tela na instalação cai num redirecionamento e o guardar é abortado, e o
 * atendimento offline lá embaixo só serve o que estiver realmente guardado.
 *
 * O AVISO NO CELULAR (o "push", lá no fim do arquivo) é para todo mundo que
 * ativar: é ele que faz o aparelho apitar quando chega OS nova.
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
    // Nada guardado: este aparelho não é o do vaqueiro (ou ele nunca abriu a
    // tela com sinal). Devolver a página dele aqui seria pior que o erro —
    // então o navegador mostra o offline dele mesmo, como sempre mostrou.
    throw semRede;
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


/* ==========================================================================
 * O AVISO QUE FAZ O CELULAR APITAR
 * ==========================================================================
 * A OS chegava calada: o escritório lançava e o funcionário só descobria ao
 * abrir o app, ou quando alguém ligava pra avisar. Era o telefonema fazendo
 * papel de alerta.
 *
 * Daqui pra frente o servidor manda o recado (lib/push.ts) e o aparelho toca
 * sozinho — com o app fechado, na tela bloqueada. No iPhone isso só vale se o
 * app estiver instalado na tela de início; no Android vale de qualquer jeito.
 * ========================================================================== */

self.addEventListener("push", (evento) => {
  // Aviso sem conteúdo legível não pode sumir calado: melhor tocar com um
  // texto genérico do que o funcionário não ser avisado de nada.
  let dados = { titulo: "PRODUMAR", corpo: "Você tem novidade no app.", url: "/operador" };
  try {
    if (evento.data) dados = { ...dados, ...evento.data.json() };
  } catch (e) {}

  evento.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: "/icon-192",
      badge: "/icon-192",
      // Junta os avisos do mesmo assunto em vez de empilhar uma pilha deles.
      tag: dados.assunto || "produmar",
      renotify: true,
      // No pasto o celular fica no bolso: o aviso espera ser tocado em vez de
      // sumir sozinho depois de alguns segundos.
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: { url: dados.url || "/operador" },
    })
  );
});

/**
 * Tocou no aviso: abre a tela certa. Se o app já estiver aberto numa aba, ela
 * é trazida para a frente em vez de abrir outra — dois apps abertos do mesmo
 * sistema é o tipo de coisa que faz o funcionário lançar no lugar errado.
 */
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || "/operador";

  evento.waitUntil(
    (async () => {
      const abas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const aba of abas) {
        if (new URL(aba.url).origin === self.location.origin) {
          await aba.focus();
          if ("navigate" in aba) await aba.navigate(destino).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(destino);
    })()
  );
});