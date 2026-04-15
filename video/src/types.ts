export type AdReelProps = {
  variantId: string
  hook: {
    line1: string
    line2: string
    sub: string
  }
  cta: {
    primary: string
    url: string
  }
  slides: string[]
  theme: {
    bg: string
    primary: string
    accent: string
  }
}

export type AdV2Props = {
  variantId: string
  script: 'A' | 'B' | 'C'
  hook: {
    line1: string
    line2: string
    sub: string
  }
  cta: {
    primary: string
    url: string
  }
  content?: {
    chat?: {
      leadText: string
      aiText: string
      badge?: string
    }
    niches?: string[]
    statBadge?: {
      value: string
      label: string
      footnote: string
    }
    hookLabel?: string
  }
  theme: {
    bg: string
    primary: string
    accent: string
  }
  assets: {
    ui: {
      signup: string
      conexoesGerarQr: string
      conexoesQrMasked: string
      conectadoMasked?: string
      iaGlobalOn: string
      treinamentoModelo: string
    }
    broll?: {
      images?: {
        bg1?: string
        bg2?: string
        bg3?: string
        iconChat?: string
        iconQr?: string
        iconClock?: string
      }
      videos?: {
        hook?: string
        motion?: string
        qr?: string
        clock?: string
      }
    }
  }
}

export type VslHorizontalProps = {
  variantId: string
  hook: {
    kicker?: string
    line1: string
    line2: string
    sub: string
  }
  cta: {
    primary: string
    url: string
  }
  content: {
    connection: {
      kicker: string
      title: string
      subtitle: string
      steps: string[]
    }
    training: {
      kicker: string
      title: string
      subtitle: string
      points?: string[]
    }
    crm: {
      kicker: string
      title: string
      subtitle: string
      points?: string[]
    }
    followup: {
      kicker: string
      title: string
      subtitle: string
      points?: string[]
    }
    summary: {
      title: string
      items: Array<{ title: string; subtitle: string }>
    }
  }
  theme: {
    bg: string
    primary: string
    accent: string
  }
  assets: {
    ui: {
      conexoesQrMasked: string
      treinamentoModelo: string
      crmLeads: string
      followupModal: string
    }
  }
}

export type HeroCaptureProps = {
  src: string
}
