# Plano de Staging (AutoWhats)

Objetivo: ter um ambiente de staging 100% isolado (outro frontend, outro backend, outro Postgres/Redis, e outro Firebase/Firestore) para receber deploys pequenos ao longo da semana. Quando estiver OK, promover 1x/semana do staging para producao.

Este documento foi baseado no codigo atual do repo (Next.js na raiz + Backend B em `backend-b/`).

---

## 1) O Que O Codigo Mostra Hoje (estado atual)

### 1.1 Repo e deploy
- Frontend: Next.js na raiz.
  - Indicacao de Vercel: existe `.vercel/project.json` com o projeto `auto-whats`.
- Backend novo: `backend-b/` (Fastify + Baileys + Redis/Postgres).
  - Indicacao de Railway: existe `backend-b/railway.json`.

### 1.2 Dependencias obrigatorias do backend-b
O `backend-b` nao sobe sem:
- Postgres: `DATABASE_URL` e usada em `backend-b/src/storage/postgres.ts` (erro se faltar).
- Redis: `REDIS_URL` e usada em `backend-b/src/storage/redis.ts` (erro se faltar).

### 1.3 "Banco de dados" hoje nao e so Postgres/Redis
O frontend usa Firebase/Firestore diretamente no client em varios pontos do app (ex.: agendas, usuarios, etc). Entao "100% isolado" implica:
- Outro Firebase project (Auth + Firestore + Storage) para staging.
- Outro Postgres/Redis para staging (Railway).

### 1.4 Risco atual: fallback para backend de producao no client
Se `NEXT_PUBLIC_BACKEND_URL` nao estiver setada, ha paginas client com fallback hardcoded para producao:
- `app/dashboard/conexoes/page.tsx`
- `components/admin/sessions-dashboard.tsx`

Isso e perigoso em staging, porque um env faltando pode fazer o staging falar com o backend de producao.

---

## 2) Fluxo De Branch/Deploy (staging continuo, producao semanal)

Proposta simples e efetiva:
1. Branch longa `staging`.
2. Regra: PRs do dia a dia entram em `staging` (deploy continuo no staging).
3. 1x/semana: PR de promocao `staging -> main` (ou a branch de producao que voce usar).
4. Protecao de branch:
   - `main` sem push direto (apenas PR).
   - `staging` com PR (opcional), mas geralmente mais flexivel.

Resultado: staging recebe varias atualizacoes pequenas por semana; producao recebe 1 update semanal (o mesmo commit validado no staging).

---

## 3) Primeiro Passo Obrigatorio: Rodar Local Sem Instalar Postgres/Redis No PC

O maior problema atual e testar direto em deploy. A solucao pragmatica e rodar Postgres+Redis local via Docker.

### 3.1 Infra local (Docker Compose)
1. Instale Docker Desktop.
2. Adicione um `docker-compose.yml` no repo com:
   - Postgres (porta 5432)
   - Redis (porta 6379)
3. Crie `backend-b/.env` a partir de `backend-b/.env.example` e ajuste:
   - `PORT=3002`
   - `DATABASE_URL=postgres://USER:PASS@localhost:5432/autowhats_b`
   - `REDIS_URL=redis://localhost:6379`
   - `AUTH_ENCRYPTION_KEY=<32+ chars>`
   - `ADMIN_API_KEY=<staging/local admin key>`
   - `ALLOWED_ORIGINS=http://localhost:3000`

### 3.2 Teste local sem WhatsApp real (recomendado para dev)
O backend-b ja suporta driver "fake":
- `SESSION_DRIVER=noop`

Isso permite exercitar:
- API/health
- filas/workers
- endpoints admin
- fluxo de IA
sem depender de Baileys/WhatsApp real.

### 3.3 Frontend local
Crie/ajuste `.env.local` na raiz com:
- `NEXT_PUBLIC_BACKEND_URL=http://localhost:3002`
- `BACKEND_URL=http://localhost:3002` (para rotas server-side da API do Next, quando aplicavel)
- Firebase (seu projeto local/staging). Nao commitar secrets.

---

