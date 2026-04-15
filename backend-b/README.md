# Backend B - Rota B (Baileys) README

## Objetivo
Backend isolado para conexao WhatsApp via Baileys e pipeline de mensagens/IA, com foco em estabilidade e escalabilidade.

## Estrutura
- `src/index.ts`: bootstrap da API.
- `src/server.ts`: rotas e configuracao do Fastify.
- `src/config/env.ts`: carregamento e validacao de env vars.
- `src/auth/*`: store criptografada de credenciais (Postgres + cache local).
- `src/sessions/*`: core de gerenciamento de sessoes (lock, backoff, concorrencia).
- `src/admin/*`: auditoria de chamadas admin.
- `src/messages/*`: pipeline inbound (normalizacao, dedupe, persistencia, fila).
- `src/sessions/baileysDriver.ts`: driver Baileys conectado ao SessionManager.

## Requisitos
- Node.js 18+
- npm

## Setup local
```bash
cd backend-b
npm install
cp .env.example .env
npm run dev
```

## Scripts
- `npm run dev`: servidor em modo watch.
- `npm run build`: compila para `dist/`.
- `npm start`: executa `dist/index.js`.
- `npm run clean`: remove `dist/`.
- `npm run billing:reconcile`: reconcilia assinaturas/creditos Stripe por invoices (dry-run por padrao; use `--apply` para gravar).
- `npm run billing:webhook:check`: verifica status dos endpoints Stripe e falha se algum alvo estiver desabilitado.
- `npm run test`: executa testes unitarios/integracao (node --test).
- `npm run epic11:load`: dispara harness de carga do EPIC 11.
- `npm run epic11:soak`: dispara harness de soak do EPIC 11.
- `npm run epic11:chaos`: dispara harness de chaos do EPIC 11.

## Testes de carga (EPIC 11)
Harness em `scripts/epic11Harness.ts` para load/soak/chaos via API.

Recomendado (ambiente local/sintetico):
```bash
SESSION_DRIVER=noop
NOOP_READY_DELAY_MS=50
NOOP_MESSAGE_STATUS_DELAY_MS=0
ADMIN_API_KEY=...
BACKEND_URL=http://localhost:3002
npm run epic11:load
```

Variaveis suportadas no harness:
- `SESSION_COUNT`, `DURATION_MIN`
- `MSGS_PER_MIN_MIN`, `MSGS_PER_MIN_MAX`
- `STATUS_TIMEOUT_MS`, `STATUS_POLL_MS`
- `CHAOS_STOP_INTERVAL_MIN`, `CHAOS_STOP_COUNT`, `CHAOS_RESTART_DELAY_SEC`
- `CLEANUP`, `CLEANUP_PURGE`

## Endpoints atuais
- `GET /health`
- `GET /health/worker`
- `GET /admin/diagnostics` (requer `x-admin-key`)
- `GET /admin/metrics` (requer `x-admin-key`)
- `GET /admin/ai/config/:sessionId` (requer `x-admin-key`)
- `POST /admin/ai/config/:sessionId` (requer `x-admin-key`)
- `GET /admin/auth-states/export` (requer `x-admin-key`)
- `POST /admin/auth-states/import` (requer `x-admin-key`)
- `GET /admin/sessions/:sessionId/history` (requer `x-admin-key`)
- `POST /sessions` (requer `x-admin-key`)
- `POST /sessions/:sessionId/start` (requer `x-admin-key`)
- `POST /sessions/:sessionId/stop` (requer `x-admin-key`)
- `POST /sessions/:sessionId/purge` (requer `x-admin-key`)
- `POST /sessions/:sessionId/hard-delete` (requer `x-admin-key`)
- `GET /sessions/:sessionId/status` (requer `x-admin-key` ou `?key=`)
- `GET /sessions/:sessionId/events` (SSE, requer `x-admin-key` ou `?key=`)
- `POST /messages/send` (requer `x-admin-key`)
- `POST /integrations/findmyangel/user-created` (requer Bearer secret da integração)
- `POST /integrations/findmyangel/template-message` (requer Bearer secret da integração + `x-idempotency-key`)

