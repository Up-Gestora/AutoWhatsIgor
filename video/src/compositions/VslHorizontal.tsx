import React, { useEffect, useMemo, useState } from 'react'
import { AbsoluteFill, Sequence, continueRender, delayRender, staticFile } from 'remotion'
import { loadFont as loadOutfit } from '@remotion/google-fonts/Outfit'
import type { VslHorizontalProps } from '../types'
import { WideHook } from './scenes/WideHook'
import { WideUiShowcase } from './scenes/WideUiShowcase'
import { WideFeatureSummary } from './scenes/WideFeatureSummary'
import { WideCta } from './scenes/WideCta'

const { fontFamily } = loadOutfit()

const safeArea = {
  leftRight: 120,
  top: 70,
  bottom: 70
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

export const VslHorizontal: React.FC<VslHorizontalProps> = ({ hook, cta, theme, assets, content }) => {
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
        // ignore
      } finally {
        continueRender(handle)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [handle])

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
    // 30fps: ~3-4s per slide for a snappier pacing.
    return { segments: [90, 120, 105, 105, 105, 120, 120] }
  }, [])

  const sumTo = (idx: number) => timelines.segments.slice(0, idx).reduce((a, b) => a + b, 0)

  const ui = assets.ui

  const connectionMeta = getUiMeta(ui.conexoesQrMasked)
  const trainingMeta = getUiMeta(ui.treinamentoModelo)
  const crmMeta = getUiMeta(ui.crmLeads)
  const followMeta = getUiMeta(ui.followupModal)

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily, color: 'rgba(236,243,255,0.92)' }}>
      <Sequence from={0} durationInFrames={timelines.segments[0]}>
        <WideHook theme={theme} safeArea={safeArea} hook={hook} />
      </Sequence>

      <Sequence from={sumTo(1)} durationInFrames={timelines.segments[1]}>
        <WideUiShowcase
          theme={theme}
          safeArea={safeArea}
          kicker={content.connection.kicker}
          title={content.connection.title}
          subtitle={content.connection.subtitle}
          bullets={content.connection.steps}
          src={pick(ui.conexoesQrMasked) || ui.conexoesQrMasked}
          qrRect={connectionMeta.qrRect}
          imageSize={connectionMeta.size}
        />
      </Sequence>

      <Sequence from={sumTo(2)} durationInFrames={timelines.segments[2]}>
        <WideUiShowcase
          theme={theme}
          safeArea={safeArea}
          kicker={content.training.kicker}
          title={content.training.title}
          subtitle={content.training.subtitle}
          bullets={content.training.points}
          src={pick(ui.treinamentoModelo) || ui.treinamentoModelo}
          highlight={trainingMeta.highlight}
          imageSize={trainingMeta.size}
        />
      </Sequence>

      <Sequence from={sumTo(3)} durationInFrames={timelines.segments[3]}>
        <WideUiShowcase
          theme={theme}
          safeArea={safeArea}
          kicker={content.crm.kicker}
          title={content.crm.title}
          subtitle={content.crm.subtitle}
          bullets={content.crm.points}
          src={pick(ui.crmLeads)}
          imageSize={crmMeta.size}
        />
      </Sequence>

      <Sequence from={sumTo(4)} durationInFrames={timelines.segments[4]}>
        <WideUiShowcase
          theme={theme}
          safeArea={safeArea}
          kicker={content.followup.kicker}
          title={content.followup.title}
          subtitle={content.followup.subtitle}
          bullets={content.followup.points}
          src={pick(ui.followupModal)}
          imageSize={followMeta.size}
        />
      </Sequence>

      <Sequence from={sumTo(5)} durationInFrames={timelines.segments[5]}>
        <WideFeatureSummary theme={theme} safeArea={safeArea} title={content.summary.title} items={content.summary.items} />
      </Sequence>

      <Sequence from={sumTo(6)} durationInFrames={timelines.segments[6]}>
        <WideCta theme={theme} safeArea={safeArea} cta={cta} line="Teste gratuitamente e automatize seu WhatsApp." />
      </Sequence>
    </AbsoluteFill>
  )
}
