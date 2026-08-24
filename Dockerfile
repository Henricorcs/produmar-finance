FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Expose NEXT_PUBLIC_ vars as ENV so next build can embed them
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG SUPABASE_SERVICE_ROLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV STORAGE_DIR=/data/attachments

# su-exec: usado na partida para acertar o dono do volume das fotos e rebaixar
# de root para o usuário comum na mesma linha (ver docker-entrypoint.sh).
RUN apk add --no-cache su-exec

# Roda como usuário comum, não como root.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Imagem enxuta: o build "standalone" (ver next.config.js) já traz dentro de
# .next/standalone só as dependências que o site usa para rodar, com o servidor
# em server.js. Não copiamos mais o node_modules inteiro — ele carregava também
# TypeScript, ESLint e o resto das ferramentas de desenvolvimento, que não têm
# nada que fazer no servidor.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Script da migração das fotos, para rodar uma vez pelo terminal do EasyPanel.
# Não depende de nada instalado: usa só o fetch que o Node 20 já tem.
COPY --from=builder --chown=nextjs:nodejs /app/scripts/baixar-fotos-no-servidor.mjs ./scripts/

# Sem USER: a partida precisa de root por um instante para acertar o dono do
# volume e então rebaixa para `nextjs`. O site nunca chega a rodar como root.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
EXPOSE 3000
CMD ["node", "server.js"]