### Hard delete
- `POST /sessions/:sessionId/hard-delete` remove dados por `session_id` no Postgres e chaves de sessao no Redis.
- O endpoint tambem executa `purge` da sessao (quando SessionManager estiver habilitado) antes da limpeza de dados.
- Este fluxo nao executa acoes destrutivas externas na API do Stripe; limpa apenas dados locais no banco.

## Socket.IO (frontend)
- Path: `/socket.io` (websocket)
- Query: `userId`
- Eventos do cliente: `start-session`, `logout`
- Eventos do servidor: `socket-connected`, `qr` (data URL), `connected`, `disconnected`, `error` (e `logging-in` quando aplicável)

## Variaveis de ambiente
Veja `backend-b/.env.example` para valores e descricoes.
Principais:
- `DATABASE_URL`, `REDIS_URL`
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`
- `AI_ENABLED`, `AI_RESPOND_IN_GROUPS`, `AI_PROVIDER`, `AI_MODEL`, `AI_TEMPERATURE`, `AI_MAX_TOKENS`
- `AI_SYSTEM_PROMPT`, `AI_FALLBACK_MODE`, `AI_FALLBACK_TEXT`
- `AI_OPT_OUT_KEYWORDS`, `AI_OPT_IN_KEYWORDS`
- `AI_CONTEXT_MAX_MESSAGES`, `AI_CONTEXT_TTL_SEC`, `AI_PROCESSING_TIMEOUT_MS`
- `AI_BUSINESS_HOURS`, `AI_TIMEZONE`
- `AI_CONFIG_TABLE`, `AI_RESPONSE_TABLE`, `AI_CONTEXT_PREFIX`, `AI_OPTOUT_PREFIX`
- `AUTO_RESTORE_ON_BOOT`, `AUTO_RESTORE_MAX_SESSIONS`, `AUTO_RESTORE_PARALLEL`, `AUTO_RESTORE_STATUSES`
- `SESSION_DRIVER`
- `SESSION_MAX_PER_WORKER`, `SESSION_SHARD_COUNT`, `SESSION_SHARD_INDEX`, `SESSION_RECONCILE_INTERVAL_MS`
- `NOOP_READY_DELAY_MS`, `NOOP_DISCONNECT_AFTER_MS`, `NOOP_MESSAGE_STATUS_DELAY_MS`, `NOOP_FAIL_START_RATE`
- `AUTH_ENCRYPTION_KEY`
- `AUTH_STATE_TABLE`, `AUTH_CACHE_TTL_MS`, `AUTH_CACHE_DIR`
- `ADMIN_AUDIT_TABLE`
- `INBOUND_MESSAGES_TABLE`, `INBOUND_QUEUE_PREFIX`, `INBOUND_QUEUE_CHAT_SET`
- `INBOUND_RETENTION_DAYS`, `INBOUND_COMPACT_AFTER_DAYS`, `INBOUND_CLEANUP_INTERVAL_MS`
- `OUTBOUND_MESSAGES_TABLE`, `OUTBOUND_QUEUE_PREFIX`, `OUTBOUND_QUEUE_CHAT_SET`
- `OUTBOUND_RATE_LIMIT_SESSION_MS`, `OUTBOUND_RATE_LIMIT_CHAT_MS`, `OUTBOUND_RATE_LIMIT_PREFIX`
- `OUTBOUND_MAX_RETRIES`, `OUTBOUND_RETRY_BASE_MS`, `OUTBOUND_RETRY_MAX_MS`
- `OUTBOUND_WORKER_POLL_MS`, `OUTBOUND_WORKER_MAX_PER_CHAT`
- `OBS_ALERT_INTERVAL_MS`, `OBS_ERROR_RATE_THRESHOLD`, `OBS_QUEUE_CHAT_THRESHOLD`

## Deploy (Railway)
- Crie um novo service apontando para `backend-b/`.
- Configure as env vars conforme `.env.example`.
- Start command sugerido: `npm start`.
- Build command sugerido: `npm run build`.
