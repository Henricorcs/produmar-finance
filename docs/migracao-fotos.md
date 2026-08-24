# Tirando as fotos do Supabase

Roteiro da migração do Storage do Supabase para o disco do servidor (EasyPanel).

## Por que

Em agosto de 2026 o Storage do Supabase bateu **121% do plano gratuito**: 446
arquivos somando **1.352 MB** para um limite de 1 GB.

O banco de dados, no mesmo dia, estava em **7%** (36 MB de 500 MB). Ou seja: o
problema nunca foi o banco — foi foto de celular subindo sem ser encolhida, a
uma média de **3 MB por arquivo**.

De onde vinha o peso:

| Pasta | Arquivos | Tamanho |
|---|---:|---:|
| `tools` (Patrimônio) | 243 | 910,5 MB |
| `animals` | 52 | 208,3 MB |
| `service_orders` | 65 | 175,5 MB |
| `tool-loans` | 11 | 32,1 MB |
| anexos de Contas | 69 | 23,5 MB |
| `loans` | 6 | 2,1 MB |

**O banco continua no Supabase.** Com 36 MB ele cabe no plano gratuito por
anos. Esta migração é só dos arquivos.

## O que mudou no código

1. **`lib/comprimir-imagem.ts`** — encolhe a foto no próprio celular antes de
   subir (1600px, qualidade 80%). Uma foto de 8,7 MB vira 442 kB. Além de
   ocupar menos, o envio fica muito mais rápido no 4G do campo. PDF e XML de
   nota fiscal passam intactos.

2. **`lib/storage.ts`** — grava e lê os arquivos numa pasta do servidor, no
   lugar do `supabase.storage`. Mesma forma de uso, para a troca nas telas ser
   mecânica.

3. **`app/api/arquivo/[...caminho]/route.ts`** — entrega o arquivo para quem
   está logado, substituindo a URL assinada do Supabase.

> ⚠️ **Cuidado ao mexer no `middleware.ts`.** O matcher dele tira do caminho
> tudo que termina em `.jpg`, `.png` e afins, para os ícones do PWA carregarem
> sem sessão. Como quase todo arquivo da rota termina em `.jpg`, **o middleware
> não roda nessas URLs** — por isso a rota confere o login ela mesma. Se essa
> conferência sair, as fotos da empresa ficam abertas para qualquer um com o
> link.

---

## Passo a passo

### 1. Criar o volume no EasyPanel

No serviço do app, aba **Volumes** (ou *Mounts*), adicione um volume:

- **Tipo:** Volume
- **Nome:** `storage`
- **Mount path:** `/data/attachments`

O mount path é o que importa: é onde o container enxerga a pasta. O volume vive
fora do container, então **o próximo deploy não leva as fotos junto**.

### 2. Variáveis de ambiente

**Nada a fazer.** O `STORAGE_DIR=/data/attachments` já vem definido no
Dockerfile, casando com o mount path do passo 1.

A leitura de reserva no Supabase (procura no disco, se não achar busca lá)
**já vem ligada de fábrica** — é o que permite virar a chave sem nenhuma foto
sumir enquanto a cópia não termina. Ela só é desligada no passo 7.

As três variáveis do Supabase continuam onde estão — o banco não mudou.

> Se você publicar uma versão nova antes de terminar a migração, não quebra
> nada: o sistema continua lendo tudo do Supabase, como antes.

### 3. Guardar a cópia de segurança (no seu PC)

Este passo **não** é o que abastece o servidor — é só a sua cópia de segurança,
para o caso de algo dar errado lá na frente. O servidor se vira sozinho no
passo 5.

```bash
node scripts/migrar-fotos.mjs
```

Baixa os 446 arquivos para `./fotos-migradas`, encolhendo as fotos na passagem
(1,35 GB viram uns 130~150 MB). O `sharp`, que faz a compressão, já está
instalado.

**Pode rodar quantas vezes quiser**: o que já está baixado é pulado. Se a
internet cair no meio, chame de novo que ele continua de onde parou.

Quando terminar, copie a pasta `fotos-migradas` para um HD externo ou pendrive.
São as fotos originais da empresa.

O script **não apaga nada** no Supabase.

### 4. Publicar

Faça o deploy pelo botão **Implantar**. Isso leva duas coisas necessárias para
o passo seguinte: o ajuste automático de permissão do volume e o script que
roda dentro do contêiner.

> **Por que a permissão se resolve sozinha agora:** o volume é uma pasta do host
> e o Docker a entrega pertencendo ao root, enquanto o site roda como `nextjs`
> (uid 1001) — ele leria as fotos mas não conseguiria gravar as novas. A partida
> do contêiner passou a acertar o dono da pasta e rebaixar para o usuário comum
> na mesma linha (`docker-entrypoint.sh`). O site nunca chega a rodar como root.

### 3. Baixar os arquivos do Supabase

Na sua máquina, na pasta do projeto:

```bash
npm i -D sharp
```

```bash
node scripts/migrar-fotos.mjs
```

Baixa os 446 arquivos para `./fotos-migradas`, encolhendo as fotos na passagem
(1,35 GB devem virar uns 130~150 MB). Pode levar um tempo.

