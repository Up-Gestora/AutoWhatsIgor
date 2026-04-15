# Backend B - Plano de Escalabilidade e Paralelismo

Data: 2026-02-10  
Escopo: backend-b (Fastify + Baileys + Redis/Postgres)

## Metas
- Suportar 50-100 contas WhatsApp conectadas simultaneamente.
- Reduzir aumento de latencia da IA em pico (ex: 20 mensagens simultaneas em chats diferentes).

## Parte 1: Capacidade de sessoes (SESSION_MAX_PER_WORKER)

### Como funciona hoje
- O limite e aplicado localmente no processo via `SESSION_MAX_PER_WORKER`.
- Se `countActiveSessions() >= SESSION_MAX_PER_WORKER`, `startSession()` rejeita o start.

### O que acontece quando estoura
- A sessao fica com `status=error` e `reason=capacity-exceeded`.
- No Socket.IO o dashboard recebe `error: capacity-exceeded` e depois `disconnected`.
- Nos endpoints HTTP admin, a resposta vem com `success: true`, mas `status` no payload indica `error/capacity-exceeded`.

### Config recomendada (Railway) para 50-100
- `SESSION_MAX_PER_WORKER=100`
- `AUTO_RESTORE_MAX_SESSIONS=100`
- `SESSION_START_CONCURRENCY=3`
- `AUTO_RESTORE_PARALLEL=2` (ou 3 se quiser boot mais rapido)
- `AUTO_RESTORE_BATCH_SIZE=20` (rampa de restore em lotes)
- `AUTO_RESTORE_BATCH_DELAY_MS=30000` (30s entre lotes)
- `SESSION_SHARD_COUNT=0`
- `SESSION_SHARD_INDEX=0`

### Restore em lotes no restart (rampa)
- Se `AUTO_RESTORE_BATCH_SIZE<=0`, o comportamento permanece legado (uma passada unica).
- Se `AUTO_RESTORE_BATCH_SIZE>0`, o auto-restore processa lotes e aguarda `AUTO_RESTORE_BATCH_DELAY_MS` entre lotes.
- Exemplo para reduzir pico no boot: `AUTO_RESTORE_MAX_SESSIONS=100`, `AUTO_RESTORE_BATCH_SIZE=20`, `AUTO_RESTORE_BATCH_DELAY_MS=30000`.

### Recursos da replica (Railway)
- Inicio: 2 vCPU e 4 GB RAM.
- Ajustar para 6-8 GB se `process.memoryUsage().rss` ficar consistentemente alto no pico.

### Validacao (rampa)
- Subir 8 -> 20 -> 50 -> 100 sessoes.
- Monitorar `/admin/diagnostics` e `/admin/metrics`.
- Confirmar que `sessions.start.rejected.capacity-exceeded` fica 0 ate o limite desejado.

### Observabilidade (sinais)
- `/admin/diagnostics`:
  - `memory.rss`, `heapUsed`
  - `sessions.sessionsCount`
  - `sessions.startSemaphore`
- `/admin/metrics`:
  - `sessions.start.rejected.*`
  - `sessions.start.failure`
  - `sessions.lock_lost`
  - `errors.total`

## Parte 2: Paralelismo de IA (InboundMessageWorker)

### Como funciona hoje
- A fila inbound nao e "uma fila unica global".
- Cada chat vira uma lista Redis: `inbound-queue:{sessionId}:{chatId}`.
- Um set Redis guarda os chats com pendencia: `inbound-queue-chats`.
- Hoje existe 1 worker de IA (`inboundWorker`) e ele processa em serie: 1 item por vez (mesmo que sejam chats diferentes).

### Problema
- Se chegarem muitas mensagens simultaneas em chats diferentes, as geracoes de IA entram em fila e a latencia sobe pelo somatorio.
- `AI_DEBOUNCE_MS` e o "superseded" ajudam a cortar trabalho inutil, mas nao criam paralelismo.

### Solucao: paralelismo por chat (sem criar varias filas)
- Permitir processar N chats em paralelo.
- Manter 1 chat por vez por chave (para nao processar o mesmo chat em paralelo).

### Mudancas propostas
- Implementar `chatConcurrency` no `InboundMessageWorker` (processar chats em paralelo, sequencial dentro do chat).
- Opcional: semaforo global para limitar chamadas ao provedor LLM e evitar 429.

### Novas env vars (propostas)
- `AI_WORKER_CONCURRENCY=5` (default 1)
- `AI_WORKER_MAX_PER_CHAT=5` (default 50; reduzir evita um chat monopolizar)
- `AI_LLM_MAX_CONCURRENCY=5` (default igual a `AI_WORKER_CONCURRENCY`)

### Mudancas de codigo (arquivos)
- `backend-b/src/messages/worker.ts`
  - Adicionar `chatConcurrency`.
  - Garantir 1 processor por chat (in-flight set).
- `backend-b/src/index.ts`
  - Passar `chatConcurrency` e `maxPerChat` para o `inboundWorker` de IA.
- `backend-b/src/ai/service.ts`
  - Adicionar semaforo global ao redor de `createChatCompletion` (opcional, recomendado).
- `backend-b/src/ai/audioTranscriptionService.ts`
  - Se habilitado, adicionar semaforo global ao redor de `createTranscription` (opcional, recomendado).

### Testes
- `backend-b/test/inboundMessageWorker.test.ts`
  - Processa 2 chats em paralelo com `chatConcurrency=2`.
  - Nao processa o mesmo chat em paralelo.
  - Debounce continua funcionando.

### Criterios de aceite
- Em pico com varios chats, a fila drena mais rapido e a latencia media cai.
- Sem explosao de `429` no provedor (semaforo global ligado).
- Sem regressao de debounce/superseded.

## Parte 3 (Futuro): Paralelismo de Outbound (OutboundMessageWorker)

### Como funciona hoje
- O outbound tambem e por chat:
  - Filas Redis: `outbound-queue:{sessionId}:{chatId}`.
  - Set: `outbound-queue-chats`.
- O worker e serial e faz `await` no envio, entao um envio lento pode segurar o restante.

### Solucao proposta
- Aplicar o mesmo modelo do inbound:
  - Paralelo por chat (N chats em paralelo).
  - Sequencial dentro do chat.
- Respeitar `OutboundRateLimiter.allow()` (atomico via Lua).

### Novas env vars (propostas)
- `OUTBOUND_WORKER_CHAT_CONCURRENCY=5` (default 1)
- `OUTBOUND_WORKER_MAX_PER_CHAT` ja existe (usar para fairness)
- Opcional: `OUTBOUND_SEND_MAX_CONCURRENCY` (limitar envios simultaneos)

### Pontos de atencao
- Em uma unica sessao, o ganho pode ser limitado pelo rate limit.
- Se no futuro rodar mais de 1 replica, outbound precisa de garantia forte de "single consumer" por item/chat para evitar duplicidade.

## Roadmap sugerido
- Fase 0: subir `SESSION_MAX_PER_WORKER` e `AUTO_RESTORE_MAX_SESSIONS` e validar rampa ate 50.
- Fase 1: implementar `AI_WORKER_CONCURRENCY` + semaforo LLM e validar em pico real.
- Fase 2: se outbound virar gargalo, implementar paralelismo do outbound por chat.

