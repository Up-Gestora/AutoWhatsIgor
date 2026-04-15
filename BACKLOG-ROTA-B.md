# Backlog Tecnico - Rota B (Baileys + Workers)

## Objetivo
Reconstruir o sistema de conexao WhatsApp e respostas automaticas com IA usando Baileys (multi-device), priorizando estabilidade, isolamento de falhas e escalabilidade.

## Escopo
- Conexao por QR code para numeros pessoais.
- Sessao persistente com reconexao automatica e backoff.
- Pipeline de mensagens (inbound/outbound) com IA opcional.
- Observabilidade e operacao com baixo toque humano.

## Fora de escopo (por enquanto)
- API oficial do WhatsApp.
- Multi-tenant billing e planos.
- CRM completo.

## Premissas e riscos
- Risco de instabilidade e bloqueio por ser nao-oficial.
- Necessidade de isolamento por worker para evitar cascata.
- Custos devem ser menores que API oficial.

## Definicao de pronto (DoD)
- Start/stop de sessao via API com QR funcional.
- Reconexao automatica sem QR apos restart (quando valido).
- Mensagens inbound/outbound com idempotencia.
- Logs estruturados e metricas basicas.
- Teste de carga com 10-15 contas simultaneas sem queda geral.

## Fases e milestones (alto nivel)
- M0: Descoberta e arquitetura fechada
- M1: Core de sessao + QR + persistencia
- M2: Pipeline de mensagens + envio
- M3: IA e regras de auto-resposta
- M4: Observabilidade + testes de carga
- M5: Migracao gradual e corte do legado

## Backlog detalhado

### EPIC 0 - Descoberta e arquitetura
- [x] Definir metas de volume (contas, msgs/min) e SLA alvo.
- [x] Escolher stack backend (Fastify/Nest), fila (BullMQ), DB (Postgres), cache (Redis).
- [x] Decidir modelo de deploy (Railway, VPS, Docker).
- [ ] Mapear jornada do usuario (QR, reconexao, erro, suporte).
- [x] Documentar diagrama de componentes e fluxo principal.

### EPIC 1 - Estrutura de repo e bootstrap
- [x] Definir monorepo vs repos separados.
- [x] Criar pasta de backend (ex.: `backend/`) com app API e worker.
- [x] Padronizar configuracao de env vars e valida-las no boot.
- [x] Criar scripts de dev/prod (start, worker, queue).
- [x] Criar README tecnico da nova arquitetura.

### EPIC 2 - Store de credenciais e criptografia
- [x] Definir interface `AuthStateStore` (load/save/delete).
- [x] Implementar criptografia AES para blobs (chave via env).
- [x] Implementar store em Postgres (blob + metadata).
- [x] Implementar cache local em disco com TTL opcional.
- [x] Backup/restore do auth state.

### EPIC 3 - Manager de sessao (core)
- [x] Implementar `SessionManager` com lifecycle (start/stop/restart).
- [x] Implementar lock distribuido via Redis (lease + heartbeat).
- [x] Implementar timeout de start e cancelamento de tentativa.
- [ ] Implementar backoff exponencial em reconexao.
- [x] Implementar purge seguro (remove credenciais, locks, cache).
- [x] Limitar concorrencia de start por worker.

### EPIC 4 - QR e eventos de status
- [x] Implementar emissao de QR e atualizacoes via WS/SSE.
- [x] Definir evento de status (starting, waiting_qr, connected, disconnected, error).
- [x] Persistir status em cache (Redis) e historico no DB.
- [x] Rate limit de QR para evitar flood.
- [x] Expor endpoint de diagnostico (admin key).

### EPIC 5 - API de controle
- [x] `POST /sessions` (criar e iniciar).
- [x] `POST /sessions/:id/start` e `POST /sessions/:id/stop`.
- [x] `POST /sessions/:id/purge`.
- [x] `GET /sessions/:id/status`.
- [x] Autenticacao admin + auditoria de chamadas.

### EPIC 6 - Pipeline de mensagens (inbound)
- [x] Normalizar eventos do Baileys em schema interno.
- [x] Dedupe por messageId e hash de payload.
- [x] Persistir inbound em Postgres (por conversa).
- [x] Enfileirar por chat (garantir ordem).
- [x] Expirar mensagens antigas e compactar logs.

### EPIC 7 - Pipeline de mensagens (outbound)
- [x] Endpoint `POST /messages/send`.
- [x] Enfileirar envio com retries e idempotencia.
- [x] Confirmar delivery/ack e atualizar status.
- [x] Rate limit por conta e por chat.

### EPIC 8 - IA e regras de resposta
- [x] Worker de IA consumindo fila por chat.
- [x] Cache de contexto curto (Redis) para reduzir custo.
- [x] Fallback quando IA falha (resposta padrao ou silencio).
- [x] Regras de janela de atendimento e opt-out.
- [x] Config por cliente (prompt, temperatura, limites).

### EPIC 9 - Observabilidade e operacao
- [x] Logs JSON com ids de sessao/chat/mensagem.
- [x] Metricas basicas (start time, reconexao, fila, erro).
- [x] Healthchecks para API e workers.
- [x] Alertas simples (erro > X/min, fila crescendo).
- [x] Runbook de incidentes (QR falhando, login invalido, queda).

### EPIC 10 - Escalabilidade e resiliencia
- [x] Dimensionar quantas sessoes por worker (ex.: 5-10).
- [x] Auto-restart de workers com backoff.
- [x] Sharding por cliente ou por faixa de IDs.
- [x] Garantir reatribucao de sessao em falha.
- [x] Testar cold start e restart de container.

### EPIC 11 - Testes
- [x] Unit tests do SessionManager e AuthStateStore.
- [x] Integration tests de start/stop/reconnect.
- [ ] Load test: 10-15 contas simultaneas, 1-5 msgs/min. (harness: backend-b/scripts/epic11Harness.ts)
- [ ] Soak test: 12-24h com reconexoes. (harness: backend-b/scripts/epic11Harness.ts)
- [ ] Chaos test leve: matar worker e verificar reassignment. (harness: backend-b/scripts/epic11Harness.ts)

### EPIC 12 - UI/Admin (opcional, mas recomendado)
- [x] Tela de status de sessoes (lista, filtros, erros).
- [x] Tela de QR por sessao.
- [x] Botao de purge e restart.
- [x] Logs recentes por sessao.

### EPIC 13 - Migracao do legado
- [ ] Identificar o que pode ser migrado (contatos, conversas).
- [ ] Plano de migracao gradual por cliente.
- [ ] Feature flag para alternar legado/novo.
- [ ] Checklist de corte definitivo.

## Questões em aberto
- Onde hospedar (Railway vs VPS)? -> Railway
- Meta de volume real nos proximos 3 meses? -> 10-30 usuários simultâneos
- Nivel de autonomia da IA vs supervisao humana? -> Alto nível de autonomia da IA
- Politicas anti-spam e limites por cliente? -> Não se preocupe com isos por

## Entregaveis
- Documento de arquitetura + diagrama.
- MVP com QR + status + envio.
- Persistencia e reconexao robusta.
- Pipeline de mensagens completo com IA.
- Observabilidade e testes de carga.