**Pode rodar quantas vezes quiser**: o que já está baixado é pulado. Se a
internet cair no meio, chame de novo que ele continua de onde parou.

O script **não apaga nada** no Supabase — de propósito. Até você conferir tudo,
o bucket lá é a sua rede de segurança.

Para só ver o tamanho sem baixar:

```bash
node scripts/migrar-fotos.mjs --so-listar
```

### 4. Guardar a cópia de segurança

Antes de enviar para o servidor, copie a pasta `fotos-migradas` para um HD
externo ou pendrive. São as fotos originais da empresa e a compressão é
irreversível.

### 5. O servidor busca as fotos sozinho

**Sem SSH, sem enviar 1,3 GB do seu PC.** O contêiner puxa direto do Supabase,
que é muito mais rápido (servidor falando com servidor) e evita o trabalho de
copiar arquivo para dentro da máquina.

No EasyPanel, serviço **financa**, clique no ícone **`>_`** (terminal) na barra
de cima. Vai abrir um terminal dentro do contêiner. Cole:

```bash
node scripts/baixar-fotos-no-servidor.mjs
```

Ele lista os 446 arquivos, baixa um a um e mostra o progresso. A primeira coisa
que faz é testar se consegue gravar — se a permissão estiver errada, ele para
logo no começo e avisa, em vez de descobrir depois de baixar 1,3 GB.

**Pode rodar quantas vezes quiser**: o que já está no disco é pulado. Se cair no
meio, chame de novo que continua de onde parou.

Para só conferir a lista, sem baixar:

```bash
node scripts/baixar-fotos-no-servidor.mjs --so-listar
```

> As fotos vão para o servidor **do tamanho original**, sem encolher — a
> compressão exige uma biblioteca que não vale a pena carregar na imagem por
> causa de uma única execução. São 1,35 GB em disco, o que não é problema (disco
> não tem cota). As fotos **novas** já sobem encolhidas, porque isso acontece no
> celular. Se um dia quiser encolher as antigas também, dá para subir a pasta
> `fotos-migradas` do passo 3, que já está comprimida.

### 6. Conferir

Abra o site e confira, uma por uma:

- [ ] Uma foto **antiga** de Patrimônio abre (veio do disco)
- [ ] Uma foto **nova** sobe e aparece (gravou no disco)
- [ ] Comprovante de OS abre
- [ ] Anexo de Contas (PDF) abre
- [ ] Foto de animal abre na lista e na ficha
- [ ] O técnico consegue mandar foto em `/tecnico`
- [ ] O vaqueiro consegue mandar foto do bezerro
- [ ] Um usuário **deslogado** que receba o link de uma foto leva 401

Confira também o tamanho de uma foto nova: tem que estar na casa das centenas
de kB, não dos megabytes.

### 7. Desligar a leitura de reserva

Depois de tudo conferido, acrescente:

```
STORAGE_FALLBACK_SUPABASE=0
```

A partir daí o sistema só olha o disco. Se alguma foto ficou para trás, ela
some da tela — por isso este passo vem **depois** da conferência, não antes. Se
sumir alguma, tire o `=0` e ela volta na hora.

### 8. Limpar o Supabase (por último)

Só quando o sistema estiver rodando há alguns dias no disco, e com a cópia de
segurança guardada, apague o bucket `attachments` pelo painel do Supabase. O
uso volta para perto de zero e o aviso de 121% some.

**Não pule a espera.** Enquanto o bucket existir, dá para voltar atrás.

---

## Backup: agora é com você

Esta é a parte que a migração custa.

O Supabase fazia backup dos arquivos sozinho. **A partir do passo 8, ninguém
mais faz.** Disco queimado sem backup = as fotos da empresa acabaram. E o
servidor é uma VM no VMware, então vale lembrar que HD de VM morre igual a HD
de máquina física.

Na mesma tela onde você criou o volume tem o botão **"Criar Backup de Volume"**.
Comece por ele: veja se dá para agendar (diário) e para onde ele consegue
mandar a cópia — se aceitar um destino externo tipo S3 ou Backblaze, resolve
tudo sem você precisar montar nada na mão.

**Backup no mesmo servidor não é backup** — se a máquina morrer, morre junto.
A cópia precisa sair de lá: outro servidor, um serviço de nuvem, ou até um PC
do escritório.

Duas coisas que valem mais que a rotina em si:

- **Teste restaurar.** Pegue um backup, abra num canto e confira que as fotos
  estão lá. Backup que nunca foi restaurado não conta como backup.
- **A pasta `fotos-migradas` do passo 3 já é uma cópia completa**, comprimida e
  fora do servidor. Guarde ela num HD externo enquanto a rotina automática não
  estiver de pé — é a sua rede de segurança nesse meio-tempo.

---

## Se der errado

Enquanto o bucket do Supabase existir, o caminho de volta é curto:

1. Tire o `STORAGE_FALLBACK_SUPABASE=0` — o sistema volta a ler de lá na hora.
2. Se precisar reverter o código, o commit desta migração é isolado; um
   `git revert` devolve o `supabase.storage` em todas as telas.
