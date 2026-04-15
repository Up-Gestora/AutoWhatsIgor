import React, { useEffect, useMemo, useState } from 'react'
import { AbsoluteFill, Sequence, continueRender, delayRender, staticFile } from 'remotion'
import { loadFont as loadOutfit } from '@remotion/google-fonts/Outfit'
import type { AdV2Props } from '../types'
import { KineticHook } from './scenes/KineticHook'
import { ChatSim } from './scenes/ChatSim'
import { UiCrop } from './scenes/UiCrop'
import { BenefitCards } from './scenes/BenefitCards'
import { CtaV2 } from './scenes/CtaV2'
import { ProgressBar } from './scenes/ProgressBar'
import { NichePills } from './scenes/NichePills'
import { StatBadge } from './scenes/StatBadge'

const { fontFamily } = loadOutfit()

const safeArea = {
  leftRight: 96,
  top: 170,
  bottom: 260
}

type UiManifest = {
  crops?: Record<
    string,
    {
      highlight?: { x: number; y: number; w: number; h: number } | null
      qrRect?: { x: number; y: number; w: number; h: number } | null
      size?: { w: number; h: number } | null
    }
  >
}

function basename(p: string) {
  const norm = p.split('\\').join('/')
  const parts = norm.split('/')
  return parts[parts.length - 1]
}

