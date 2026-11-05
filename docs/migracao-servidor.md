# Migração para o servidor novo (EasyPanel antigo → EasyPanel novo)

Roteiro para tirar o sistema da VM antiga (EasyPanel em `170.0.124.7`) e subir
no EasyPanel novo **sem perder dado e com a virada levando poucos minutos**.

## Resumo em uma frase

O banco **não muda de lugar** (continua no Supabase). O que muda é o contêiner
do site e **a pasta das fotos** — essa é a única coisa que precisa ser copiada
de um servidor para o outro, e é onde mora o risco.

---

## O que mora onde

| Peça | Onde está hoje | Na migração |
|---|---|---|
| **Banco + login** (OS, financeiro, aluguéis, animais…) | Supabase (nuvem) | **Não mexe.** Os dois servidores falam com o mesmo banco |
| **Fotos e anexos** (`/data/attachments`, ~1,4 GB e crescendo) | Volume `storage` no servidor antigo | **Copiar** para o volume do servidor novo |
| **Código** | GitHub `Henricorcs/produmar-finance`, branch `master` | O EasyPanel novo puxa e faz o build pelo `Dockerfile` |
| **Variáveis de ambiente** (chaves) | Aba **Ambiente** do serviço `financa` | **Copiar uma por uma**, com os mesmos valores |
| **Domínio / HTTPS** | Aba **Domínios** do serviço | Recriar no novo e apontar o DNS |
| **Cron do extrato Cora** (`/api/cora/sync-extrato`) | ❓ EasyPanel antigo ou outro lugar | Recriar no novo — **só depois da virada** |
| **Webhook da Cora** (`/api/webhooks/cora`) | Cadastrado na Cora com a URL do site | Mesmo domínio: nada. Domínio novo: recadastrar |
| **Backup do PC do escritório** | `backup.config.json` → `site_url` | Trocar o endereço para o servidor novo |

**Por que o banco ficar parado ajuda tanto:** não existe "dado do servidor
antigo" e "dado do servidor novo". Os dois sites mostram exatamente a mesma
coisa o tempo todo. Dá para subir o novo, testar com calma, e a virada vira
só uma troca de endereço.

> ⚠️ **O outro lado da moeda:** como o banco é o mesmo, **o servidor novo já
> é produção desde o primeiro minuto**. Lançamento criado lá para "testar" é
> lançamento de verdade. Boleto gerado lá é boleto de verdade na Cora. Teste
> olhando, abrindo e subindo uma foto de teste — não criando contas, contratos
> ou boletos.

---

## Antes de começar: o que preciso saber

Essas respostas mudam alguns passos. Onde o roteiro depende delas, está
marcado com ❓.

1. **O site é aberto por domínio** (ex.: `sistema.produmar.com.br`) **ou pelo
   IP** `http://170.0.124.7:3000`? E o domínio **vai continuar o mesmo**?
2. **O servidor novo já tem o EasyPanel instalado?** Qual o IP, quanto de
   disco e de memória?
3. **O que mais roda no EasyPanel antigo** além do serviço `financa`? (cron
   do extrato, outros apps, bancos)
4. **A migração das fotos para fora do Supabase foi até o fim?** Ou seja, o
   `STORAGE_FALLBACK_SUPABASE=0` já está ligado e o bucket `attachments` já
   foi apagado? (Ver `docs/migracao-fotos.md`, passos 7 e 8.)

### Por que manter o mesmo domínio (se houver um)

Com o **mesmo domínio**, a troca é invisível para quem usa: o celular continua
logado, o app instalado na tela inicial continua funcionando, os avisos no
celular continuam chegando e a Cora continua avisando no endereço certo.

Com **domínio novo**, cada pessoa (técnico, vaqueiro, prefeitura…) precisa
entrar de novo, reinstalar o app na tela inicial e reativar os avisos. Além
disso o webhook da Cora precisa ser recadastrado.

### Se hoje é só pelo IP, sem HTTPS

Vale aproveitar a mudança para colocar um domínio com HTTPS. Sem HTTPS o
navegador do celular **bloqueia** o GPS (Medir cerca), os avisos no celular e
a instalação do app na tela inicial.

---

