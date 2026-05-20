# 💸 ILNET Finance

SaaS interno de controle financeiro da **ILNET Telecom** — dashboard, contas a pagar/receber, upload de notas fiscais (XML + PDF com OCR), importação de extratos OFX/CSV, alertas por email e PWA mobile.

![Stack](https://img.shields.io/badge/Next.js-14-black?logo=next.js) ![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript) ![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss)

---

## 📦 Stack

- **Next.js 14** (App Router, Server Components, Server Actions)
- **TypeScript**
- **Supabase** (Auth + Postgres + Storage + RLS)
- **Tailwind CSS** + paleta ILNET customizada
- **Recharts** (gráficos)
- **Resend** (envio de emails de alerta) — Fase 2
- **PWA** instalável no celular

---

## 🚀 Setup em 5 passos

### 1. Instalar dependências

```bash
npm install
```

### 2. Criar projeto Supabase

1. Acesse [supabase.com](https://supabase.com) → New Project
2. Anote: `Project URL`, `anon key` e `service_role key` (Settings → API)
3. Copie `.env.example` pra `.env.local` e preencha:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ILNET_CNPJ=00000000000000   # CNPJ real da ILNET (sem pontos/traços)
```

### 3. Rodar o schema no Supabase

No Supabase Dashboard → **SQL Editor** → New Query → cole o conteúdo de `supabase/schema.sql` → **Run**.

Isso cria todas as tabelas, views, RLS e seed inicial de categorias/centros de custo.

**Opcional — popular com dados de exemplo:** rode também `supabase/seed.sql`.

### 4. (Opcional) Desabilitar confirmação de email pra testes

No Supabase → Authentication → Providers → Email → desmarcar "Confirm email". Assim você cria o primeiro usuário sem precisar confirmar email.

### 5. Rodar localmente

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000). Crie a primeira conta na tela de login.

> 💡 O primeiro usuário cadastrado vira `financeiro`. Pra promover pra `admin`, rode no Supabase:
> ```sql
> update public.profiles set role = 'admin' where email = 'seu@email.com';
> ```

---

## 🗂 Estrutura do projeto

```
ilnet-finance/
├── app/
│   ├── (app)/              # Rotas autenticadas
│   │   ├── dashboard/      # Dashboard com KPIs, gráfico, despesas e vencimentos
│   │   ├── para-onde-foi/  # (Fase 2) Análise detalhada de despesas
│   │   ├── contas/         # (Fase 2) Contas a pagar/receber
│   │   ├── notas-fiscais/  # (Fase 3) Upload NF XML/PDF
│   │   ├── relatorios/     # (Fase 4) DRE e relatórios
│   │   └── configuracoes/  # Perfil e preferências
│   ├── login/              # Tela de login/cadastro
│   ├── auth/callback/      # Callback OAuth
│   └── layout.tsx
├── components/
│   ├── dashboard/          # KPIs, gráfico, breakdown, vencimentos
│   ├── layout/             # Topbar + tabs nav
│   └── ui/                 # Componentes base (button, input, card, label)
├── lib/
│   ├── supabase/           # Clients (browser, server, middleware)
│   ├── types.ts            # Tipos TS do banco
│   └── utils.ts            # Formatadores BRL, datas
├── supabase/
│   ├── schema.sql          # Schema completo (rodar 1x)
│   └── seed.sql            # Dados de exemplo (opcional)
└── middleware.ts           # Refresh de sessão + redirect
```

---

## 🗺 Roadmap

### ✅ Fase 1 — **Esta entrega**
- [x] Setup Next.js + TypeScript + Tailwind com paleta ILNET
- [x] Schema Supabase completo com RLS
- [x] Autenticação (login + cadastro + logout)
- [x] Dashboard com KPIs reais (saldo, receitas, despesas, a pagar)
- [x] Gráfico de fluxo de caixa últimos 6 meses
- [x] Top 5 despesas por categoria
- [x] Próximos vencimentos
- [x] PWA manifest + favicon
- [x] Configurações (perfil)

### 🚧 Fase 2 — Contas + Alertas
- [ ] CRUD completo de contas a pagar/receber
- [ ] Página "Para onde foi" detalhada com filtros (categoria, centro de custo, período)
- [ ] Importação OFX/CSV de extratos
- [ ] Configuração de alertas por usuário
- [ ] Cron job Supabase + Resend mandando emails (3/7/15 dias antes, vencidas, resumo diário)

### 🚧 Fase 3 — Notas Fiscais
- [ ] Upload de XML da NF-e (parse com `xml2js`)
- [ ] Upload de PDF com OCR via Claude API (identifica emissor/destinatário/valor)
- [ ] Auto-detecção entrada/saída comparando CNPJ com `ILNET_CNPJ`
- [ ] Vincular NF a transação automaticamente

### 🚧 Fase 4 — Relatórios
- [ ] DRE mensal/anual
- [ ] Fluxo de caixa projetado
- [ ] Export para Excel/PDF
- [ ] Conciliação bancária

---

## 🎨 Identidade visual

Paleta ILNET disponível como classes Tailwind: `ilnet-50` a `ilnet-900`.

| Token | Hex | Uso |
|-------|-----|-----|
| `ilnet-600` | `#0F62D8` | Cor principal (botões, links, accent) |
| `ilnet-700` | `#0D52BD` | Hover de botões |
| `ilnet-800` | `#0A3A8C` | Texto em destaque, headers |
| `ilnet-300` | `#6BB6FF` | Acentos claros, gráficos secundários |
| `ilnet-100` | `#E3EEFE` | Backgrounds suaves, borders |
| `ilnet-50` | `#EEF5FF` | Background da página |

Fonte: **Geist Sans** (Vercel).

---

## 🚀 Deploy

### Vercel (recomendado)

1. Push pra GitHub
2. [vercel.com](https://vercel.com) → Import Project
3. Adicione as variáveis de ambiente do `.env.local`
4. Deploy automático

### Configurar URL de redirect no Supabase

Supabase → Authentication → URL Configuration:
- Site URL: `https://seu-dominio.vercel.app`
- Redirect URLs: `https://seu-dominio.vercel.app/auth/callback`

---

## 👥 Papéis (RLS)

| Papel | Permissões |
|-------|-----------|
| `admin` | Tudo + gestão de usuários |
| `financeiro` | Criar/editar transações, contas, NFs, importações |
| `visualizador` | Somente leitura |

Permissões aplicadas via Row Level Security do Postgres (definidas em `schema.sql`).

---

## 🐛 Troubleshooting

**"Invalid login credentials"** — Confirme que o email foi confirmado (ou desabilite confirmação em Auth → Providers).

**Dashboard zerado** — Rode `supabase/seed.sql` pra popular com exemplos, ou crie a primeira transação manualmente.

**Erro de RLS** — Confirme que o usuário tem profile criado (deve ser automático via trigger). Cheque com `select * from profiles;` no SQL Editor.

---

Feito com 💙 pra ILNET Telecom — São Mateus do Maranhão.
