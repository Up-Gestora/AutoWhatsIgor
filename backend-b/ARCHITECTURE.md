# Arquitetura - Rota B (Baileys + Workers)

## Visao geral
Arquitetura com API stateless, workers de sessao isolados e fila para processamento assincromico.

```
+-----------+        +----------------+        +----------------+
| Dashboard | <----> | API (Fastify)  | <----> | Redis (fila)   |
+-----------+        +----------------+        +----------------+
        ^                  |      |                   |
        |                  |      |                   v
        |                  |      |            +---------------+
        |                  |      +----------> | SessionWorker |
        |                  |                   +---------------+
        |                  |                           |
        |                  |                           v
        |                  |                   +---------------+
        |                  +-----------------> | AI Worker     |
        |                                      +---------------+
        |                                              |
        v                                              v
+----------------+                           +--------------------+
| WhatsApp (MD)  |                           | Postgres + Storage |
+----------------+                           +--------------------+
```

## Componentes
- API: cria/encerra sessoes, emite QR, expor status e rotas admin.
- SessionWorker: mantem conexoes do Baileys, reconecta e emite eventos.
- AI Worker: processa filas por chat e gera respostas.
- Redis: fila, locks e rate limit.
- Postgres: conversas, mensagens, estados e auditoria.
- Storage: anexos e backup de auth state.

## Fluxo de sessao (resumo)
1. API recebe `POST /sessions`.
2. API cria job de start na fila.
3. SessionWorker assume o job, carrega auth state e abre conexao.
4. Se precisar, gera QR e notifica a API.
5. API transmite QR via WS/SSE para o dashboard.

## Fluxo de mensagens
1. Baileys emite evento inbound.
2. SessionWorker normaliza e grava no Postgres.
3. Eventual job para IA e envio de resposta.
4. Outbound vai para fila com retries e idempotencia.

## Decisoes tecnicas
- Stack: Fastify + TypeScript.
- Fila/lock: Redis (listas + locks).
- DB: Postgres.
- Multi-worker: sharding por sessoes para limitar falhas.

## Proximos passos
- Implementar store criptografada de auth state.
- Criar workers de sessao e IA.
- Adicionar endpoints de status e controle.
- Preparar testes de carga.
