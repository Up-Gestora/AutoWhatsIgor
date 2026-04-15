import { Composition } from 'remotion'
import { AdReel } from './compositions/AdReel'
import { AdV2 } from './compositions/AdV2'
import { HeroCapture } from './compositions/HeroCapture'
import { VslHorizontal } from './compositions/VslHorizontal'
import type { AdReelProps, AdV2Props, HeroCaptureProps, VslHorizontalProps } from './types'

const DURATION_IN_FRAMES = 630
const FPS = 30
const WIDTH = 1080
const HEIGHT = 1920

const defaultProps: AdReelProps = {
  variantId: 'reels-01',
  hook: {
    line1: 'Rodou anuncio?',
    line2: 'Responda no WhatsApp em segundos com IA',
    sub: 'Conta + QR + IA Global em minutos'
  },
  cta: {
    primary: 'Teste gratuitamente',
    url: 'auto-whats.vercel.app'
  },
  slides: [
    'slides/01.png',
    'slides/05.png',
    'slides/06.png',
    'slides/07.png',
    'slides/08.png',
    'slides/09.png',
    'slides/10.png'
  ],
  theme: {
    bg: '#0D1117',
    primary: '#25D366',
    accent: '#128C7E'
  }
}

const DURATION_V2 = 450
const DURATION_VSL = 765
const DURATION_HERO_CAPTURE = 450
const defaultV2: AdV2Props = {
  variantId: 'pro-01',
  script: 'A',
  hook: {
    line1: 'Rodou anuncio?',
    line2: 'Lead caiu no Whats.',
    sub: 'Responda em segundos com IA'
  },
  cta: {
    primary: 'Teste gratuitamente',
    url: 'auto-whats.vercel.app'
  },
  theme: {
    bg: '#0D1117',
    primary: '#25D366',
    accent: '#128C7E'
  },
  assets: {
    ui: {
      signup: 'ui/signup.png',
      conexoesGerarQr: 'ui/conexoes-gerar-qr.png',
      conexoesQrMasked: 'ui/conexoes-qr-masked.png',
      conectadoMasked: 'ui/conectado-masked.png',
      iaGlobalOn: 'ui/ia-global-on.png',
      treinamentoModelo: 'ui/treinamento-modelo.png'
    },
    broll: {
      images: {
        bg1: 'broll/images/bg-abstract-01.png',
        bg2: 'broll/images/bg-abstract-02.png',
        bg3: 'broll/images/bg-abstract-03.png',
        iconChat: 'broll/images/icon-chat-3d.png',
        iconQr: 'broll/images/icon-qr-3d.png',
        iconClock: 'broll/images/icon-clock-3d.png'
      },
      videos: {
        hook: 'broll/videos/broll-neon-waves.mp4',
        motion: 'broll/videos/broll-chat-float.mp4',
        qr: 'broll/videos/broll-qr-scan.mp4',
        clock: 'broll/videos/broll-clock-loop.mp4'
      }
    }
  }
}

const defaultVsl: VslHorizontalProps = {
  variantId: 'vsl-01',
  hook: {
    kicker: 'VSL',
    line1: 'Conecte o WhatsApp',
    line2: 'e automatize em minutos',
    sub: 'Setup simples + CRM + follow-up com IA'
  },
  cta: {
    primary: 'Teste gratuitamente',
    url: 'auto-whats.vercel.app'
  },
  content: {
    connection: {
      kicker: 'Conexão',
      title: 'Conexão via QR Code',
      subtitle: 'Gere no painel e escaneie no celular.',
      steps: ['Gerar QR no painel', 'Escanear no WhatsApp', 'Sessão conectada']
    },
    training: {
      kicker: 'Treinamento',
      title: 'Treine a IA do seu jeito',
      subtitle: 'Defina modelo, tom e orientações.',
      points: ['Personalize respostas', 'Use seu FAQ', 'Controle total']
    },
    crm: {
      kicker: 'CRM',
      title: 'Leads viram clientes',
      subtitle: 'Organize o funil e acompanhe cada contato.',
      points: ['Pipeline por status', 'Próximo contato', 'Observações e tags']
    },
    followup: {
      kicker: 'Follow-up',
      title: 'Follow-up com IA, editável',
      subtitle: 'Rascunho pronto para revisar e enviar.',
      points: ['Rascunho automático', 'Você aprova', 'Sem repetição']
    },
    summary: {
      title: 'Tudo em um só lugar',
      items: [
        { title: 'Conexão simples', subtitle: 'QR Code oficial em minutos.' },
        { title: 'IA treinável', subtitle: 'Respostas no tom da sua marca.' },
        { title: 'CRM inteligente', subtitle: 'Leads, follow-up e conversão.' }
      ]
    }
  },
  theme: {
    bg: '#0D1117',
    primary: '#25D366',
    accent: '#128C7E'
  },
  assets: {
    ui: {
      conexoesQrMasked: 'ui/conexoes-qr-masked.png',
      treinamentoModelo: 'ui/treinamento-modelo.png',
      crmLeads: 'ui/crm-leads.png',
      followupModal: 'ui/followup-modal.png'
    }
  }
}

const defaultHeroCapture: HeroCaptureProps = {
  src: 'captures/hero-block-raw.webm'
}

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="AdReel"
        component={AdReel}
        durationInFrames={DURATION_IN_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={defaultProps}
      />

      <Composition
        id="AdV2"
        component={AdV2}
        durationInFrames={DURATION_V2}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={defaultV2}
      />

      <Composition
        id="VSL16x9"
        component={VslHorizontal}
        durationInFrames={DURATION_VSL}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={defaultVsl}
      />

      <Composition
        id="HeroCapture9x16"
        component={HeroCapture}
        durationInFrames={DURATION_HERO_CAPTURE}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={defaultHeroCapture}
      />
    </>
  )
}