## 4) Staging 100% Isolado (Firebase + Backend-b + Postgres/Redis + Frontend)

### 4.1 Firebase (staging)
Como o app usa Firebase no client, staging precisa de outro projeto Firebase.

Passos:
1. Crie um novo Firebase project (ex.: `autowhats-staging`).
2. Habilite os mesmos providers de Auth do prod.
3. Crie Firestore e Storage (se o seu fluxo usa).
4. Publique as mesmas rules no staging:
   - `firestore.rules`
   - `storage.rules`
5. Gere um Service Account do Firebase staging (JSON).

Variaveis no frontend staging (Vercel):
- `NEXT_PUBLIC_FIREBASE_API_KEY=...`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID=...`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...`
- `NEXT_PUBLIC_FIREBASE_APP_ID=...`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...`

Variaveis server-side (Next e/ou backend-b, quando usar Firebase Admin):
- `FIREBASE_SERVICE_ACCOUNT={...json...}`

Observacao: o `backend-b` usa Firebase Admin para agenda (ver `backend-b/src/firebase/admin.ts` e `backend-b/src/agenda/firestoreAgendaStore.ts`). Se staging usar agenda, ele precisa apontar para o Firebase staging.

### 4.2 Backend-b (staging) no Railway
Crie um ambiente/stacks separado no Railway.

Passos:
1. Crie um projeto Railway "staging" (ou um projeto separado so para staging).
2. Crie um service apontando para `backend-b/` (Railway usa `backend-b/railway.json`).
3. Adicione Postgres (staging) e Redis (staging).
4. Adicione Volume e monte em `/data` para persistir sessoes/cache (evita desconectar em restarts).
5. Configure as env vars do backend-b staging (exemplos):
   - `NODE_ENV=production`
   - `PORT=3002` (ou a porta do Railway)
   - `DATABASE_URL=...` (Postgres staging)
   - `REDIS_URL=...` (Redis staging)
   - `ADMIN_API_KEY=<exclusivo do staging>`
   - `AUTH_ENCRYPTION_KEY=<exclusivo do staging>`
   - `ALLOWED_ORIGINS=https://<seu-vercel-staging>.vercel.app`
   - `SESSIONS_DIR=/data/sessions-b`
   - `AUTH_CACHE_DIR=/data/sessions-b/auth-cache` (opcional; default ja cobre via `SESSIONS_DIR`)
   - `APP_PUBLIC_URL=https://<seu-vercel-staging>.vercel.app` (importante para billing/stripe; ver `backend-b/src/billing/service.ts`)
   - Stripe staging (se for testar billing): `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...`, `STRIPE_PRICE_ID_*` de teste
   - AI keys (se for testar IA): `OPENAI_API_KEY=...` e/ou `GEMINI_API_KEY=...`
6. Decida o WhatsApp no staging:
   - Opcao A (segura para QA): `SESSION_DRIVER=noop`
   - Opcao B (testes reais): `SESSION_DRIVER=baileys` com um numero de teste dedicado (nao usar numero de cliente/producao).

Smoke checks no staging:
- `GET /health`
- `GET /health/worker`
- Socket.IO do frontend conectando (WS) e recebendo eventos (QR/status).

### 4.3 Frontend (staging) no Vercel
Abordagem recomendada: criar um segundo projeto Vercel para staging.

Passos:
1. Importe o mesmo repo no Vercel e crie `auto-whats-staging`.
2. Configure o "Production Branch" desse projeto como `staging` (nao `main`).
3. Configure env vars do frontend staging:
   - `NEXT_PUBLIC_BACKEND_URL=https://<backend-b-staging>.up.railway.app`
   - `BACKEND_URL=https://<backend-b-staging>.up.railway.app` (para rotas server-side do Next)
   - `BACKEND_ADMIN_KEY=<mesmo valor de ADMIN_API_KEY do backend-b staging>`
   - `FIREBASE_SERVICE_ACCOUNT=<service account do firebase staging>`
   - `NEXT_PUBLIC_FIREBASE_*` (tudo do firebase staging)

