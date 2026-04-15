# AGENTS

## Overview
- AutoWhats is a SaaS for WhatsApp automation with AI.
- This repo contains two main parts: the Next.js frontend at the root, and Backend B in `backend-b/`.

## Repo map (key areas)
- `app/`: Next.js App Router pages and routes.
- `components/`: UI components (shadcn/ui style).
- `lib/`: shared helpers (including sync logic with backend-b).
- `backend-b/`: new WhatsApp backend (TS, Fastify + Baileys, Redis/Postgres).
- Docs: `BACKLOG-ROTA-B.md`, `PLANO-MIGRACAO-URGENTE-IA.md`, `backend-b/ARCHITECTURE.md`, `backend-b/RUNBOOK.md`.

## How to run
Frontend (root):
- `npm install`
- `npm run dev` (http://localhost:3000)

Backend B (backend-b/):
- `cd backend-b`
- `npm install`
- `npm run dev` (default port 3002 in `.env.example`)

## Environment
- Frontend: `.env.local` (Firebase + `BACKEND_URL` + `BACKEND_ADMIN_KEY`).
- Backend B: `backend-b/.env` based on `backend-b/.env.example`.
- Do not commit secrets.

## Tests
- Frontend: `npm run lint`.
- Backend B: `npm run test`, plus `npm run epic11:load|soak|chaos` for load harness.
- Legacy backend removed.

## Change guidance
- Backend in scope: `backend-b/`.
- For AI parity with prior behavior, reference `PLANO-MIGRACAO-URGENTE-IA.md`.
- For ops/debug, see `backend-b/RUNBOOK.md`.

## Language and encoding rules
- For Portuguese text (UI copy, prompts, docs, tests, logs shown to users), keep correct PT-BR orthography with accents and `ç`.
- Do not "ASCII-fy" Portuguese text (`informacao`, `voce`, etc.) unless the text is intentionally ASCII-only for a protocol or identifier.
- Keep text files in UTF-8. Do not change encoding while editing.
- If mojibake appears (`Ã`, `Â`, `�`) in Portuguese strings, fix it before finishing the change.