export const AdV2: React.FC<AdV2Props> = ({ script, hook, cta, theme, assets, content }) => {
  const [manifest, setManifest] = useState<UiManifest | null>(null)
  const [available, setAvailable] = useState<Set<string>>(new Set())
  const [handle] = useState(() => delayRender('load ui manifest'))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [manifestRes, availabilityRes] = await Promise.allSettled([
          fetch(staticFile('ui/manifest.json')),
          fetch(staticFile('ads-v2-availability.json'))
        ])

        if (manifestRes.status === 'fulfilled' && manifestRes.value.ok) {
          const json = (await manifestRes.value.json()) as UiManifest
          if (!cancelled) setManifest(json)
        }

        if (availabilityRes.status === 'fulfilled' && availabilityRes.value.ok) {
          const json = (await availabilityRes.value.json()) as { available?: string[] }
          const set = new Set<string>(json?.available || [])
          if (!cancelled) setAvailable(set)
        }
      } catch {
        // ignore: highlights are optional
      } finally {
        continueRender(handle)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [handle])

  const ui = assets.ui
  const broll = assets.broll || {}
  const chat = content?.chat
  const niches = content?.niches
  const statBadge = content?.statBadge
  const hookLabel = content?.hookLabel

  const pick = (p?: string | null) => {
    if (!p) return undefined
    return available.has(p) ? p : undefined
  }

  const getUiMeta = (uiPath: string) => {
    const key = basename(uiPath)
    const meta = manifest?.crops?.[key]
    return {
      highlight: meta?.highlight ?? null,
      qrRect: meta?.qrRect ?? null,
      size: meta?.size ?? null
    }
  }

  const timelines = useMemo(() => {
    if (script === 'A') {
      return { segments: [60, 120, 135, 60, 75] }
    }
    if (script === 'B') {
      return { segments: [75, 240, 60, 75] }
    }
    return { segments: [60, 75, 75, 60, 75, 105] }
  }, [script])

  const sumTo = (idx: number) => timelines.segments.slice(0, idx).reduce((a, b) => a + b, 0)

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily, color: 'rgba(236,243,255,0.92)' }}>
      <ProgressBar segments={timelines.segments} theme={{ primary: theme.primary }} safeArea={safeArea} />

      {script === 'A' ? (
        <>
          <Sequence from={0} durationInFrames={timelines.segments[0]}>
            <KineticHook
              hook={hook}
              theme={theme}
              safeArea={safeArea}
              label={hookLabel || 'Tráfego pago no WhatsApp'}
              bgVideo={
                pick(broll.videos?.hook) ||
                pick('broll/videos/broll-clock-loop.mp4') ||
                pick('broll/videos/broll-chat-float.mp4')
              }
              bgImage={pick(broll.images?.bg1) || pick('broll/images/bg-abstract-01.png')}
            />
          </Sequence>

          <Sequence from={sumTo(1)} durationInFrames={timelines.segments[1]}>
            <AbsoluteFill>
              <ChatSim
                theme={theme}
                safeArea={safeArea}
                leadText={chat?.leadText || 'Oi! Tem horário hoje?'}
                aiText={chat?.aiText || 'Tenho sim. Qual horário você prefere?'}
                badge={chat?.badge}
                bgVideo={pick(broll.videos?.motion) || pick('broll/videos/broll-chat-float.mp4')}
                bgImage={pick(broll.images?.bg2) || pick('broll/images/bg-abstract-02.png')}
              />

              {niches && niches.length > 0 ? (
                <NichePills
                  items={niches}
                  theme={{ primary: theme.primary }}
                  safeArea={{ leftRight: safeArea.leftRight }}
                  top={150}
                  reserveRight={360}
                />
              ) : null}

              {statBadge ? (
                <StatBadge
                  theme={{ primary: theme.primary, accent: theme.accent }}
                  safeArea={{ leftRight: safeArea.leftRight }}
                  value={statBadge.value}
                  label={statBadge.label}
                  footnote={statBadge.footnote}
                  top={140}
                />
              ) : null}
            </AbsoluteFill>
          </Sequence>

          <Sequence from={sumTo(2)} durationInFrames={timelines.segments[2]}>
            <UiCrop
              src={ui.treinamentoModelo}
              theme={theme}
              safeArea={safeArea}
              kicker="Treinamento"
              title="Defina o modelo"
              subtitle="IA ajustável para o seu negócio."
              highlight={getUiMeta(ui.treinamentoModelo).highlight}
              imageSize={getUiMeta(ui.treinamentoModelo).size}
              bgVideo={pick(broll.videos?.motion) || pick('broll/videos/broll-chat-float.mp4')}
              bgImage={pick(broll.images?.bg3) || pick('broll/images/bg-abstract-03.png')}
            />
          </Sequence>

          <Sequence from={sumTo(3)} durationInFrames={timelines.segments[3]}>
            <UiCrop
              src={ui.iaGlobalOn}
              theme={theme}
              safeArea={safeArea}
              kicker="IA"
              title="Ligue a IA Global"
              subtitle="Deixe atendendo automaticamente."
              highlight={getUiMeta(ui.iaGlobalOn).highlight}
              imageSize={getUiMeta(ui.iaGlobalOn).size}
              bgVideo={pick(broll.videos?.motion) || pick('broll/videos/broll-neon-waves.mp4')}
              bgImage={pick(broll.images?.bg2) || pick('broll/images/bg-abstract-02.png')}
            />
          </Sequence>

          <Sequence from={sumTo(4)} durationInFrames={timelines.segments[4]}>
            <CtaV2
              theme={theme}
              safeArea={safeArea}
              cta={cta}
              line="Atenda rápido e converta mais."
              bgVideo={
                pick(broll.videos?.hook) ||
                pick('broll/videos/broll-clock-loop.mp4') ||
                pick('broll/videos/broll-chat-float.mp4')
              }
              bgImage={pick(broll.images?.bg1) || pick('broll/images/bg-abstract-01.png')}
            />
          </Sequence>
        </>
      ) : null}

      {script === 'B' ? (
        <>
          <Sequence from={0} durationInFrames={timelines.segments[0]}>
            <KineticHook
              hook={hook}
              theme={theme}
              safeArea={safeArea}
              label={hookLabel || 'Atendimento 24/7'}
              bgVideo={pick(broll.videos?.hook) || pick('broll/videos/broll-clock-loop.mp4')}
              bgImage={pick(broll.images?.bg1) || pick('broll/images/bg-abstract-01.png')}
            />
          </Sequence>

          <Sequence from={sumTo(1)} durationInFrames={timelines.segments[1]}>
            <BenefitCards
              theme={theme}
              safeArea={safeArea}
              headline="Não perca leads"
              subline="Mesmo fora do horário comercial."
              items={[
                {
                  title: 'Atenda 24/7',
                  subtitle: 'Sem contratar recepção.',
                  icon: pick(broll.images?.iconClock) || pick('broll/images/icon-clock-3d.png')
                },
                {
                  title: 'Qualifique o lead',
                  subtitle: 'Perguntas e respostas automáticas.',
                  icon: pick(broll.images?.iconChat) || pick('broll/images/icon-chat-3d.png')
                },
                {
                  title: 'Direcione p/ agendar',
                  subtitle: 'Rápido e sem fricção.',
                  icon: pick(broll.images?.iconQr) || pick('broll/images/icon-qr-3d.png')
                }
              ]}
              bgVideo={pick(broll.videos?.motion) || pick('broll/videos/broll-neon-waves.mp4')}
              bgImage={pick(broll.images?.bg2) || pick('broll/images/bg-abstract-02.png')}
            />
          </Sequence>

          <Sequence from={sumTo(2)} durationInFrames={timelines.segments[2]}>
            <UiCrop
              src={ui.iaGlobalOn}
              theme={theme}
              safeArea={safeArea}
              kicker="UI real"
              title="Prova no produto"
              subtitle="Ative a IA Global e deixe rodando."
              highlight={getUiMeta(ui.iaGlobalOn).highlight}
              imageSize={getUiMeta(ui.iaGlobalOn).size}
              bgVideo={pick(broll.videos?.motion) || pick('broll/videos/broll-chat-float.mp4')}
              bgImage={pick(broll.images?.bg3) || pick('broll/images/bg-abstract-03.png')}
            />
          </Sequence>

          <Sequence from={sumTo(3)} durationInFrames={timelines.segments[3]}>
            <CtaV2
              theme={theme}
              safeArea={safeArea}
              cta={cta}
              line="Mais velocidade. Mais conversão."
              bgVideo={
                pick(broll.videos?.hook) ||
                pick('broll/videos/broll-clock-loop.mp4') ||
                pick('broll/videos/broll-chat-float.mp4')
              }
              bgImage={pick(broll.images?.bg1) || pick('broll/images/bg-abstract-01.png')}
            />
          </Sequence>
        </>
      ) : null}

      {script === 'C' ? (
        <>
          <Sequence from={0} durationInFrames={timelines.segments[0]}>
            <KineticHook
              hook={hook}
              theme={theme}
              safeArea={safeArea}
              label={hookLabel || 'Setup rápido'}
              bgVideo={
                pick(broll.videos?.hook) ||
                pick('broll/videos/broll-clock-loop.mp4') ||
                pick('broll/videos/broll-chat-float.mp4')
              }
              bgImage={pick(broll.images?.bg1) || pick('broll/images/bg-abstract-01.png')}
            />
          </Sequence>

          <Sequence from={sumTo(1)} durationInFrames={timelines.segments[1]}>
            <UiCrop
              src={ui.signup}
              theme={theme}
              safeArea={safeArea}
              kicker="Passo 1"
              title="Crie a conta"
              subtitle="Preencha e clique em Criar Conta."
              highlight={getUiMeta(ui.signup).highlight}
              imageSize={getUiMeta(ui.signup).size}
              bgImage={pick(broll.images?.bg2) || pick('broll/images/bg-abstract-02.png')}
            />
          </Sequence>

          <Sequence from={sumTo(2)} durationInFrames={timelines.segments[2]}>
            <UiCrop
              src={ui.conexoesGerarQr}
              theme={theme}
              safeArea={safeArea}
              kicker="Passo 2"
              title="Gere o QR"
              subtitle="Abra Conexões e toque em Gerar QR Code."
              highlight={getUiMeta(ui.conexoesGerarQr).highlight}
              imageSize={getUiMeta(ui.conexoesGerarQr).size}
              bgVideo={pick(broll.videos?.qr) || pick('broll/videos/broll-qr-scan.mp4')}
              bgImage={pick(broll.images?.bg3) || pick('broll/images/bg-abstract-03.png')}
            />
          </Sequence>

          <Sequence from={sumTo(3)} durationInFrames={timelines.segments[3]}>
            {(() => {
              const src = pick(ui.conectadoMasked) || ui.conexoesQrMasked
              const meta = getUiMeta(src)
              const isQr = basename(src) === 'conexoes-qr-masked.png'
              return (
                <UiCrop
                  src={src}
                  theme={theme}
                  safeArea={safeArea}
                  kicker="Pronto"
                  title="Conectado"
                  subtitle="Quando escanear, aparece Conectado com sucesso."
                  imageSize={meta.size}
                  qrRect={isQr ? meta.qrRect : null}
                  bgImage={pick(broll.images?.bg1) || pick('broll/images/bg-abstract-01.png')}
                />
              )
            })()}
          </Sequence>

          <Sequence from={sumTo(4)} durationInFrames={timelines.segments[4]}>
            <UiCrop
              src={ui.iaGlobalOn}
              theme={theme}
              safeArea={safeArea}
              kicker="Passo 3"
              title="Ligue a IA"
              subtitle="Ative a IA Global para responder automaticamente."
              highlight={getUiMeta(ui.iaGlobalOn).highlight}
              imageSize={getUiMeta(ui.iaGlobalOn).size}
              bgVideo={pick(broll.videos?.motion) || pick('broll/videos/broll-chat-float.mp4')}
              bgImage={pick(broll.images?.bg2) || pick('broll/images/bg-abstract-02.png')}
            />
          </Sequence>

          <Sequence from={sumTo(5)} durationInFrames={timelines.segments[5]}>
            <CtaV2
              theme={theme}
              safeArea={safeArea}
              cta={cta}
              line="Conta + QR + IA Global em minutos."
              bgVideo={
                pick(broll.videos?.hook) ||
                pick('broll/videos/broll-clock-loop.mp4') ||
                pick('broll/videos/broll-chat-float.mp4')
              }
              bgImage={pick(broll.images?.bg3) || pick('broll/images/bg-abstract-03.png')}
            />
          </Sequence>
        </>
      ) : null}

      {/* Guard: keep background always filled */}
      <AbsoluteFill style={{ backgroundColor: theme.bg, opacity: 0, pointerEvents: 'none' }} />
    </AbsoluteFill>
  )
}