Muito importante:
- Garanta que `NEXT_PUBLIC_BACKEND_URL` esteja setada no staging. Caso contrario, paginas como `app/dashboard/conexoes/page.tsx` podem cair no fallback de producao.

---

## 5) Promocao Semanal Do Staging Para Producao

Rotina sugerida:
1. Durante a semana: merges em `staging` com validacao no ambiente staging.
2. Dia do release (1x/semana):
   - Freeze temporario no `staging` (evitar merges durante release).
   - Rode checks minimos:
     - Frontend: `npm run lint` (e idealmente `npm run test:e2e` em smoke)
     - Backend-b: `cd backend-b && npm run test`
     - Smoke manual no staging: login, conexoes (socket), fluxos principais.
   - Abra PR `staging -> main`.
3. Merge no `main` dispara deploy de producao (Vercel prod + Railway prod) com o mesmo commit validado no staging.

Rollback (pratico):
- Vercel: redeploy do deployment anterior.
- Railway: rollback para deployment anterior.

---

## 6) Recomendacoes Importantes (para staging realmente proteger prod)

### 6.1 Remover/neutralizar fallback para backend de producao
Hoje existe fallback hardcoded para `https://backend-b-production.up.railway.app` em paginas client.
Recomendacao:
- Remover fallback de producao do client, ou
- Condicionar por `NEXT_PUBLIC_APP_ENV`, ou
- Fazer o app falhar de forma segura se `NEXT_PUBLIC_BACKEND_URL` estiver ausente.

Arquivos a revisar:
- `app/dashboard/conexoes/page.tsx`
- `components/admin/sessions-dashboard.tsx`
- `lib/backendUrl.ts`

### 6.2 Banner de ambiente (anti-erro humano)
Adicionar `NEXT_PUBLIC_APP_ENV=staging|production` e mostrar um banner grande no staging.

### 6.3 Migracoes de schema no Postgres
No `backend-b`, muitas tabelas sao criadas via `CREATE TABLE IF NOT EXISTS` nos `init()` (ex.: `backend-b/src/messages/store.ts`).
Isso ajuda no bootstrap, mas nao substitui migracoes (ALTER/ADD COLUMN) quando o schema evolui.
Com clientes, isso vira risco em deploy semanal.

Recomendacao:
- Adotar migracoes (ex.: `node-pg-migrate`, `drizzle`, `prisma migrate`, etc), ou
- Criar um "schema manager" proprio com `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para evolucao segura.

### 6.4 Stripe em staging sempre no modo teste
Nunca reuse chaves/price IDs/webhooks de producao em staging.

---

## 7) Checklist Rapido (para executar nesta semana)

Local:
- [ ] Criar `docker-compose.yml` (Postgres + Redis)
- [ ] Criar `backend-b/.env` local (DATABASE_URL/REDIS_URL/ADMIN_API_KEY/AUTH_ENCRYPTION_KEY)
- [ ] Rodar `SESSION_DRIVER=noop` local e validar `/health` + `/health/worker`
- [ ] Apontar frontend local para `NEXT_PUBLIC_BACKEND_URL=http://localhost:3002`

Staging:
- [ ] Criar Firebase project de staging e configurar Auth/Firestore/Storage
- [ ] Criar Railway service staging do `backend-b/` + Postgres + Redis + Volume em `/data`
- [ ] Configurar env vars do backend-b staging (ADMIN_API_KEY/AUTH_ENCRYPTION_KEY/DATABASE_URL/REDIS_URL/ALLOWED_ORIGINS/APP_PUBLIC_URL/FIREBASE_SERVICE_ACCOUNT)
- [ ] Criar Vercel project staging com "Production Branch" = `staging`
- [ ] Configurar env vars do frontend staging (NEXT_PUBLIC_BACKEND_URL/BACKEND_URL/BACKEND_ADMIN_KEY/FIREBASE_SERVICE_ACCOUNT/NEXT_PUBLIC_FIREBASE_*)
- [ ] Smoke test no staging (login, conexoes, fluxos principais)

Governanca:
- [ ] Branch `staging` + PR semanal `staging -> main`
- [ ] Proteger `main` (sem push direto)