## Fase 0 — Preparação (nada muda para ninguém)

### 0.1 Anotar tudo do servidor antigo

No EasyPanel antigo, serviço **financa**, tire foto/anote de cada aba:

- **Ambiente** — todas as variáveis com os valores. Guarde num lugar seguro
  (gerenciador de senhas ou arquivo fora da pasta do projeto). **Nunca no git,
  nunca no WhatsApp.**
- **Domínios** — quais domínios e para qual porta (3000).
- **Volumes / Mounts** — confirmar `storage` → `/data/attachments`.
- **Recursos** — limite de memória/CPU, se houver.
- Procure também onde está o **cron do extrato da Cora** (no EasyPanel ou num
  serviço externo tipo cron-job.org).

### 0.2 Lista das variáveis

O código usa exatamente estas. Copie **com os mesmos valores**:

| Variável | Obrigatória | Atenção |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sim | Entra no build — tem que estar salva **antes** do 1º deploy |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | Idem |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Também é a chave do cofre dos certificados, se `CERTIFICADOS_CHAVE` não existir |
| `CERTIFICADOS_CHAVE` | se existir no antigo | **Valor idêntico**, ou os certificados digitais guardados não abrem mais. Se não existe no antigo, **não crie** no novo |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | para avisos | **Valor idêntico.** Par novo = ninguém recebe aviso |
| `VAPID_PRIVATE_KEY` | para avisos | Idem |
| `CORA_ENV` | para boleto | `production` no servidor de verdade |
| `CORA_CLIENT_ID` | para boleto | |
| `CORA_CERTIFICATE` | para boleto | Conteúdo do `.pem`, com as quebras de linha |
| `CORA_PRIVATE_KEY` | para boleto | Conteúdo do `.key`, com as quebras de linha |
| `CORA_STATEMENT_HOSTNAME` | só se existir | |
| `CORA_SYNC_TOKEN` | para o cron | Pode manter o mesmo |
| `BACKUP_TOKEN` | para o backup | **Manter o mesmo** — é ele que vai deixar o servidor novo puxar as fotos do antigo |
| `ANTHROPIC_API_KEY` | para OCR de NF | |
| `STORAGE_FALLBACK_SUPABASE` | só se existir | Copiar como está |

`RESEND_API_KEY`, `ALERT_EMAIL_FROM` e `ILNET_CNPJ` aparecem no `.env.example`
mas **o código não usa mais** — não precisa levar.

`STORAGE_DIR` não precisa: o `Dockerfile` já define `/data/attachments`.

### 0.3 Backup fresco

No PC do escritório:

```bash
node scripts/backup.mjs
```

Tem que terminar com `Resultado: OK`. Isso deixa em `C:/Backup-ILNET` o banco
do dia e o espelho completo das fotos — é a rede de segurança se tudo der
errado.

### 0.4 Baixar o TTL do DNS (se houver domínio)

Um dia antes da virada, no painel do DNS, baixe o TTL do registro do site para
**300 segundos** (5 minutos). Assim, quando trocar o IP, todo mundo enxerga o
servidor novo em minutos, e não em horas.

### 0.5 Conferir o servidor novo

- Pelo menos **5 GB livres** de disco (1,4 GB de fotos + imagens do Docker +
  folga para crescer)
- Pelo menos **2 GB de memória**: o build do Next roda dentro do servidor e
  costuma falhar com menos
- Portas **80 e 443** abertas (para o HTTPS)
- ❓ Se o Supabase tiver **Network Restrictions** ligado (Settings →
  Database), incluir o IP novo. No plano gratuito normalmente está desligado.

---

## Fase 1 — Subir o servidor novo em paralelo

O antigo continua no ar normalmente durante toda esta fase.

1. **Criar o projeto e o serviço** no EasyPanel novo: tipo **App**, nome
   `financa`.
2. **Fonte:** GitHub → `Henricorcs/produmar-finance`, branch `master`.
   **Build:** Dockerfile.
3. **Ambiente:** colar todas as variáveis da tabela acima **antes** de
   implantar. As `NEXT_PUBLIC_` são gravadas dentro do build — se faltarem
   agora, o site sobe quebrado e precisa de outro deploy.
