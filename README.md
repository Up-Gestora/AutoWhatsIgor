# AutoWhats

Plataforma SaaS para automação de atendimento no WhatsApp com IA.

## Visão geral

O AutoWhats conecta o WhatsApp da empresa, organiza conversas em CRM e permite respostas automáticas com IA, incluindo regras de follow-up, classificação de leads/clientes e operação com agenda/transmissão.

O repositório tem dois blocos principais:

- Frontend (Next.js): raiz do projeto.
- Backend B (Fastify + Baileys + Redis + Postgres): `backend-b/`.

## Arquitetura (resumo)

```text
AutoWhats/
├─ app/                  # Rotas e páginas Next.js (App Router)
├─ components/           # UI e painéis do dashboard
├─ lib/                  # Helpers (Firebase, backend URL, i18n, etc.)
├─ backend-b/            # Backend de WhatsApp + IA
│  ├─ src/
│  ├─ .env.example
│  ├─ ARCHITECTURE.md
│  └─ RUNBOOK.md
└─ README.md
```

## Stack principal

- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- Backend: Fastify, TypeScript, Baileys, Redis, PostgreSQL.
- Infra: Firebase (Auth/Firestore/Storage), Vercel (frontend), Railway (backend).

## Pré-requisitos

- Node.js `>= 20.9.0`
- npm
- Projeto Firebase configurado
- Banco PostgreSQL
- Redis

## Rodando localmente

### 1) Instalar dependências

```bash
# na raiz (frontend)
npm install

# backend
cd backend-b
npm install
```

### 2) Configurar variáveis de ambiente

#### Frontend (`.env.local` na raiz)

Variáveis mínimas para login + integração com backend:

```env
# Firebase Web SDK
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

# Firebase Admin (JSON em linha única, com \n na private key)
FIREBASE_SERVICE_ACCOUNT={"projectId":"...","clientEmail":"...","privateKey":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"}
FIREBASE_STORAGE_BUCKET=

# Comunicação com backend-b
NEXT_PUBLIC_BACKEND_URL=http://localhost:3002
BACKEND_URL=http://localhost:3002
BACKEND_ADMIN_KEY=defina_o_mesmo_valor_do_ADMIN_API_KEY_do_backend
```

Variáveis opcionais (analytics/ads e afins):

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_GA_MEASUREMENT_ID=
NEXT_PUBLIC_GOOGLE_ADS_TAG_ID=
NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_SEND_TO=
NEXT_PUBLIC_GOOGLE_ADS_INSCRICAO_SEND_TO=
GA_MP_MEASUREMENT_ID=
GA_MP_API_SECRET=
```

#### Backend (`backend-b/.env`)

1. Copie o arquivo base:

```bash
cd backend-b
cp .env.example .env
```

No Windows (PowerShell):

```powershell
Copy-Item .env.example .env
```

2. Preencha pelo menos:

```env
PORT=3002
ALLOWED_ORIGINS=http://localhost:3000

ADMIN_API_KEY=
AUTH_ENCRYPTION_KEY=chave_com_no_minimo_32_caracteres

DATABASE_URL=postgres://...
REDIS_URL=redis://...

FIREBASE_SERVICE_ACCOUNT={"projectId":"...","clientEmail":"...","privateKey":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"}
```

Para IA responder:

```env
AI_ENABLED=true
AI_PROVIDER=google
GEMINI_API_KEY=
```

ou

```env
AI_ENABLED=true
AI_PROVIDER=openai
OPENAI_API_KEY=
```

### 3) Subir os serviços (2 terminais)

Terminal 1 (frontend):

```bash
npm run dev
```

Terminal 2 (backend):

```bash
cd backend-b
npm run dev
```

URLs locais:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3002`

## Scripts úteis

### Frontend (raiz)

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run tests
```

### Backend (`backend-b/`)

```bash
npm run dev
npm run build
npm run start
npm run test
npm run test:i18n
```

## Deploy (resumo)

### Frontend (Vercel)

- Conecte o repositório no Vercel.
- Configure as variáveis do `.env.local` no projeto Vercel.
- Faça redeploy.

### Backend (Railway)

- Suba `backend-b/` no Railway.
- Configure envs do backend (`ADMIN_API_KEY`, `AUTH_ENCRYPTION_KEY`, `DATABASE_URL`, `REDIS_URL`, `FIREBASE_SERVICE_ACCOUNT`, provider de IA).
- Copie a URL pública do Railway e use no Vercel (`BACKEND_URL` e `NEXT_PUBLIC_BACKEND_URL`).

### Firebase

- Habilite Auth e Firestore/Storage no seu projeto.
- Gere Service Account (JSON) e use em `FIREBASE_SERVICE_ACCOUNT`.
- Confirme que `NEXT_PUBLIC_FIREBASE_*` apontam para o projeto correto.

## Checklist pós-deploy

- Login funciona em produção.
- Conexão WhatsApp via QR abre e conecta.
- Conversas carregam.
- IA responde (com crédito/assinatura ativos quando aplicável).
- Botões de IA global e IA por conversa refletem corretamente.

## Troubleshooting rápido

### "Configuração do Firebase ausente. Verifique seu arquivo .env.local"

- Falta `NEXT_PUBLIC_FIREBASE_API_KEY` (ou outras `NEXT_PUBLIC_FIREBASE_*`) no ambiente atual.
- Em produção (Vercel), confira as variáveis e faça redeploy.

### Erro em `AUTH_ENCRYPTION_KEY`

- A chave precisa ter no mínimo 32 caracteres.
- Atualize no Railway e redeploy do backend.

### IA não responde

Verifique:

- `AI_ENABLED=true`
- Provider configurado (`AI_PROVIDER`) + chave (`GEMINI_API_KEY` ou `OPENAI_API_KEY`)
- Sessão conectada
- Créditos/assinatura ativos
- `BACKEND_URL` e `BACKEND_ADMIN_KEY` corretos no frontend

### Frontend usa banco/projeto antigo

- Alguma `NEXT_PUBLIC_FIREBASE_*` ou `FIREBASE_SERVICE_ACCOUNT` ainda aponta para o projeto antigo.
- Revise envs no Vercel e no `.env.local`.

## Documentação complementar

- `backend-b/ARCHITECTURE.md`
- `backend-b/RUNBOOK.md`
- `BACKLOG-ROTA-B.md`
- `PLANO-MIGRACAO-URGENTE-IA.md`
- `PLANO-STAGING.md`

## Segurança

- Não commite segredos (`.env`, service account, API keys).
- Use apenas variáveis de ambiente no ambiente local e em deploy.

## Licença

Projeto proprietário. Todos os direitos reservados.


Deploy Matheus 23/03 com mudanças Davi