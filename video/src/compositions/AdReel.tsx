import { AbsoluteFill, Sequence, staticFile } from 'remotion'
import { loadFont } from '@remotion/google-fonts/Outfit'
import type { AdReelProps } from '../types'
import { AnimatedBackground } from './scenes/AnimatedBackground'
import { HookScene } from './scenes/HookScene'
import { SlideScene } from './scenes/SlideScene'
import { CtaScene } from './scenes/CtaScene'

const { fontFamily } = loadFont()

const HOOK = 66
const SLIDE_01 = 78
const SLIDE_05 = 66
const SLIDE_06 = 66
const SLIDE_07 = 60
const SLIDE_08 = 72
const SLIDE_09 = 69
const SLIDE_10 = 63
const CTA = 90

const safeArea = {
  leftRight: 96,
  top: 160,
  bottom: 220
}

export const AdReel: React.FC<AdReelProps> = ({ hook, cta, slides, theme }) => {
  const tHook = 0
  const tS01 = tHook + HOOK
  const tS05 = tS01 + SLIDE_01
  const tS06 = tS05 + SLIDE_05
  const tS07 = tS06 + SLIDE_06
  const tS08 = tS07 + SLIDE_07
  const tS09 = tS08 + SLIDE_08
  const tS10 = tS09 + SLIDE_09
  const tCta = tS10 + SLIDE_10

  const getSlideSrc = (index: number) => {
    const key = slides[index]
    return staticFile(key)
  }

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily }}>
      <AnimatedBackground theme={theme} />

      <Sequence from={tHook} durationInFrames={HOOK}>
        <HookScene hook={hook} theme={theme} safeArea={safeArea} />
      </Sequence>

      <Sequence from={tS01} durationInFrames={SLIDE_01}>
        <SlideScene
          durationInFrames={SLIDE_01}
          src={getSlideSrc(0)}
          theme={theme}
          safeArea={safeArea}
          kicker="Conta"
          title="Conta + painel liberado"
          subtitle="Crie a conta e entre no dashboard em poucos cliques."
        />
      </Sequence>

      <Sequence from={tS05} durationInFrames={SLIDE_05}>
        <SlideScene
          durationInFrames={SLIDE_05}
          src={getSlideSrc(1)}
          theme={theme}
          safeArea={safeArea}
          kicker="WhatsApp"
          title="Gere o QR Code"
          subtitle="Abra Conexoes e toque em Gerar QR Code."
        />
      </Sequence>

      <Sequence from={tS06} durationInFrames={SLIDE_06}>
        <SlideScene
          durationInFrames={SLIDE_06}
          src={getSlideSrc(2)}
          theme={theme}
          safeArea={safeArea}
          kicker="WhatsApp"
          title="Escaneie pelo celular"
          subtitle="Aparelhos conectados / Conectar um aparelho."
          scanline
        />
      </Sequence>

      <Sequence from={tS07} durationInFrames={SLIDE_07}>
        <SlideScene
          durationInFrames={SLIDE_07}
          src={getSlideSrc(3)}
          theme={theme}
          safeArea={safeArea}
          kicker="Pronto"
          title="Whats conectado"
          subtitle="Sessao ativa para atender seus leads."
        />
      </Sequence>

      <Sequence from={tS08} durationInFrames={SLIDE_08}>
        <SlideScene
          durationInFrames={SLIDE_08}
          src={getSlideSrc(4)}
          theme={theme}
          safeArea={safeArea}
          kicker="IA"
          title="Ligue a IA Global"
          subtitle="Ative a IA para responder automaticamente."
        />
      </Sequence>

      <Sequence from={tS09} durationInFrames={SLIDE_09}>
        <SlideScene
          durationInFrames={SLIDE_09}
          src={getSlideSrc(5)}
          theme={theme}
          safeArea={safeArea}
          kicker="Tráfego pago"
          title="Responda em segundos"
          subtitle="Menos espera. Mais conversao no WhatsApp."
        />
      </Sequence>

      <Sequence from={tS10} durationInFrames={SLIDE_10}>
        <SlideScene
          durationInFrames={SLIDE_10}
          src={getSlideSrc(6)}
          theme={theme}
          safeArea={safeArea}
          kicker="Treinamento"
          title="Ajuste o comportamento"
          subtitle="Defina regras, servicos e tom de resposta."
        />
      </Sequence>

      <Sequence from={tCta} durationInFrames={CTA}>
        <CtaScene cta={cta} theme={theme} safeArea={safeArea} />
      </Sequence>
    </AbsoluteFill>
  )
}