4. **Volume:** tipo Volume, nome `storage`, mount path `/data/attachments`.
5. **Domínio provisório:** use o endereço que o próprio EasyPanel gera (ou um
   subdomínio de teste, tipo `novo.seudominio.com.br`) com HTTPS ligado, porta
   3000.
6. **Implantar.** Acompanhar o log do build até o fim.
7. **Ainda não:** cron do extrato, webhook da Cora, backup do PC. Os dois
   servidores sincronizando o extrato ao mesmo tempo só gera confusão.

**Conferência rápida** no domínio provisório: login abre, a lista de Contas
aparece (prova que chegou no banco). As fotos antigas **ainda não** aparecem —
é esperado, a pasta está vazia (ou vêm do Supabase, se a reserva ainda estiver
ligada).

---

## Fase 2 — Copiar as fotos (com o antigo ainda no ar)

**Sem SSH e sem passar pelo PC do escritório:** o servidor novo puxa as fotos
direto do antigo, usando a mesma porta que o backup do escritório já usa
(`/api/backup`, protegida pelo `BACKUP_TOKEN`). Servidor falando com servidor
é muito mais rápido que subir 1,4 GB pela internet do escritório.

Para isso falta um script, nos moldes do `baixar-fotos-no-servidor.mjs`:
**`scripts/puxar-fotos-do-servidor-antigo.mjs`** (a fazer — ver "Próximos
passos" no fim). Ele vai:

- pedir ao antigo a lista de todos os arquivos (nome e tamanho)
- baixar só o que **ainda não está** no disco novo, ou está com tamanho
  diferente
- **nunca apagar nada** — pode rodar quantas vezes quiser, e cada rodada
  depois da primeira leva segundos
- terminar mostrando "antigo: N arquivos / X MB · novo: N arquivos / X MB"

Uso, no terminal do contêiner novo (ícone **`>_`** no EasyPanel):

```bash
node scripts/puxar-fotos-do-servidor-antigo.mjs http://170.0.124.7:3000
```

> O endereço é o do **antigo pelo IP**, de propósito: depois da virada o
> domínio vai apontar para o novo, e o script precisa continuar alcançando o
> antigo para a última rodada.

Rode a primeira vez agora (a demorada). Confira que os números do antigo e do
novo batem, e abra no domínio provisório uma foto antiga de Patrimônio.

### Alternativa, se tiver SSH nos dois servidores

```bash
rsync -avz root@170.0.124.7:/etc/easypanel/projects/<projeto>/financa/volumes/storage/ \
  /etc/easypanel/projects/<projeto>/financa/volumes/storage/
```

(rodado no servidor novo; ❓ confirmar os caminhos dos volumes nos dois). Funciona
igual, mas exige acesso de root nas duas máquinas.

---

## Fase 3 — A virada

**Quando:** fora do expediente (noite ou domingo), avisando antes quem sobe
foto pelo celular no campo — técnico e vaqueiro. Leva uns 15–30 minutos.

1. **Segunda rodada das fotos** (pega o que entrou desde a Fase 2):
   ```bash
   node scripts/puxar-fotos-do-servidor-antigo.mjs http://170.0.124.7:3000
   ```
2. **Domínio no servidor novo:** na aba **Domínios** do serviço novo,
   acrescentar o domínio oficial (HTTPS ligado, porta 3000).
3. **DNS:** trocar o registro do domínio para o **IP do servidor novo**.
   ❓ Se hoje o acesso é pelo IP, este passo é "avisar todo mundo do endereço
   novo" — e aí vale já ser um domínio com HTTPS.
4. **Esperar o DNS virar** (com TTL de 300 s, uns 5–10 minutos). Conferir no
   celular com o Wi-Fi desligado que o site abre no servidor novo — o
   certificado HTTPS do EasyPanel só sai depois que o DNS aponta para ele.
5. **Última rodada das fotos** — pega qualquer foto que alguém ainda tenha
   subido no antigo durante a troca:
   ```bash
   node scripts/puxar-fotos-do-servidor-antigo.mjs http://170.0.124.7:3000
   ```
6. **Parar o serviço antigo** (botão de parar no EasyPanel antigo). **Parar,
   não apagar.** Ele fica lá como caminho de volta.

---

## Fase 4 — Religar as peças de fora

1. **Cron do extrato da Cora:** recriar no servidor novo, chamando
   `https://<dominio>/api/cora/sync-extrato` com o header
   `Authorization: Bearer <CORA_SYNC_TOKEN>`, no mesmo horário do antigo.
   Se o cron vivia no EasyPanel antigo, **desligar lá**.
2. **Webhook da Cora:**
   - Mesmo domínio → **nada a fazer**, a Cora já avisa no endereço certo.
   - Domínio novo → cadastrar o novo com
     `node scripts/cora-registrar-webhook.mjs https://<novo>/api/webhooks/cora`
     e **excluir o antigo** no painel da Cora (senão ela avisa nos dois).
3. **Backup do escritório:** em `backup.config.json`, trocar `site_url` para o
   endereço novo e rodar:
   ```bash
   node scripts/backup.mjs --conferir
   ```
   Tem que dar **"Tudo certo. Pode agendar."**
4. **Supabase Auth** (só se o domínio mudou): em Authentication → URL
   Configuration, trocar o **Site URL** para o endereço novo.
5. **Backup do volume no EasyPanel novo:** se o EasyPanel novo agenda backup
   de volume para fora (S3, Backblaze), vale ligar — é uma segunda cópia além
   do PC do escritório.

---

## Fase 5 — Conferência

No endereço oficial, já no servidor novo:

- [ ] Login de cada perfil: admin, financeiro, visualizador, técnico,
      vaqueiro, prefeitura — cada um cai na sua tela
- [ ] Uma foto **antiga** de Patrimônio abre
- [ ] Uma foto **nova** sobe e aparece (e pesa centenas de kB, não MB)
- [ ] Anexo de Contas (PDF) abre
- [ ] Foto de animal abre na lista e na ficha
- [ ] Técnico manda foto em `/tecnico`; vaqueiro manda foto do bezerro
- [ ] Link de foto aberto **deslogado** dá 401
- [ ] Assinar um PDF com certificado digital (prova que o cofre abriu — ou
      seja, `CERTIFICADOS_CHAVE` / `SUPABASE_SERVICE_ROLE_KEY` estão certas)
- [ ] Aviso no celular chega (prova que as chaves VAPID são as mesmas)
- [ ] Aluguéis → **"Conferir pagamentos no banco"** responde sem erro (prova
      que o certificado da Cora está certo)
- [ ] O cron do extrato rodou e trouxe lançamentos (ou chamar a rota uma vez
      à mão e ver resposta 200)
- [ ] OCR de nota fiscal em PDF lê os dados
- [ ] Medir cerca pega o GPS (só funciona com HTTPS)
- [ ] App instalado na tela inicial do celular abre normalmente
- [ ] `node scripts/backup.mjs` no escritório termina com `Resultado: OK`

---

## Fase 6 — Desligar o antigo (por último)

Deixe o servidor antigo **parado, mas existindo, por 2 semanas**. Antes de
apagar:

- O backup do escritório está rodando todo dia contra o servidor novo
  (`scripts/backup.log` com `Resultado: OK`)
- Rode uma última vez o script das fotos contra o antigo (precisa ligá-lo por
  um instante) e confirme que não veio nada novo

Só então apague o serviço e, se for o caso, devolva a VM.

---

## Se der errado

Como o banco é o mesmo e nenhuma foto foi apagada em lugar nenhum, voltar é
curto:

1. **Ligar de novo** o serviço antigo.
2. **Apontar o DNS de volta** para `170.0.124.7`.
3. Fotos que tenham subido no servidor novo nesse meio-tempo ficam só lá —
   dá para trazê-las com o mesmo script, rodado ao contrário (no antigo,
   apontando para o novo).

O banco não precisa de nada: nunca saiu do Supabase.

---

## Próximos passos

- [ ] Responder as 4 perguntas de "Antes de começar"
- [ ] Escrever `scripts/puxar-fotos-do-servidor-antigo.mjs` e incluí-lo no
      `Dockerfile` (como já é feito com `baixar-fotos-no-servidor.mjs`),
      publicar, e só então seguir para a Fase 1
- [ ] Marcar a data da virada
