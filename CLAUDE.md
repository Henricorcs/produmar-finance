# Instruções do projeto

## ⚠️ Regra principal: sempre commitar e pushar

**SEMPRE que terminar uma tarefa, faça `git commit` e `git push` — sem perguntar.**

Isso é uma autorização permanente dada pelo dono do repositório. Não pare pra pedir
confirmação de commit ou push: terminou a tarefa, commita e pusha.

Como fazer:

```bash
git add -A
git commit -m "tipo(escopo): descrição em português"
git push
```

Detalhes:

- **Mensagens de commit em português**, no padrão que o repositório já usa:
  `feat(escopo):`, `fix(escopo):`, `perf:`, `chore:` — descrição curta e em linguagem
  do dia a dia, explicando o efeito prático pra quem usa o sistema
  (ex: `feat(diaristas): meia diária conta amarelo e vale metade`).
- **Antes de `git add -A`**, rode `git status` e confira o que está entrando.
  Nunca commitar `.env.local`, `backup.config.json` ou qualquer arquivo com senha/chave
  (o `.gitignore` já cobre esses, mas confira mesmo assim).
- Se o push for rejeitado por divergência, faça `git pull --rebase` e pushe de novo.

---

## O que é este projeto

Sistema interno de gestão da operação — **não é só financeiro**, apesar do que diz o
`README.md` (que está desatualizado, descrevendo um "ILNET Finance").

As rotas em `app/(app)/` cobrem a operação inteira: `animais`, `diaristas`, `obras`,
`almoxarifado`, `estoque`, `ferramentas`, `vaqueiro`, `tecnico`, `operacoes`,
`emprestimos`, `notas-fiscais`, `contas`, `relatorios`, entre outras.

**Stack:** Next.js 14 (App Router) · TypeScript · Supabase (Auth + Postgres + Storage +
RLS) · Tailwind · Recharts · PWA.

---

## Ambiente local

- **Node.js não está instalado nesta máquina.** Ou seja: `npm install`, `npm run dev`,
  build e testes **não rodam aqui**. Alterações de código não podem ser validadas
  localmente — escreva com cuidado extra, já que o TypeScript não vai te avisar.
- **`.env.local` não existe** (só o `.env.example`). Faltam as chaves do Supabase.

Se o Node for instalado depois, apague esta seção.

---

## Convenções

- Interface, mensagens de commit e textos de código: **português**.
- Formatação de dinheiro e datas: usar os helpers de `lib/utils.ts`.
- Tipos do banco ficam em `lib/types.ts`.
- Clients do Supabase (browser / server / middleware) ficam em `lib/supabase/`.
- Papéis de acesso (RLS): `admin`, `financeiro`, `visualizador` — regras definidas em
  `supabase/schema.sql`.
