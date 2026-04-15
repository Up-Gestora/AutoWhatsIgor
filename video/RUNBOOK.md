# Video Runbook

## Hero block (Stories/Reels 9:16, 15s)

Fluxo pontual para exportar o bloco animado da hero em MP4:

1. Suba o frontend na raiz do repo:
   - `cmd /d /s /c npm run dev`

2. Em outro terminal, capture o bloco animado em WebM:
   - `cmd /d /s /c node scripts/export-hero-block-reel.mjs`

3. Renderize o MP4 final via Remotion:
   - `cd video`
   - `cmd /d /s /c node scripts/render-hero-capture.mjs`

Saidas:
- Bruto: `video/public/captures/hero-block-raw.webm`
- Final: `docs/ads/hero/hero-block-15s.mp4`

Variaveis opcionais da captura:
- `CAPTURE_URL` (default: `http://localhost:3000/render/hero-block`)
- `CAPTURE_MS` (default: `15000`)
- `CAPTURE_OUT` (default: `video/public/captures/hero-block-raw.webm`)
