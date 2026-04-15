# Plano detalhado - Migracao urgente (multi-modelo + IA por chat + toggles de treinamento)

## Objetivo
Migrar 3 funcionalidades criticas do legado para o backend-b:
1) Multi-modelo (OpenAI + Gemini) e selecao de modelo do treinamento.
2) IA por chat (aiEnabled) + auto-desativar por "fora de contexto".
3) Toggles de treinamento hoje nao aplicados no backend-b: desligarMensagemForaContexto, comportamentoNaoSabe.

Este plano foi parcialmente executado; itens [x] indicam o que ja foi feito.

## Referencias no legado (para comportamento esperado)
- IA central (legado removido): referência histórica era `server/sessionManager.js` (funcao `handleAiResponse`)
  - Lembrar: usa `trainingData.model` para escolher OpenAI vs Gemini.
  - Lembre: usa `users/{userId}/chats_config/{chatId}.aiEnabled`.
  - Fora de contexto: detecta `N/A` e pode desativar IA do chat.
  - `comportamentoNaoSabe`: se "silencio" nao responde; se "encaminhar" envia fallback.
- Treinamento: `users/{userId}/settings/ai_training` em Firestore.
- UI treinamento: `app/dashboard/treinamento/page.tsx`.
- UI conversas: `components/conversations/conversations-panel.tsx`.

---

## Escopo tecnico resumido
- Backend-b:
  - Persistir config de IA por chat (tabela nova em Postgres).
  - Suportar dois providers (openai, google) com selecao por usuario.
  - Aplicar toggles de treinamento no fluxo de IA.
  - Expor endpoints admin para chat AI config e system settings.

- Frontend:
  - Sincronizar selecao de modelo do treinamento com backend-b.
  - Enviar toggles extras (desligarMensagemForaContexto, comportamentoNaoSabe) ao backend-b.
  - Integrar toggle de IA por chat ao backend-b (nao apenas Firestore).

---

# 1) Multi-modelo (OpenAI + Gemini) + selecao de modelo

## Situacao atual
- Backend-b: OpenAI + Gemini (provider/model em `backend-b/src/ai/*`).
- UI treinamento sincroniza provider/model com o backend-b.
- Legado usa `trainingData.model` (openai/google).

## Decisoes de design
- Manter `provider` e `model` no `AiConfig` do backend-b.
- `provider`: `openai` | `google` (compat com legado).
- `model`:
  - OpenAI: usar config existente (ex: `gpt-4o-mini` ou equivalente).
  - Gemini: default `gemini-3-flash-preview` (igual legado) ou `gemini-1.5-flash` (se mudarmos).
- Gemini sem ferramentas inicialmente (sem function-calling) para entregar multi-modelo rapido.
  - Observacao: no legado, Gemini usa tools (agenda). Como agenda nao foi migrada, manter sem tools e registrar backlog.

## Checklist de tarefas (backend-b)
- [x] Atualizar tipos
  - `backend-b/src/ai/types.ts`: permitir `provider: 'openai' | 'google'` e `model` por provider.
- [x] Atualizar env defaults
  - `backend-b/src/config/env.ts`: adicionar `GEMINI_API_KEY` e `AI_GEMINI_MODEL` (ou similar).
  - `backend-b/.env.example`: adicionar as novas vars.
- [x] Criar client Gemini
  - Novo arquivo `backend-b/src/ai/geminiClient.ts` usando `@google/generative-ai`.
  - Converter mensagens OpenAI -> Gemini (systemInstruction + history user/model, com merge do ultimo user).
  - Respeitar `temperature` e `maxTokens` se suportado.
- [x] Atualizar AiMessageService
  - [x] Selecionar provider baseado em `config.provider`.
  - [x] Se `provider === 'google'`, chamar GeminiClient.
  - [ ] Garantir logs/metricas por provider (logs incluem provider; metricas dedicadas pendentes).
- [x] Atualizar build/dep
  - Adicionar `@google/generative-ai` no `backend-b/package.json`.

## Checklist de tarefas (frontend + API)
- [x] Atualizar sync do treinamento
  - `lib/aiConfigSync.ts`: aceitar `provider` / `model`.
  - `app/api/ai-config/route.ts`: permitir salvar `provider`/`model` no backend-b.
  - `app/dashboard/treinamento/page.tsx` e `components/admin/user-training.tsx`: enviar `provider/model` no sync.

## Testes recomendados
- [x] Trocar modelo na UI e confirmar em `/admin/ai/config/:sessionId`.
- [x] Gerar mensagem e validar no log que provider correto foi usado.

---

# 2) IA por chat (aiEnabled) + auto-desativar por fora de contexto

## Situacao atual
- Legado: `users/{userId}/chats_config/{chatId}.aiEnabled` no Firestore.
- Backend-b: config por chat em Postgres (`chat_ai_configs`).
- UI conversas le/escreve `aiEnabled` via backend-b (Firestore fica para toggle global).

