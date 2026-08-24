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

No mesmo serviço, aba **Environment**:

```
STORAGE_DIR=/data/attachments
```

Só essa. A leitura de reserva no Supabase (procura no disco, se não achar busca
lá) **já vem ligada de fábrica** — é o que permite virar a chave sem nenhuma
foto sumir enquanto a cópia não termina. Ela só é desligada no passo 7.

As três variáveis do Supabase continuam onde estão — o banco não mudou.

> Se você publicar uma versão nova **sem** ter feito nada disso, não quebra
> nada: o sistema continua lendo tudo do Supabase, como antes. O único
> incômodo é que as fotos novas cairiam dentro do container e sumiriam no
> deploy seguinte — e o log de partida avisa isso em letras grandes.

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

### 5. Enviar para o volume do servidor

Confirme o caminho do volume no host pelo painel do EasyPanel (costuma ser
`/etc/easypanel/projects/<projeto>/<serviço>/volumes/storage`), e envie:

```bash
scp -r fotos-migradas/* usuario@SEU_SERVIDOR:/etc/easypanel/projects/PROJETO/SERVICO/volumes/storage/
```

> ⚠️ **Permissão — o erro mais provável desta migração.** O container roda como
> o usuário `nextjs` (uid 1001), não como root. Se a pasta ficar do root, o app
> lê as fotos mas **não consegue gravar as novas**. No servidor, depois de
> enviar:
>
> ```bash
> chown -R 1001:1001 /etc/easypanel/projects/PROJETO/SERVICO/volumes/storage
> ```

### 6. Publicar e conferir

Faça o deploy e confira, uma por uma:

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
mais faz.** Disco queimado sem backup = as fotos da empresa acabaram.

Coloque uma rotina diária no servidor (`crontab -e`):

```bash
0 3 * * * tar -czf /backup/fotos-$(date +\%F).tar.gz -C /etc/easypanel/projects/PROJETO/SERVICO/volumes storage && find /backup -name 'fotos-*.tar.gz' -mtime +30 -delete
```

Isso guarda 30 dias. **Backup no mesmo servidor não é backup** — se a máquina
morrer, morre junto. Leve a cópia para fora (outro servidor, S3, Backblaze, ou
até um `rsync` para um PC do escritório).

Depois de montar, **teste restaurar**: abra o `.tar.gz` num canto e confira que
as fotos estão lá. Backup que nunca foi restaurado não conta.

---

## Se der errado

Enquanto o bucket do Supabase existir, o caminho de volta é curto:

1. Tire o `STORAGE_FALLBACK_SUPABASE=0` — o sistema volta a ler de lá na hora.
2. Se precisar reverter o código, o commit desta migração é isolado; um
   `git revert` devolve o `supabase.storage` em todas as telas.
