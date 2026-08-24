#!/bin/sh
# Partida do contêiner.
#
# Existe por um motivo só: o volume das fotos é uma pasta do host, e o Docker a
# entrega pertencendo ao root. O site roda como `nextjs` (uid 1001) e ficaria
# sem poder gravar foto nova — lendo as antigas normalmente, o que torna a falha
# difícil de perceber até alguém tentar subir uma.
#
# Então a partida começa como root só para acertar o dono da pasta e, na mesma
# linha, rebaixa para o usuário comum. O site em si NUNCA roda como root — o
# `su-exec` troca de usuário e entrega o processo, sem deixar nada para trás.
# É o mesmo caminho que imagens como a do Postgres e a do Nginx usam.
set -e

DIR="${STORAGE_DIR:-/data/attachments}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DIR"
  # `|| true`: em volume que não aceita troca de dono (alguns tipos de montagem
  # em rede), seguir em frente é melhor do que impedir o site de subir.
  chown -R 1001:1001 "$DIR" 2>/dev/null || true
  exec su-exec 1001:1001 "$@"
fi

# Já entrou sem ser root (execução manual, por exemplo): segue direto.
exec "$@"