## Decisoes de design
- Criar store de configuracao por chat no backend-b (Postgres).
- Fonte de verdade passa a ser backend-b.
- UI deve ler/escrever via Next API (com auth Firebase) -> backend-b (admin key).

## Checklist de tarefas (backend-b)
- [x] Criar tabela + store
  - Tabela `chat_ai_configs`: `session_id`, `chat_id`, `ai_enabled`, `disabled_reason`, `disabled_at`, `updated_at`.
  - Store `ChatAiConfigStore` com `get`, `upsert`, `disable`.
- [x] Atualizar AiMessageService
  - Antes de responder, verificar `chat_ai_config.ai_enabled`.
  - Se false, pular e registrar metricas.
- [x] Adicionar endpoints admin
  - `GET /sessions/:sessionId/chats/:chatId/ai-config`
  - `POST /sessions/:sessionId/chats/:chatId/ai-config`
- [x] Atualizar auditoria
  - Log de alteracao de config por chat.

## Checklist de tarefas (frontend + API)
- [x] Nova API route Next
  - `/api/conversations/chats/[chatId]/ai-config` (GET/POST) com auth Firebase.
  - Internamente chama backend-b admin endpoints.
- [x] Atualizar UI conversas
  - `components/conversations/conversations-panel.tsx` deve ler `aiEnabled` do backend-b.
  - Toggle envia POST para backend-b.
  - Atualizar estado local com retorno da API.
- [ ] (Opcional) Sincronizar dados antigos
  - Script one-off para importar `chats_config` do Firestore para backend-b.

## Auto-desativar por fora de contexto
- [x] Implementar detector `isOutOfContextReply` no backend-b (regex N/A igual legado).
- [x] Se `desligarMensagemForaContexto === true` e resposta == N/A:
  - desativar IA no chat (aiEnabled=false, reason='context', disabled_at=now)
  - nao enviar resposta.

## Testes recomendados
- [x] Toggle de IA por chat desliga e impede resposta.
- [x] Enviar mensagem que gere N/A e confirmar que IA foi desativada no chat.

---

# 3) Toggles de treinamento (desligarMensagemForaContexto, comportamentoNaoSabe)

## Situacao atual
- UI salva toggles no Firestore; backend-b aplica `desligarMensagemForaContexto` e `comportamentoNaoSabe`.
- Legado usa:
  - `desligarMensagemForaContexto`
  - `comportamentoNaoSabe` (silencio ou encaminhar)

## Decisoes de design
- `desligarMensagemForaContexto`:
  - se resposta N/A, desativa IA do chat (item 2) e nao responde.
- `comportamentoNaoSabe`:
  - se N/A e `silencio`: nao envia resposta.
  - se N/A e `encaminhar`: enviar fallback padrao (configuravel) e nao gerar IA adicional.

## Checklist de tarefas (backend-b)
- [x] Expandir `AiTrainingData` para incluir:
  - [x] `desligarMensagemForaContexto?: boolean`
  - [x] `comportamentoNaoSabe?: 'encaminhar' | 'silencio'`
- [x] Atualizar sync de treinamento
  - [x] `desligarMensagemForaContexto`
  - [x] `comportamentoNaoSabe`
- [x] Aplicar logica `desligarMensagemForaContexto` e `comportamentoNaoSabe`
  - Ao detectar N/A:
    - [x] se `desligarMensagemForaContexto` true -> desativar IA do chat (item 2) e return.
    - [x] senao, se `comportamentoNaoSabe === 'silencio'` -> return.
    - [x] senao -> enviar fallback padrao (definir string igual legado).

## Checklist de tarefas (frontend)
- [x] Enviar esses campos no sync do treinamento.
  - [x] `desligarMensagemForaContexto`
  - [x] `comportamentoNaoSabe`
- [ ] (Opcional) Ajustar UI para exibir o estado vindo do backend-b quando carregar.

## Testes recomendados
- [x] `comportamentoNaoSabe=silencio`: nao envia fallback em N/A.
- [x] `desligarMensagemForaContexto=true`: chat fica desativado apos N/A.

---

# Dependencias e riscos
- Dependencia de API key Gemini (Railway env `GEMINI_API_KEY`).
- Multi-modelo com tools (agenda) fica fora enquanto agenda nao migrada.
- Migracao de dados antigos de `chats_config` (Firestore) pode ser necessaria para preservar toggles por chat.

---

# Proposta de ordem de execucao
1. Multi-modelo (infra + sync) para ativar Gemini rapidamente.
2. IA por chat (tabela + endpoints + UI) para garantir controle individual.
3. Toggles extras do treinamento, amarrando auto-disable e fallback.

---

# Checklist geral (resumo)
- [x] Multi-modelo completo (OpenAI + Gemini)
- [x] Sync de modelo pela UI de treinamento
- [x] Store + endpoints de config por chat
- [x] UI conversas lendo/escrevendo config por chat no backend-b
- [x] Regras N/A + auto-disable + comportamentoNaoSabe
- [ ] Testes manuais basicos em producao
