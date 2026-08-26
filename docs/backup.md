# Backup automático

Duas cópias diárias, saindo do PC do escritório: **o banco** (que vive no
Supabase) e **as fotos** (que vivem no servidor).

## O que está protegido, e por quê

| | Onde mora | Tamanho | Quem fazia backup antes |
|---|---|---|---|
| **Banco** — OS, financeiro, empréstimos, animais, diaristas | Supabase | ~3 MB | **ninguém** |
| **Fotos** — comprovantes, patrimônio, animais | servidor | 1,35 GB | o Supabase (até saírem de lá) |

O banco é o mais valioso e era o menos protegido: o plano gratuito do Supabase
não inclui backup automático. São 2.225 linhas, incluindo 136 OS e 248
lançamentos financeiros.

**Por que no PC do escritório:** backup precisa estar em outra máquina que não
a original. O EasyPanel tem backup de volume agendado, mas só grava no disco
da própria VM — se o disco morrer, morrem os dois. Serve como "desfazer", não
como backup. (E cuidado: 1,35 GB por dia no mesmo disco enche a VM rápido.)

**O espelho das fotos nunca apaga nada.** Se alguém excluir uma foto no
sistema, a cópia aqui continua. É de propósito: backup que apaga junto não
protege de exclusão por engano.

---

## Montando (uma vez só)

### 1. Criar a senha do backup

Ela deixa o PC buscar os arquivos no servidor. Gere no seu terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie o resultado. **Não mande esse valor para ninguém** — quem tiver ele
consegue baixar todas as fotos da empresa.

### 2. Colocar a senha no servidor

No EasyPanel, serviço **financa**, aba **Ambiente**, acrescente:

```
BACKUP_TOKEN=cole-aqui-o-valor-gerado
```

Salve e clique em **Implantar**.

> A rota de backup **só existe** quando essa variável está definida com 32
> caracteres ou mais. Sem ela, o endereço responde 404 como qualquer página
> inexistente — quem não usa backup não fica com essa porta aberta.

### 3. Colocar a mesma senha no PC

Abra `backup.config.json`, na pasta do projeto. O Supabase já está
preenchido; falta o campo:

```json
"backup_token": "cole-aqui-o-mesmo-valor"
```

Confira também o `destino`. O padrão é `C:/Backup-ILNET`. **Se você tiver um HD
externo, aponte para ele** — quanto mais longe do PC, melhor.

Esse arquivo tem senha dentro e **não entra no git**.

### 4. Conferir antes de agendar

```bash
node scripts/backup.mjs --conferir
```

Não copia nada: só testa se o Supabase responde, se o servidor aceita a senha e
se dá para gravar no destino. Tem que dar **"Tudo certo. Pode agendar."** — se
alguma linha falhar, ela diz o que fazer.

### 5. Primeira cópia (a demorada)

```bash
node scripts/backup.mjs
```

Baixa os 1,35 GB de fotos. Depois dessa, as seguintes levam segundos, porque só
o que é novo é copiado.

### 6. Agendar no Windows

Abra o **Agendador de Tarefas** (tecla Windows, digite "agendador").

1. **Criar Tarefa** (não "Criar Tarefa Básica" — a completa tem as opções que
   importam)
2. Aba **Geral**: nome `Backup ILNET`. Marque **"Executar estando o usuário
   conectado ou não"** e **"Executar com privilégios mais altos"**
3. Aba **Disparadores** → **Novo**: Diariamente, no horário que quiser (fora do
   expediente, tipo 12h ou 20h). Marque **"Repetir a cada"** se quiser mais de
   uma vez por dia
4. Aba **Ações** → **Novo**:
   - Ação: `Iniciar um programa`
   - Programa: o caminho completo do `.bat`, por exemplo
     `C:\Users\Latitude 3420\Documents\pc novo\files\ilnet-finance\scripts\backup.bat`
5. Aba **Condições**: **desmarque** "Iniciar a tarefa somente se o computador
   estiver ligado na energia" — senão em notebook no cabo de bateria não roda
6. **OK**. Ele pede a senha do Windows para poder rodar sem você logado

Para testar: clique com o botão direito na tarefa → **Executar**.

---

## Conferindo se está funcionando

O registro de cada execução fica em `scripts/backup.log`:

```bash
tail -30 scripts/backup.log
```

Toda execução grava início, o que copiou e `Resultado: OK` ou `FALHOU`.

**Olhe esse arquivo uma vez por mês.** Backup que ninguém confere é backup que
parou em silêncio há seis meses e ninguém percebeu.

## Testando a restauração

Backup que nunca foi restaurado não conta como backup. A cada alguns meses:

- **Fotos:** abra a pasta `fotos` do destino e veja se uma imagem abre.
- **Banco:** abra o `banco-AAAA-MM-DD.json` mais recente e confira se os
  totais fazem sentido (número de OS, de lançamentos).

## Como seria restaurar de verdade

**As fotos** são cópia fiel: é só devolver a pasta para `/data/attachments` no
servidor.

**O banco** tem duas metades, e as duas estão guardadas:

- A **estrutura** (tabelas, regras de acesso, funções) está em
  `supabase/migrations/` — versionada no git.
- Os **dados** estão no JSON.

Restaurando: rode as migrations numa base limpa e depois carregue os dados do
JSON.

> ⚠️ **As senhas dos usuários não estão no backup.** O Supabase não entrega
> senha nenhuma, nem para o dono do projeto — é assim que tem que ser. Numa
> restauração, os 15 usuários são recriados (os emails e os perfis estão no
> JSON) e cada um define a senha de novo.

## Limites que você deve conhecer

- **O PC precisa estar ligado** no horário marcado. Se ficar desligado, aquele
  dia não tem cópia — e o log não vai registrar nada, porque nada rodou.
- **A cópia fica na mesma sala que o escritório.** Protege contra o servidor
  morrer, não contra incêndio ou roubo no local. Um HD externo que às vezes vá
  para outro endereço, ou uma pasta de nuvem apontada como `destino`, resolve
  isso.
- **O histórico do banco é de 30 dias** (ajustável em
  `dias_de_historico_do_banco`). As fotos não têm limite: o espelho só cresce.
