# Backend B Runbook

## Quick checks
- `GET /health` to confirm API is up.
- `GET /health/worker` to confirm workers are running.
- `GET /admin/diagnostics` for sessions, locks, and event bus.
- `GET /admin/metrics` for counters/gauges.

## Billing/Stripe quick checks
- `npm run billing:webhook:check` to validate webhook endpoint status (fails when disabled).
- `npm run billing:reconcile -- --dry-run --from <unixSec|ISO> --to <unixSec|ISO>` to preview reconciliation.
- `npm run billing:reconcile -- --apply --sessionId <sessionId>` to apply reconciliation for a specific account.

## QR not generating
- Check `/sessions/:id/status` and `/sessions/:id/events`.
- Verify Redis is reachable and QR throttle keys are not stuck.
- Look for `QR generated` in logs.
- If status is `backoff` or `error`, consider `/sessions/:id/purge` and re-start.

## Session stuck in backoff or error
- Inspect `/admin/diagnostics` for lock status and backoff timers.
- Check logs for `lock-lost` or `start-timeout`.
- Confirm volume is mounted and `SESSIONS_DIR` is correct.
- If repeated failures, purge auth state and reconnect via QR.

## Hard delete de conta/sessao
- Endpoint operacional: `POST /sessions/:id/hard-delete` (admin key obrigatoria).
- Ordem do backend: purge de sessao (quando disponivel) + limpeza por `session_id` no Postgres + limpeza de chaves Redis.
- A resposta inclui relatorio por etapa (`purge` e `hardDelete`) com contadores.
- Em caso de erro, o endpoint retorna `500` com relatorio parcial para diagnostico.
- Este fluxo nao cancela assinatura nem deleta customer no Stripe; somente dados locais do backend.

## Transmissao parada em running
- Sintoma comum nos logs: `Baileys disconnected` + `Baileys reconnect scheduled` em loop.
- Confira `/health/worker` para validar que o `broadcast` worker esta rodando.
- Confira `/admin/diagnostics` para validar status atual da sessao afetada.
- Jobs `running` de sessoes desconectadas por mais de `BROADCAST_DISCONNECT_PAUSE_GRACE_MS` sao auto-pausados com `pause_reason=session_not_connected`.
- Acao operacional recomendada: fazer purge/reconnect da sessao via QR quando o loop persistir.

## AI not responding
- Confirm `OPENAI_API_KEY` is set and `AI_ENABLED=true`.
- Check `/admin/ai/config/:sessionId` for `respondInGroups` and `businessHours`.
- Look for `AI generation failed` or `AI disabled` logs.
- Verify inbound messages are stored and queue is not backlogged.

## AI not responding to image/PDF
- Confirm `AI_MEDIA_ENABLED=true` in the backend environment.
- Confirm training toggle `permitirIALerImagensEPdfs=true` for the target session.
- Check `/health/worker` and ensure the `media` worker is running.
- Check `/admin/metrics` for `ai.media.*` counters (`enqueued`, `analyze.failed`, `skipped.*`).
- Validate file limits (`AI_MEDIA_MAX_BYTES`, `AI_MEDIA_PDF_MAX_PAGES`) and look for `too_large` / `not_pdf` skips.
- If failures persist, review logs for `Media understanding failed` and fallback handoff sends (`ai:media:fallback:*`).

## Auto follow-up automatico (Leads/Clientes)
- Confirmar no Treinamento: `followUpAutomatico.enabled=true`.
- Para clientes, confirmar tambem: `followUpAutomatico.allowClients=true`.
- Verificar `/health/worker` e confirmar `autoFollowUp.running=true`.
- Verificar `/admin/metrics` para contadores `ai.followup.auto.*` (sent/rescheduled/retry/blocked).
- Se nao estiver processando, revisar `next_contact_at` e `status` no CRM:
  - Apenas contatos com `next_contact_at <= agora` entram no lote.
  - `status=inativo` e `chat_id` vazio nao sao elegiveis.
- Tuning operacional (env):
  - `AI_AUTO_FOLLOWUP_WORKER_POLL_MS`
  - `AI_AUTO_FOLLOWUP_WORKER_SESSION_LIMIT`
  - `AI_AUTO_FOLLOWUP_WORKER_BATCH_SIZE`
  - `AI_AUTO_FOLLOWUP_WORKER_LEASE_MS`
  - `AI_AUTO_FOLLOWUP_RETRY_BASE_MS`
  - `AI_AUTO_FOLLOWUP_RETRY_MAX_MS`

## Queue backlog
- Check `queue.inbound.chats` and `queue.outbound.chats` in `/admin/metrics`.
- If high, scale workers or reduce `OUTBOUND_RATE_LIMIT_*` delays.
- Inspect Redis health and latency.

## High error rate
- Check `errors.total` delta in `/admin/metrics`.
- Review recent logs for repeated failures.
- Validate database and Redis connections.

## Auto-restore failures
- Confirm `AUTO_RESTORE_ON_BOOT=true`.
- Ensure auth state table has entries for the session.
- Verify volume mount and `SESSIONS_DIR`.
- If restart causes resource spikes, enable ramp:
  - `AUTO_RESTORE_BATCH_SIZE=20`
  - `AUTO_RESTORE_BATCH_DELAY_MS=30000`
- To rollback quickly to legacy behavior:
  - `AUTO_RESTORE_BATCH_SIZE=0`
  - `AUTO_RESTORE_BATCH_DELAY_MS=0`

## Escalation checklist
- Capture the last 5 minutes of logs.
- Save `/admin/diagnostics` and `/admin/metrics` output.
- Note the affected sessionIds and timestamps.
