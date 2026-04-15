'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  ArrowRight,
  Bot,
  Brain,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  Paperclip,
  QrCode,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Wand2,
  Zap
} from 'lucide-react'
import { HeroV2Visual } from '@/components/marketing-v2/hero-v2'
import type { MarketingTemplateSlideRendererProps } from '@/components/admin/marketing/templates/types'
import type {
  MarketingBlock,
  MarketingCardGridBlock,
  MarketingCardVariant,
  MarketingDeck,
  MarketingKpiStripBlock,
  MarketingSlideV2,
  MarketingStatGridBlock,
  MarketingTimelineBlock
} from '@/lib/marketing/deck-types'

type ThemeStyle = {
  frame: string
  framePrint: string
  shell: string
  shellPrint: string
  haloPrimary: string
  haloSecondary: string
  panel: string
  panelSoft: string
  panelStrong: string
  card: string
  border: string
  borderStrong: string
  heading: string
  body: string
  subtle: string
  accent: string
  badge: string
  dot: string
  line: string
  button: string
  buttonSubtle: string
}

const THEME_STYLES: Record<MarketingSlideV2['theme'], ThemeStyle> = {
  'emerald-night': {
    frame: 'bg-[linear-gradient(112deg,rgba(37,211,102,0.58),rgba(255,255,255,0.10),rgba(10,143,127,0.55))]',
    framePrint: 'bg-white/18',
    shell: 'bg-[linear-gradient(150deg,#0B1219_0%,#101A24_45%,#0A141E_100%)]',
    shellPrint: 'bg-[#101B25]',
    haloPrimary: 'bg-primary/24',
    haloSecondary: 'bg-accent-light/20',
    panel: 'bg-surface/60 backdrop-blur-md',
    panelSoft: 'bg-surface-light/40 backdrop-blur-md',
    panelStrong: 'bg-primary/12 backdrop-blur-md',
    card: 'bg-surface/66 backdrop-blur-md',
    border: 'border-white/12',
    borderStrong: 'border-primary/28',
    heading: 'text-white',
    body: 'text-gray-200/90',
    subtle: 'text-gray-300/76',
    accent: 'text-primary-light',
    badge: 'border-primary/30 bg-primary/12 text-gray-100',
    dot: 'bg-primary',
    line: 'bg-primary/34',
    button: 'bg-primary text-black hover:bg-primary-light shadow-[0_12px_32px_rgba(37,211,102,0.24)]',
    buttonSubtle: 'border-primary/30 text-gray-100 hover:bg-primary/10'
  },
  'midnight-blue': {
    frame: 'bg-[linear-gradient(112deg,rgba(103,232,249,0.46),rgba(255,255,255,0.10),rgba(37,99,235,0.38))]',
    framePrint: 'bg-white/18',
    shell: 'bg-[linear-gradient(155deg,#09111A_0%,#0F172A_52%,#10233B_100%)]',
    shellPrint: 'bg-[#111D30]',
    haloPrimary: 'bg-cyan-300/22',
    haloSecondary: 'bg-blue-300/18',
    panel: 'bg-surface/60 backdrop-blur-md',
    panelSoft: 'bg-surface-light/42 backdrop-blur-md',
    panelStrong: 'bg-cyan-300/10 backdrop-blur-md',
    card: 'bg-surface/66 backdrop-blur-md',
    border: 'border-white/12',
    borderStrong: 'border-cyan-300/30',
    heading: 'text-white',
    body: 'text-gray-200/90',
    subtle: 'text-gray-300/76',
    accent: 'text-cyan-200',
    badge: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
    dot: 'bg-cyan-200',
    line: 'bg-cyan-200/34',
    button: 'bg-primary text-black hover:bg-primary-light shadow-[0_12px_32px_rgba(37,211,102,0.24)]',
    buttonSubtle: 'border-white/22 text-gray-100 hover:bg-white/10'
  },
  'sunrise-orange': {
    frame: 'bg-[linear-gradient(112deg,rgba(251,191,36,0.48),rgba(255,255,255,0.12),rgba(249,115,22,0.42))]',
    framePrint: 'bg-white/18',
    shell: 'bg-[linear-gradient(150deg,#10131C_0%,#1A1A22_46%,#2C1E16_100%)]',
    shellPrint: 'bg-[#1E1C1B]',
    haloPrimary: 'bg-amber-300/22',
    haloSecondary: 'bg-orange-300/18',
    panel: 'bg-surface/60 backdrop-blur-md',
    panelSoft: 'bg-surface-light/40 backdrop-blur-md',
    panelStrong: 'bg-amber-300/12 backdrop-blur-md',
    card: 'bg-surface/66 backdrop-blur-md',
    border: 'border-white/12',
    borderStrong: 'border-amber-200/30',
    heading: 'text-white',
    body: 'text-gray-200/90',
    subtle: 'text-gray-300/76',
    accent: 'text-amber-200',
    badge: 'border-amber-200/30 bg-amber-300/12 text-amber-100',
    dot: 'bg-amber-200',
    line: 'bg-amber-200/34',
    button: 'bg-primary text-black hover:bg-primary-light shadow-[0_12px_32px_rgba(37,211,102,0.24)]',
    buttonSubtle: 'border-white/22 text-gray-100 hover:bg-white/10'
  },
  'ocean-cyan': {
    frame: 'bg-[linear-gradient(112deg,rgba(34,211,238,0.48),rgba(255,255,255,0.10),rgba(20,184,166,0.42))]',
    framePrint: 'bg-white/18',
    shell: 'bg-[linear-gradient(150deg,#08131A_0%,#10212A_48%,#0E1722_100%)]',
    shellPrint: 'bg-[#112029]',
    haloPrimary: 'bg-cyan-300/22',
    haloSecondary: 'bg-teal-300/18',
    panel: 'bg-surface/60 backdrop-blur-md',
    panelSoft: 'bg-surface-light/40 backdrop-blur-md',
    panelStrong: 'bg-cyan-300/11 backdrop-blur-md',
    card: 'bg-surface/66 backdrop-blur-md',
    border: 'border-white/12',
    borderStrong: 'border-cyan-200/30',
    heading: 'text-white',
    body: 'text-gray-200/90',
    subtle: 'text-gray-300/76',
    accent: 'text-cyan-100',
    badge: 'border-cyan-200/30 bg-cyan-300/10 text-cyan-100',
    dot: 'bg-cyan-200',
    line: 'bg-cyan-200/34',
    button: 'bg-primary text-black hover:bg-primary-light shadow-[0_12px_32px_rgba(37,211,102,0.24)]',
    buttonSubtle: 'border-white/22 text-gray-100 hover:bg-white/10'
  },
  'slate-premium': {
    frame: 'bg-[linear-gradient(112deg,rgba(148,163,184,0.45),rgba(255,255,255,0.12),rgba(16,185,129,0.32))]',
    framePrint: 'bg-white/18',
    shell: 'bg-[linear-gradient(155deg,#0B1118_0%,#131926_50%,#0D141D_100%)]',
    shellPrint: 'bg-[#161C25]',
    haloPrimary: 'bg-slate-300/18',
    haloSecondary: 'bg-emerald-300/14',
    panel: 'bg-surface/60 backdrop-blur-md',
    panelSoft: 'bg-surface-light/40 backdrop-blur-md',
    panelStrong: 'bg-slate-300/10 backdrop-blur-md',
    card: 'bg-surface/66 backdrop-blur-md',
    border: 'border-white/12',
    borderStrong: 'border-white/20',
    heading: 'text-white',
    body: 'text-gray-200/90',
    subtle: 'text-gray-300/76',
    accent: 'text-primary-light',
    badge: 'border-white/20 bg-white/10 text-gray-100',
    dot: 'bg-emerald-200',
    line: 'bg-white/28',
    button: 'bg-primary text-black hover:bg-primary-light shadow-[0_12px_32px_rgba(37,211,102,0.24)]',
    buttonSubtle: 'border-white/22 text-gray-100 hover:bg-white/10'
  },
  'forest-glow': {
    frame: 'bg-[linear-gradient(112deg,rgba(163,230,53,0.45),rgba(255,255,255,0.10),rgba(16,185,129,0.42))]',
    framePrint: 'bg-white/18',
    shell: 'bg-[linear-gradient(150deg,#091217_0%,#10221E_50%,#0C1A1D_100%)]',
    shellPrint: 'bg-[#12201D]',
    haloPrimary: 'bg-lime-300/20',
    haloSecondary: 'bg-emerald-300/18',
    panel: 'bg-surface/60 backdrop-blur-md',
    panelSoft: 'bg-surface-light/40 backdrop-blur-md',
    panelStrong: 'bg-emerald-300/10 backdrop-blur-md',
    card: 'bg-surface/66 backdrop-blur-md',
    border: 'border-white/12',
    borderStrong: 'border-lime-200/28',
    heading: 'text-white',
    body: 'text-gray-200/90',
    subtle: 'text-gray-300/76',
    accent: 'text-lime-100',
    badge: 'border-lime-200/30 bg-lime-300/10 text-lime-100',
    dot: 'bg-lime-100',
    line: 'bg-lime-200/32',
    button: 'bg-primary text-black hover:bg-primary-light shadow-[0_12px_32px_rgba(37,211,102,0.24)]',
    buttonSubtle: 'border-white/22 text-gray-100 hover:bg-white/10'
  }
}

type CardVariantStyle = {
  container: string
  value: string
  description: string
  marker: string
}

const CARD_VARIANT_STYLES: Record<MarketingCardVariant, CardVariantStyle> = {
  generic: {
    container: 'bg-gradient-to-b from-white/[0.08] to-transparent',
    value: 'text-base',
    description: 'text-xs',
    marker: 'from-white/45 via-white/18 to-transparent'
  },
  feature: {
    container: 'bg-gradient-to-b from-primary/14 to-transparent',
    value: 'text-base',
    description: 'text-xs',
    marker: 'from-primary/70 via-primary/22 to-transparent'
  },
  proof: {
    container: 'border-l-4 border-l-primary/55 bg-gradient-to-b from-primary/14 to-transparent',
    value: 'text-sm',
    description: 'text-[13px]',
    marker: 'from-primary/75 via-primary/20 to-transparent'
  },
  pricing: {
    container: 'bg-gradient-to-b from-primary/18 to-transparent',
    value: 'text-2xl font-black leading-tight',
    description: 'text-[11px]',
    marker: 'from-primary/75 via-primary/25 to-transparent'
  },
  comparison: {
    container: 'bg-gradient-to-b from-accent-light/16 to-transparent',
    value: 'text-lg font-bold',
    description: 'text-xs',
    marker: 'from-cyan-200/70 via-cyan-200/22 to-transparent'
  }
}

const COVER_HERO_BULLETS = [
  { icon: Zap, text: 'Respostas instantaneas com contexto' },
  { icon: Brain, text: 'Treinamento com regras e base de conhecimento' },
  { icon: LayoutDashboard, text: 'CRM + qualificação de leads' },
  { icon: CalendarCheck, text: 'Agenda e follow-up com IA' }
] as const

const COVER_DEFAULT_TITLE = 'Automatize seu WhatsApp com IA treinada no seu negócio'
const COVER_DEFAULT_SUBTITLE =
  'Conecte via QR Code, defina regras e deixe a IA responder 24 horas, 7 dias por semana. Quando não tiver certeza, ela chama um humano.'
const COVER_DEFAULT_PRIMARY_CTA = 'Teste grátis'
const COVER_DEFAULT_SECONDARY_CTA = 'Ver o produto'

function normalizeWordToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
}

function CoverTitle({ text }: { text: string }) {
  const chunks = text.split(/(\s+)/)

  return (
    <h2 className="text-[clamp(2.2rem,4.4vw,4.5rem)] font-bold leading-[1.04] text-white">
      {chunks.map((chunk, index) => {
        const token = normalizeWordToken(chunk)
        const highlighted = token === 'ia' || token === 'treinada'

        if (!highlighted) {
          return <span key={`${chunk}-${index}`}>{chunk}</span>
        }

        return (
          <span key={`${chunk}-${index}`} className="gradient-text">
            {chunk}
          </span>
        )
      })}
    </h2>
  )
}

function getFirstBlock<T extends MarketingBlock['type']>(blocks: MarketingBlock[], type: T) {
  return blocks.find((block) => block.type === type) as Extract<MarketingBlock, { type: T }> | undefined
}

function getBlocks<T extends MarketingBlock['type']>(blocks: MarketingBlock[], type: T) {
  return blocks.filter((block) => block.type === type) as Array<Extract<MarketingBlock, { type: T }>>
}

function SectionLabel({ text, theme }: { text: string; theme: ThemeStyle }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className={cn('h-px w-7', theme.line)} />
      <p className={cn('text-[10px] font-semibold uppercase tracking-[0.24em]', theme.subtle)}>{text}</p>
    </div>
  )
}

function getGridColumnsClass(columns?: 2 | 3 | 4) {
  if (columns === 2) return 'grid-cols-1 md:grid-cols-2'
  if (columns === 4) return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
  return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
}

function CardGrid({
  block,
  theme,
  className
}: {
  block?: MarketingCardGridBlock
  theme: ThemeStyle
  className?: string
}) {
  if (!block || block.items.length === 0) return null

  const variant = CARD_VARIANT_STYLES[block.variant]

  return (
    <div className={cn('space-y-3', className)}>
      {block.title ? <SectionLabel text={block.title} theme={theme} /> : null}
      <div className={cn('grid gap-3', getGridColumnsClass(block.columns))}>
        {block.items.map((item, index) => (
          <article
            key={`${item.title}-${index}`}
            className={cn(
              'relative overflow-hidden rounded-3xl border p-5',
              theme.card,
              theme.border,
              variant.container,
              item.tag ? 'ring-1 ring-primary/28' : ''
            )}
          >
            <span className={cn('pointer-events-none absolute left-0 right-0 top-0 h-px bg-gradient-to-r', variant.marker)} />

            {item.tag ? (
              <span className={cn('mb-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]', theme.badge)}>
                {item.tag}
              </span>
            ) : null}

            <p className={cn('text-sm font-bold leading-snug', theme.heading)}>{item.title}</p>
            {item.value ? <p className={cn('mt-2', theme.accent, variant.value)}>{item.value}</p> : null}
            {item.description ? <p className={cn('mt-2 leading-relaxed', theme.subtle, variant.description)}>{item.description}</p> : null}
          </article>
        ))}
      </div>
    </div>
  )
}

function StatGrid({
  block,
  theme,
  className
}: {
  block?: MarketingStatGridBlock
  theme: ThemeStyle
  className?: string
}) {
  if (!block || block.items.length === 0) return null

  const gridClass = block.items.length >= 4 ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-3'

  return (
    <div className={cn('space-y-3', className)}>
      {block.title ? <SectionLabel text={block.title} theme={theme} /> : null}
      <div className={cn('grid gap-3', gridClass)}>
        {block.items.map((item) => (
          <div key={`${item.label}-${item.value}`} className={cn('rounded-3xl border p-5', theme.panelStrong, theme.borderStrong)}>
            <span className={cn('mb-4 inline-block h-1.5 w-12 rounded-full', theme.dot)} />
            <p className={cn('text-[11px] font-semibold uppercase tracking-[0.2em]', theme.subtle)}>{item.label}</p>
            <p className={cn('mt-2 text-2xl font-black leading-tight', theme.heading)}>{item.value}</p>
            {item.note ? <p className={cn('mt-2 text-xs leading-relaxed', theme.body)}>{item.note}</p> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function Timeline({
  block,
  theme,
  className
}: {
  block?: MarketingTimelineBlock
  theme: ThemeStyle
  className?: string
}) {
  if (!block || block.steps.length === 0) return null

  return (
    <div className={cn('space-y-3', className)}>
      {block.title ? <SectionLabel text={block.title} theme={theme} /> : null}
      <div className="space-y-3">
        {block.steps.map((step, index) => (
          <div key={`${step.title}-${index}`} className="relative pl-10">
            {index < block.steps.length - 1 ? <span className={cn('absolute left-[13px] top-8 h-[calc(100%-0.3rem)] w-px', theme.line)} /> : null}
            <span className={cn('absolute left-0 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold', theme.badge)}>
              {index + 1}
            </span>
            <div className={cn('rounded-2xl border p-4', theme.panelSoft, theme.border)}>
              <p className={cn('text-sm font-semibold', theme.heading)}>{step.title}</p>
              <p className={cn('mt-1 text-xs leading-relaxed', theme.body)}>{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function KpiStrip({ block, theme, className }: { block?: MarketingKpiStripBlock; theme: ThemeStyle; className?: string }) {
  if (!block || block.items.length === 0) return null

  return (
    <div className={cn('grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3', className)}>
      {block.items.map((item) => (
        <div key={`${item.label}-${item.value}`} className={cn('rounded-2xl border px-4 py-3', theme.panelStrong, theme.borderStrong)}>
          <p className={cn('text-[10px] font-semibold uppercase tracking-[0.2em]', theme.subtle)}>{item.label}</p>
          <p className={cn('mt-1 text-sm font-bold leading-snug', theme.heading)}>{item.value}</p>
        </div>
      ))}
    </div>
  )
}

function QuotePanel({
  quote,
  theme,
  className
}: {
  quote: Extract<MarketingBlock, { type: 'quote' }>
  theme: ThemeStyle
  className?: string
}) {
  return (
    <blockquote className={cn('rounded-3xl border p-5', theme.panelStrong, theme.borderStrong, className)}>
      <p className={cn('text-base italic leading-relaxed', theme.body)}>&ldquo;{quote.quote}&rdquo;</p>
      <footer className={cn('mt-3 text-xs', theme.subtle)}>
        <span className="font-semibold">{quote.author}</span>
        {quote.role ? ` - ${quote.role}` : ''}
      </footer>
    </blockquote>
  )
}

function CtaPanel({
  cta,
  theme,
  className
}: {
  cta: Extract<MarketingBlock, { type: 'cta' }>
  theme: ThemeStyle
  className?: string
}) {
  return (
    <div className={cn('rounded-3xl border p-5', theme.panelStrong, theme.borderStrong, className)}>
      <SectionLabel text="Chamada para ação" theme={theme} />
      {cta.supportingText ? <p className={cn('text-sm leading-relaxed', theme.body)}>{cta.supportingText}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={cta.href} className={cn('inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold transition-colors', theme.button)}>
          {cta.label}
        </a>
        <span className={cn('inline-flex rounded-xl border px-3 py-2 text-xs transition-colors', theme.buttonSubtle)}>{cta.href}</span>
      </div>
    </div>
  )
}

function CoverHeroSlide({
  slide,
  mode,
  className
}: {
  slide: MarketingSlideV2
  mode: 'preview' | 'export' | 'print'
  className?: string
}) {
  const heading = getFirstBlock(slide.blocks, 'heading')
  const paragraph = getFirstBlock(slide.blocks, 'paragraph')
  const cta = getFirstBlock(slide.blocks, 'cta')

  const title = heading?.title?.trim() || COVER_DEFAULT_TITLE
  const subtitle = paragraph?.text?.trim() || heading?.subtitle?.trim() || COVER_DEFAULT_SUBTITLE
  const eyebrow = heading?.eyebrow?.trim() || 'IA de atendimento pronta para vender e agendar'
  const primaryLabel = cta?.label?.trim() || COVER_DEFAULT_PRIMARY_CTA
  const primaryHref = cta?.href || '/login?mode=signup'
  const isPreview = mode === 'preview'
  const isPrint = mode === 'print'

  return (
    <article
      className={cn(
        'relative isolate overflow-hidden border border-white/10',
        isPreview ? 'aspect-video rounded-[30px] shadow-[0_35px_90px_-45px_rgba(0,0,0,0.82)]' : 'h-full w-full rounded-none',
        isPrint ? 'bg-[#07121C]' : 'bg-[linear-gradient(145deg,#050D16_0%,#071524_44%,#041226_100%)]',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.56]"
          style={{
            background:
              'radial-gradient(1200px 620px at 22% 14%, rgba(37,211,102,0.20), transparent 62%), radial-gradient(900px 520px at 82% 26%, rgba(7,94,84,0.18), transparent 56%), radial-gradient(980px 620px at 54% 88%, rgba(52,232,121,0.10), transparent 66%)'
          }}
        />
        <div className="absolute inset-0 opacity-[0.28] [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)] bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:56px_56px]" />
      </div>

      <div className="relative z-10 flex h-full flex-col">
        <header className="flex h-16 items-center justify-between border-b border-white/6 bg-surface/58 px-5 backdrop-blur-md lg:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
              <MessageCircle className="h-5 w-5 text-black" />
            </div>
            <span className="text-xl font-bold leading-none text-white">
              Auto<span className="gradient-text">Whats</span>
            </span>
          </div>

          <nav className="hidden items-center gap-8 md:flex">
            {['Produto', 'Como funciona', 'Precos', 'FAQ'].map((item) => (
              <span key={item} className="text-base font-medium text-gray-300/82">
                {item}
              </span>
            ))}
          </nav>

          <a
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-black transition-colors hover:bg-primary-light"
          >
            Dashboard
          </a>
        </header>

        <div className="flex-1 px-5 py-6 lg:px-7 lg:py-8">
          <div className="grid h-full grid-cols-1 gap-8 lg:grid-cols-[1.03fr_0.97fr] lg:items-center">
            <div className="max-w-[760px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface/55 px-4 py-2 backdrop-blur-md">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm text-gray-300/92">{eyebrow}</span>
              </div>

              <div className="mt-5">
                <CoverTitle text={title} />
              </div>

              <p className="mt-5 max-w-3xl text-lg leading-relaxed text-gray-300/80 lg:text-xl">{subtitle}</p>

              <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                {COVER_HERO_BULLETS.map((item) => (
                  <li key={item.text} className="flex items-center gap-3 rounded-xl border border-white/8 bg-surface/42 px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                      <item.icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-medium leading-snug text-gray-200/92">{item.text}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href={primaryHref}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-lg bg-primary px-8 text-base font-semibold text-black transition-colors hover:bg-primary-light"
                >
                  {primaryLabel}
                  <ArrowRight className="h-5 w-5" />
                </a>
                <a
                  href="#produto"
                  className="inline-flex h-14 items-center justify-center rounded-lg border-2 border-primary px-8 text-base font-semibold text-primary transition-colors hover:bg-primary hover:text-black"
                >
                  {COVER_DEFAULT_SECONDARY_CTA}
                </a>
              </div>

              <p className="mt-5 flex items-center gap-2 text-sm text-gray-400">
                <Check className="h-4 w-4 text-primary" />
                Comece em minutos. Crie conta em 1 passo.
              </p>
            </div>

            <div className="relative hidden h-full items-center justify-end lg:flex">
              <div className="[&_.animate-float-slow]:!animate-none [&_.animate-shine]:!animate-none [&_.animate-typing-dot]:!animate-none">
                <HeroV2Visual
                  animatedDemo={false}
                  parallax={false}
                  reducedMotion
                  className="max-w-[700px] scale-[0.92] origin-center"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

type HomeSectionVariant =
  | 'lead-capture'
  | 'showcase'
  | 'how-it-works'
  | 'use-cases'
  | 'testimonials'
  | 'pricing'
  | 'faq'
  | 'final-cta'
  | 'footer-main'
  | 'footer-links'
  | 'footer-legal'

type HomeSectionSlideProps = {
  slide: MarketingSlideV2
  deck: MarketingDeck
  mode: 'preview' | 'export' | 'print'
  className?: string
}

const HOME_SECTION_SEQUENCE: HomeSectionVariant[] = [
  'lead-capture',
  'showcase',
  'how-it-works',
  'use-cases',
  'testimonials',
  'pricing',
  'faq',
  'final-cta',
  'footer-main',
  'footer-links',
  'footer-legal'
]

const DEFAULT_MARKETING_LINKS = ['Produto', 'Como funciona', 'Precos', 'FAQ']

function HomeSectionShell({
  mode,
  className,
  backgroundClass,
  printBackgroundClass,
  glowBackground,
  children
}: {
  mode: 'preview' | 'export' | 'print'
  className?: string
  backgroundClass: string
  printBackgroundClass: string
  glowBackground?: string
  children: ReactNode
}) {
  const isPreview = mode === 'preview'
  const isPrint = mode === 'print'

  return (
    <article
      className={cn(
        'relative isolate overflow-hidden border border-white/10',
        isPreview ? 'aspect-video rounded-[30px] shadow-[0_35px_90px_-45px_rgba(0,0,0,0.82)]' : 'h-full w-full rounded-none',
        isPrint ? printBackgroundClass : backgroundClass,
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.58]"
          style={{
            background:
              glowBackground ??
              'radial-gradient(980px 580px at 18% 20%, rgba(37,211,102,0.22), transparent 62%), radial-gradient(900px 520px at 84% 26%, rgba(7,94,84,0.18), transparent 56%), radial-gradient(980px 620px at 54% 88%, rgba(52,232,121,0.12), transparent 66%)'
          }}
        />
        <div className="absolute inset-0 opacity-[0.24] [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)] bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:56px_56px]" />
      </div>
      <div className="relative z-10 h-full">{children}</div>
    </article>
  )
}

function LeadCaptureSectionSlide({ slide, mode, className }: Omit<HomeSectionSlideProps, 'deck'>) {
  const heading = getFirstBlock(slide.blocks, 'heading')
  const paragraph = getFirstBlock(slide.blocks, 'paragraph')
  const bullets = getFirstBlock(slide.blocks, 'bullet-list')
  const stats = getFirstBlock(slide.blocks, 'stat-grid')
  const cta = getFirstBlock(slide.blocks, 'cta')

  const title = heading?.title?.trim() || 'Preencha seu WhatsApp e veja a IA em ação'
  const subtitle = paragraph?.text?.trim() || heading?.subtitle?.trim() || 'A IA responde e mostra o fluxo no proprio WhatsApp.'
  const eyebrow = heading?.eyebrow?.trim() || 'Entrada guiada'
  const buttonLabel = cta?.label?.trim() || 'Ver a IA no WhatsApp'
  const buttonHref = cta?.href || '/login?mode=signup'
  const supportingText =
    cta?.supportingText?.trim() || 'Ao enviar, o contato recebe uma mensagem de demonstração automática.'
  const highlightChips =
    bullets?.items.slice(0, 3) ?? ['Respostas com contexto', 'Qualificação de leads', 'Agendamentos e vendas']
  const statItems =
    stats?.items.slice(0, 3) ??
    [
      { label: 'Primeira resposta', value: 'em segundos', note: 'sem fila manual de atendimento' },
      { label: 'Padrão de resposta', value: '100% alinhado', note: 'com regras e tom de voz definidos' },
      { label: 'Equipe comercial', value: 'mais foco', note: 'menos tempo em perguntas repetitivas' }
    ]

  return (
    <HomeSectionShell
      mode={mode}
      className={className}
      backgroundClass="bg-[linear-gradient(145deg,#06121C_0%,#071824_45%,#091226_100%)]"
      printBackgroundClass="bg-[#0F1C2A]"
    >
      <div className="grid h-full grid-cols-1 gap-7 px-6 py-6 lg:grid-cols-[1.06fr_0.94fr] lg:px-8 lg:py-8">
        <div className="flex min-h-0 flex-col justify-between">
          <div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-surface/55 px-4 py-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm text-gray-300/92">{eyebrow}</span>
            </div>
            <h2 className="mt-5 text-[clamp(1.9rem,3.6vw,3.1rem)] font-bold leading-tight text-white">{title}</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-300/85">{subtitle}</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {highlightChips.map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-white/10 bg-surface/50 px-4 py-3 text-sm text-gray-200/88"
                >
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="leading-snug">{item}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {statItems.map((item, index) => (
              <article key={`${item.label}-${index}`} className="rounded-2xl border border-white/12 bg-surface/48 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-400">{item.label}</p>
                <p className="mt-2 text-lg font-bold leading-tight text-white">{item.value}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-300/72">{item.note || 'Indicador operacional monitorado.'}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 items-center">
          <div className="w-full rounded-[30px] border border-white/12 bg-surface-light/42 p-5 backdrop-blur-md lg:p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-300">Demonstração</p>
              <span className="rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-[11px] font-semibold text-primary">
                sem cartao
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-white/10 bg-surface/50 px-4 py-3 text-sm text-gray-400">Seu nome</div>
              <div className="rounded-xl border border-white/10 bg-surface/50 px-4 py-3 text-sm text-gray-400">
                WhatsApp com DDD
              </div>
              <div className="rounded-xl border border-white/10 bg-surface/50 px-4 py-3 text-sm text-gray-400">
                Segmento do negócio
              </div>
            </div>

            <a
              href={buttonHref}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-black transition-colors hover:bg-primary-light"
            >
              {buttonLabel}
              <Send className="h-4 w-4" />
            </a>

            <p className="mt-3 text-xs text-gray-400">{supportingText}</p>

            <div className="mt-5 rounded-2xl border border-white/10 bg-[#0B161F]/85 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Preview da conversa</p>
              <div className="mt-3 space-y-2.5">
                <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-md border border-white/10 bg-surface/50 px-3 py-2 text-xs text-gray-200/86">
                  Cliente: &ldquo;Quero saber o preco e prazo de entrega.&rdquo;
                </div>
                <div className="max-w-[90%] rounded-2xl rounded-tl-md border border-primary/22 bg-primary/12 px-3 py-2 text-xs text-gray-100">
                  IA: &ldquo;Já te explico os planos e em seguida te passo o melhor para seu volume.&rdquo;
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </HomeSectionShell>
  )
}

function ShowcaseSectionSlide({ slide, mode, className }: Omit<HomeSectionSlideProps, 'deck'>) {
  const heading = getFirstBlock(slide.blocks, 'heading')
  const paragraph = getFirstBlock(slide.blocks, 'paragraph')
  const bullets = getFirstBlock(slide.blocks, 'bullet-list')
  const cards = getFirstBlock(slide.blocks, 'card-grid')
  const quote = getFirstBlock(slide.blocks, 'quote')

  const title = heading?.title?.trim() || 'UI que faz você ganhar tempo'
  const subtitle =
    paragraph?.text?.trim() || heading?.subtitle?.trim() || 'Conecta, treina, atende, envia arquivos e organiza seu funil no mesmo lugar.'
  const eyebrow = heading?.eyebrow?.trim() || 'Plataforma'
  const fallbackCards = [
    { title: 'Conexão por QR', value: 'Pronto para operar', description: 'Sem instalação local e sem setup longo.' },
    { title: 'IA treinada', value: 'Contexto do negócio', description: 'Respostas com regras e base real da sua operação.' },
    { title: 'CRM no painel', value: 'Visão de funil', description: 'Lead, cliente e próximo passo no mesmo fluxo.' }
  ]
  const cardItems = (cards?.items.length ? cards.items : fallbackCards).slice(0, 5)
  const tabs = cardItems.map((item) => item.title).filter(Boolean)
  const tabItems = tabs.length > 0 ? tabs : ['Conexão por QR', 'Treinamento', 'Conversas', 'Arquivos', 'CRM']
  const [activeCard, ...secondaryCards] = cardItems
  const activeTitle = activeCard?.title || 'Conecte seu WhatsApp em segundos'
  const activeValue = activeCard?.value || 'Operação pronta para escalar'
  const activeDescription = activeCard?.description || 'Sem instalação. Escaneou o QR e a automação já pode operar.'
  const highlights =
    bullets?.items.slice(0, 3) ??
    ['Status em tempo real', 'Respostas com IA por chat', 'Follow-up com sugestão pronta']
  const quoteText = quote?.quote?.trim()
  const quoteAuthor = quote?.author?.trim() || 'Cliente AutoWhats'
  const quoteRole = quote?.role?.trim() || 'Operação comercial'
  const tabIcons = [QrCode, Brain, MessageSquare, Paperclip, Users] as const

  return (
    <HomeSectionShell
      mode={mode}
      className={className}
      backgroundClass="bg-[linear-gradient(145deg,#08131D_0%,#0A1A2A_46%,#0E1226_100%)]"
      printBackgroundClass="bg-[#121E2D]"
      glowBackground="radial-gradient(900px 520px at 20% 16%, rgba(34,211,238,0.22), transparent 62%), radial-gradient(860px 520px at 84% 24%, rgba(37,211,102,0.16), transparent 58%), radial-gradient(920px 620px at 52% 90%, rgba(59,130,246,0.14), transparent 66%)"
    >
      <div className="h-full px-6 py-6 lg:px-8 lg:py-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-surface/50 px-4 py-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm text-gray-300/90">{eyebrow}</span>
          </div>
          <h2 className="mt-5 text-[clamp(1.9rem,3.5vw,3rem)] font-bold leading-tight text-white">{title}</h2>
          <p className="mt-3 max-w-3xl text-base text-gray-300/84">{subtitle}</p>
        </div>

        <div className="mt-7 flex flex-wrap gap-2">
          {tabItems.map((item, index) => {
            const Icon = tabIcons[index % tabIcons.length]
            return (
              <span
                key={item}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold',
                  index === 0
                    ? 'border-primary bg-primary text-black'
                    : 'border-white/12 bg-surface/45 text-gray-200/85'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item}
              </span>
            )
          })}
        </div>

        <div className="mt-6 flex h-[calc(100%-11.75rem)] min-h-0 flex-col gap-4">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[1.04fr_0.96fr]">
            <div className="flex min-h-0 flex-col gap-4 rounded-3xl border border-white/12 bg-surface/52 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12 text-primary">
                  <QrCode className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Produto</p>
                  <p className="text-lg font-bold text-white">{activeTitle}</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-primary-light">{activeValue}</p>
              <p className="text-sm leading-relaxed text-gray-300/84">{activeDescription}</p>

              <ul className="space-y-2.5">
                {highlights.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-gray-200/88">
                    <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-lg border border-primary/18 bg-primary/12 text-primary">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="grid gap-3 sm:grid-cols-2">
                {secondaryCards.slice(0, 2).map((item, index) => (
                  <article key={`${item.title}-${index}`} className="rounded-2xl border border-white/10 bg-surface/45 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-400">
                      Pilar {index + 2}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-gray-300/78">{item.value || item.description || 'Fluxo otimizado.'}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="min-h-0 rounded-3xl border border-white/10 bg-surface/55 p-1">
              <div className="flex h-full flex-col overflow-hidden rounded-[22px] border border-white/8 bg-surface-light/35">
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
                  </div>
                  <span className="text-[11px] text-gray-300/72">Workspace AutoWhats</span>
                  <span className="w-8" />
                </div>
                <div className="flex-1 space-y-3 p-4">
                  <div className="rounded-xl border border-white/10 bg-surface/45 p-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-white">
                      <span className="inline-flex items-center gap-2">
                        <QrCode className="h-3.5 w-3.5 text-primary" />
                        Conexão ativa
                      </span>
                      <span className="rounded-full border border-primary/20 bg-primary/12 px-2 py-0.5 text-[10px] text-primary">
                        online
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-300/78">Número conectado e pronto para atendimento automático.</p>
                  </div>

                  <div className="space-y-2 rounded-xl border border-white/10 bg-[#0B141A] p-3">
                    <div className="ml-auto max-w-[86%] rounded-xl rounded-tr-md border border-white/10 bg-surface/45 px-2.5 py-2 text-xs text-gray-200/86">
                      Cliente: &ldquo;Pode agendar para quinta a tarde?&rdquo;
                    </div>
                    <div className="max-w-[90%] rounded-xl rounded-tl-md border border-primary/20 bg-primary/12 px-2.5 py-2 text-xs text-gray-100">
                      IA: &ldquo;Tenho 15:30 ou 16:00. Qual horario prefere?&rdquo;
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-surface/45 p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-white">
                      <Wand2 className="h-3.5 w-3.5 text-primary" />
                      Follow-up pronto
                    </div>
                    <p className="mt-1 text-xs text-gray-300/80">Sugestão pronta para envio com um clique no CRM.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {quoteText ? (
            <blockquote className="rounded-2xl border border-white/12 bg-surface/45 px-4 py-3">
              <p className="text-sm italic text-gray-100/95">&ldquo;{quoteText}&rdquo;</p>
              <footer className="mt-2 flex items-center gap-2 text-xs text-gray-300/72">
                <Star className="h-3.5 w-3.5 text-primary" />
                {quoteAuthor} | {quoteRole}
              </footer>
            </blockquote>
          ) : null}
        </div>
      </div>
    </HomeSectionShell>
  )
}

function HowItWorksSectionSlide({ slide, mode, className }: Omit<HomeSectionSlideProps, 'deck'>) {
  const heading = getFirstBlock(slide.blocks, 'heading')
  const paragraph = getFirstBlock(slide.blocks, 'paragraph')
  const timeline = getFirstBlock(slide.blocks, 'timeline')
  const bullets = getFirstBlock(slide.blocks, 'bullet-list')

  const title = heading?.title?.trim() || 'Como funciona na prática'
  const subtitle =
    paragraph?.text?.trim() || heading?.subtitle?.trim() || 'Fluxo curto para conectar, treinar e entrar em operação.'
  const timelineSteps =
    timeline?.steps.slice(0, 4) ??
    bullets?.items.slice(0, 4).map((item, index) => ({ title: `Passo ${index + 1}`, description: item })) ??
    []
  const steps =
    timelineSteps.length > 0
      ? timelineSteps
      : [
          { title: 'Conecte via QR', description: 'Escaneie e ative a sessão.' },
          { title: 'Treine a IA', description: 'Defina regras, contexto e limites.' },
          { title: 'Ative atendimento', description: 'A IA responde e repassa quando necessário.' },
          { title: 'Acompanhe e ajuste', description: 'Melhore conversion com dados reais.' }
        ]
  const stepIcons = [QrCode, Brain, MessageSquare, LayoutDashboard] as const

  return (
    <HomeSectionShell
      mode={mode}
      className={className}
      backgroundClass="bg-[linear-gradient(150deg,#071218_0%,#10211E_52%,#0B1A20_100%)]"
      printBackgroundClass="bg-[#12211F]"
      glowBackground="radial-gradient(920px 520px at 20% 18%, rgba(163,230,53,0.20), transparent 62%), radial-gradient(860px 520px at 80% 26%, rgba(16,185,129,0.18), transparent 58%), radial-gradient(920px 620px at 52% 92%, rgba(52,232,121,0.12), transparent 66%)"
    >
      <div className="h-full px-6 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-surface/50 px-4 py-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm text-gray-300/90">Fluxo simples</span>
          </div>
          <h2 className="mt-5 text-[clamp(1.9rem,3.6vw,3rem)] font-bold text-white">{title}</h2>
          <p className="mt-3 text-base text-gray-300/82">{subtitle}</p>
        </div>

        <div className="relative mt-8 h-[calc(100%-9.5rem)]">
          <div className="pointer-events-none absolute left-[6%] right-[6%] top-8 hidden h-px bg-gradient-to-r from-primary/60 via-primary/30 to-primary/5 lg:block" />

          <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => {
              const Icon = stepIcons[index % stepIcons.length]
              return (
                <article key={`${step.title}-${index}`} className="relative rounded-3xl border border-white/12 bg-surface/58 p-5">
                  <span className="absolute -top-3 left-5 inline-flex rounded-full bg-primary px-3 py-1 text-xs font-bold text-black">
                    Passo {index + 1}
                  </span>
                  <div className="mt-3 flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/18 bg-primary/12 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{step.title}</p>
                      <p className="mt-2 text-xs leading-relaxed text-gray-300/78">{step.description}</p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </HomeSectionShell>
  )
}

function UseCasesSectionSlide({ slide, mode, className }: Omit<HomeSectionSlideProps, 'deck'>) {
  const heading = getFirstBlock(slide.blocks, 'heading')
  const paragraph = getFirstBlock(slide.blocks, 'paragraph')
  const cards = getFirstBlock(slide.blocks, 'card-grid')

  const title = heading?.title?.trim() || 'Funciona no seu tipo de negócio'
  const subtitle =
    paragraph?.text?.trim() || heading?.subtitle?.trim() || 'Exemplos reais de conversa, qualificação e próximo passo.'
  const fallbackCases = [
    { title: 'Clinicas e serviços', description: 'Triagem inicial e agendamento automático.' },
    { title: 'E-commerce e varejo', description: 'Catalogo, pedido e condicao comercial.' },
    { title: 'Educação e infoprodutos', description: 'Qualificação e repasse para vendedor.' }
  ]
  const caseItems = (cards?.items.length ? cards.items : fallbackCases).slice(0, 3)

  return (
    <HomeSectionShell
      mode={mode}
      className={className}
      backgroundClass="bg-[linear-gradient(145deg,#07131E_0%,#0B1B2A_50%,#101525_100%)]"
      printBackgroundClass="bg-[#13202F]"
      glowBackground="radial-gradient(920px 520px at 18% 16%, rgba(37,211,102,0.18), transparent 62%), radial-gradient(880px 520px at 82% 26%, rgba(10,143,127,0.18), transparent 58%), radial-gradient(920px 620px at 50% 92%, rgba(34,211,238,0.14), transparent 66%)"
    >
      <div className="h-full px-6 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-[clamp(1.9rem,3.6vw,3rem)] font-bold text-white">{title}</h2>
          <p className="mt-3 text-base text-gray-300/82">{subtitle}</p>
        </div>

        <div className="mt-7 grid h-[calc(100%-8rem)] grid-cols-1 gap-4 lg:grid-cols-3">
          {caseItems.map((item, index) => (
            <article key={`${item.title}-${index}`} className="overflow-hidden rounded-3xl border border-white/12 bg-surface/55">
              <div className="border-b border-white/8 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/18 bg-primary/12 text-primary">
                    <LayoutDashboard className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{item.title}</p>
                    <p className="text-xs text-gray-300/72">{item.description || 'Automação com foco em conversão.'}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3 bg-[#0B141A] p-4">
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-md border border-white/8 bg-primary-dark/90 px-3 py-2 text-xs text-white">
                    Cliente: &ldquo;Pode me ajudar com isso hoje?&rdquo;
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-white/8 bg-surface-light/50 px-3 py-2 text-xs text-white">
                    IA: &ldquo;{item.description || 'Posso sim. Vou te orientar em poucos passos.'}&rdquo;
                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary">
                      <Bot className="h-3 w-3" />
                      Respondido pela IA
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </HomeSectionShell>
  )
}

function TestimonialsSectionSlide({ slide, mode, className }: Omit<HomeSectionSlideProps, 'deck'>) {
  const heading = getFirstBlock(slide.blocks, 'heading')
  const paragraph = getFirstBlock(slide.blocks, 'paragraph')
  const quote = getFirstBlock(slide.blocks, 'quote')
  const cards = getFirstBlock(slide.blocks, 'card-grid')
  const stats = getFirstBlock(slide.blocks, 'stat-grid')

  const title = heading?.title?.trim() || 'Empresas que já automatizaram'
  const subtitle = paragraph?.text?.trim() || heading?.subtitle?.trim() || 'Resultados reais em operações com WhatsApp.'

  const testimonialItems: Array<{ name: string; role: string; text: string; metric: string }> = []
  if (quote) {
    testimonialItems.push({
      name: quote.author,
      role: quote.role || 'Cliente AutoWhats',
      text: quote.quote,
      metric: stats?.items[0]?.value || 'Resultado medido'
    })
  }

  for (const item of cards?.items ?? []) {
    testimonialItems.push({
      name: item.title,
      role: item.tag || 'Operação ativa',
      text: item.description || item.value || 'Uso diario com mais velocidade e controle.',
      metric: item.value || stats?.items[testimonialItems.length]?.value || 'Ganho real'
    })
  }

  const list = testimonialItems.length
    ? testimonialItems.slice(0, 3)
    : [
        {
          name: 'Operação Comercial',
          role: 'Cliente AutoWhats',
          text: 'A equipe ganhou velocidade sem perder padrão.',
          metric: '-32% tempo de resposta'
        },
        {
          name: 'Coordenação de Atendimento',
          role: 'PME digital',
          text: 'Mais mensagens respondidas com o mesmo time.',
          metric: '+18% conversão'
        },
        {
          name: 'Gestão de Vendas',
          role: 'Servico recorrente',
          text: 'Follow-up consistente e menos oportunidade perdida.',
          metric: '+4h/dia economizadas'
        }
      ]

  return (
    <HomeSectionShell
      mode={mode}
      className={className}
      backgroundClass="bg-[linear-gradient(150deg,#08131D_0%,#0F1A26_50%,#0D1520_100%)]"
      printBackgroundClass="bg-[#142130]"
    >
      <div className="h-full px-6 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-surface/50 px-4 py-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm text-gray-300/90">Depoimentos reais</span>
          </div>
          <h2 className="mt-5 text-[clamp(1.9rem,3.5vw,2.9rem)] font-bold text-white">{title}</h2>
          <p className="mt-3 text-base text-gray-300/82">{subtitle}</p>
        </div>

        <div className="mt-7 grid h-[calc(100%-9rem)] grid-cols-1 gap-4 md:grid-cols-12">
          {list.map((item, index) => (
            <article
              key={`${item.name}-${index}`}
              className={cn(
                'rounded-3xl border border-white/12 bg-surface/60 p-5',
                index === 0 ? 'md:col-span-5' : index === 1 ? 'md:col-span-4' : 'md:col-span-3'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-primary">
                  {Array.from({ length: 5 }).map((_, starIndex) => (
                    <Star key={starIndex} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                  {item.metric}
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-gray-200/88">&ldquo;{item.text}&rdquo;</p>
              <div className="mt-5">
                <p className="text-sm font-semibold text-white">{item.name}</p>
                <p className="text-xs text-gray-400">{item.role}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </HomeSectionShell>
  )
}

function PricingSectionSlide({ slide, mode, className }: Omit<HomeSectionSlideProps, 'deck'>) {
  const heading = getFirstBlock(slide.blocks, 'heading')
  const paragraph = getFirstBlock(slide.blocks, 'paragraph')
  const cards = getFirstBlock(slide.blocks, 'card-grid')
  const bullets = getFirstBlock(slide.blocks, 'bullet-list')
  const cta = getFirstBlock(slide.blocks, 'cta')

  const title = heading?.title?.trim() || 'Preços para cada necessidade'
  const subtitle =
    paragraph?.text?.trim() || heading?.subtitle?.trim() || 'Comece no teste e escale conforme o volume de atendimento.'
  const planItems = (cards?.items.length ? cards.items : []).slice(0, 3)
  const plans =
    planItems.length > 0
      ? planItems
      : [
          { title: 'Starter', value: 'Teste grátis', description: 'Validação inicial do fluxo' },
          { title: 'Pro', value: 'R$ 297 / mês', description: 'Operação com IA e funil completo', tag: 'Mais popular' },
          { title: 'Scale', value: 'Sob consulta', description: 'Volume alto e governança avançada' }
        ]
  const highlightedPlanIndex = plans.findIndex((plan) => Boolean(plan.tag))
  const features = bullets?.items.slice(0, 4) ?? ['Conexão via QR', 'Treinamento da IA', 'CRM com status', 'Follow-up sugerido']
  const ctaLabel = cta?.label?.trim() || 'Iniciar teste gratuito'
  const ctaHref = cta?.href || '/login?mode=signup'

  return (
    <HomeSectionShell
      mode={mode}
      className={className}
      backgroundClass="bg-[linear-gradient(145deg,#07131B_0%,#10202A_48%,#141B25_100%)]"
      printBackgroundClass="bg-[#162431]"
      glowBackground="radial-gradient(920px 520px at 18% 16%, rgba(37,211,102,0.22), transparent 62%), radial-gradient(860px 520px at 82% 26%, rgba(251,191,36,0.16), transparent 58%), radial-gradient(920px 620px at 50% 92%, rgba(10,143,127,0.14), transparent 66%)"
    >
      <div className="h-full px-6 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-surface/50 px-4 py-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm text-gray-300/90">Planos e valores</span>
          </div>
          <h2 className="mt-5 text-[clamp(1.9rem,3.5vw,2.9rem)] font-bold text-white">{title}</h2>
          <p className="mt-3 text-base text-gray-300/82">{subtitle}</p>
        </div>

        <div className="mt-7 grid h-[calc(100%-9rem)] grid-cols-1 gap-4 md:grid-cols-3">
          {plans.map((plan, index) => (
            <article
              key={`${plan.title}-${index}`}
              className={cn(
                'relative rounded-3xl border p-5',
                index === highlightedPlanIndex
                  ? 'border-primary/40 bg-gradient-to-b from-primary/10 to-surface/58'
                  : 'border-white/12 bg-surface/58'
              )}
            >
              {index === highlightedPlanIndex ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-black">
                  Mais popular
                </span>
              ) : null}

              <p className="text-sm font-semibold text-gray-200/90">{plan.title}</p>
              <p className="mt-3 text-2xl font-black text-white">{plan.value || '--'}</p>
              <p className="mt-2 text-xs text-gray-300/74">{plan.description || 'Plano flexível para o seu estágio.'}</p>
            </article>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/12 bg-surface/58 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {features.map((feature) => (
              <span key={feature} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-light/35 px-3 py-1.5 text-[11px] text-gray-200/85">
                <Check className="h-3.5 w-3.5 text-primary" />
                {feature}
              </span>
            ))}
          </div>
          <a href={ctaHref} className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-black transition-colors hover:bg-primary-light">
            {ctaLabel}
          </a>
        </div>
      </div>
    </HomeSectionShell>
  )
}

function FaqSectionSlide({ slide, mode, className }: Omit<HomeSectionSlideProps, 'deck'>) {
  const heading = getFirstBlock(slide.blocks, 'heading')
  const paragraph = getFirstBlock(slide.blocks, 'paragraph')
  const cards = getFirstBlock(slide.blocks, 'card-grid')
  const bullets = getFirstBlock(slide.blocks, 'bullet-list')

  const title = heading?.title?.trim() || 'Perguntas frequentes'
  const subtitle = paragraph?.text?.trim() || heading?.subtitle?.trim() || 'Tudo que precisa para decidir com seguranca.'

  const faqItemsFromCards =
    cards?.items.map((item) => ({
      q: item.title,
      a: item.description || item.value || 'A configuração e totalmente controlada por regras e contexto.'
    })) ?? []

  const faqItems =
    faqItemsFromCards.length > 0
      ? faqItemsFromCards
      : (bullets?.items.map((item) => ({
          q: item,
          a: paragraph?.text || 'Você controla o comportamento da IA e quando repassar para humano.'
        })) ?? [])

  const list =
    faqItems.length > 0
      ? faqItems.slice(0, 6)
      : [
          {
            q: 'A IA responde tudo sozinha?',
            a: 'Ela responde o que estiver dentro das regras e chama humano quando necessário.'
          },
          {
            q: 'Consigo controlar as respostas?',
            a: 'Sim. Você define regras, contexto e limites por operação.'
          },
          {
            q: 'Quanto tempo para configurar?',
            a: 'Normalmente minutos: conecta via QR, treina e ativa.'
          },
          {
            q: 'Tem custo por uso?',
            a: 'Sim, o modelo combina assinatura e créditos conforme volume.'
          }
        ]

  return (
    <HomeSectionShell
      mode={mode}
      className={className}
      backgroundClass="bg-[linear-gradient(145deg,#08141E_0%,#0D1D29_48%,#101625_100%)]"
      printBackgroundClass="bg-[#142130]"
    >
      <div className="h-full px-6 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-[clamp(1.9rem,3.5vw,2.9rem)] font-bold text-white">{title}</h2>
          <p className="mt-3 text-base text-gray-300/82">{subtitle}</p>
        </div>

        <div className="mt-7 grid h-[calc(100%-8rem)] grid-cols-1 gap-4 md:grid-cols-2">
          {list.map((item, index) => (
            <article key={`${item.q}-${index}`} className="rounded-2xl border border-white/12 bg-surface/58 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/18 bg-primary/12 text-primary">
                    <HelpCircle className="h-4 w-4" />
                  </span>
                  <p className="text-sm font-semibold text-white">{item.q}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-gray-300/80">{item.a}</p>
            </article>
          ))}
        </div>
      </div>
    </HomeSectionShell>
  )
}

function FinalCtaSectionSlide({ slide, mode, className }: Omit<HomeSectionSlideProps, 'deck'>) {
  const heading = getFirstBlock(slide.blocks, 'heading')
  const paragraph = getFirstBlock(slide.blocks, 'paragraph')
  const cta = getFirstBlock(slide.blocks, 'cta')

  const title = heading?.title?.trim() || 'Coloque sua IA para trabalhar hoje'
  const subtitle =
    paragraph?.text?.trim() || heading?.subtitle?.trim() || 'Conecte via QR, treine no seu negócio e evite perda de resposta.'
  const ctaLabel = cta?.label?.trim() || 'Teste grátis'
  const ctaHref = cta?.href || '/login?mode=signup'

  return (
    <HomeSectionShell
      mode={mode}
      className={className}
      backgroundClass="bg-[linear-gradient(145deg,#07111A_0%,#091A28_48%,#081226_100%)]"
      printBackgroundClass="bg-[#111E2E]"
      glowBackground="radial-gradient(900px 500px at 20% 30%, rgba(37,211,102,0.25), transparent 60%), radial-gradient(700px 420px at 80% 40%, rgba(7,94,84,0.22), transparent 60%), radial-gradient(900px 600px at 50% 100%, rgba(52,232,121,0.12), transparent 65%)"
    >
      <div className="flex h-full items-center px-6 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-4xl rounded-[2rem] border border-white/12 bg-surface/62 px-7 py-10 text-center backdrop-blur-md lg:px-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-surface-light/35 px-4 py-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm text-gray-300/90">Pronto para começar?</span>
          </div>

          <h2 className="mt-5 text-[clamp(2rem,4vw,3.4rem)] font-bold leading-tight text-white">{title}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-gray-300/82">{subtitle}</p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={ctaHref}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-sm font-semibold text-black transition-colors hover:bg-primary-light"
            >
              {ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </a>
            <a href="/login" className="inline-flex h-12 items-center justify-center rounded-xl border border-white/14 px-7 text-sm font-semibold text-gray-100 hover:bg-white/10">
              Fazer login
            </a>
          </div>

          <p className="mt-5 inline-flex items-center gap-2 text-sm text-gray-400">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Sem compromisso inicial. Cancelamento simples.
          </p>
        </div>
      </div>
    </HomeSectionShell>
  )
}

function FooterMainSectionSlide({ slide, deck, mode, className }: HomeSectionSlideProps) {
  const paragraph = getFirstBlock(slide.blocks, 'paragraph')
  const bullets = getFirstBlock(slide.blocks, 'bullet-list')
  const cta = getFirstBlock(slide.blocks, 'cta')

  const links = (bullets?.items.length ? bullets.items : DEFAULT_MARKETING_LINKS).slice(0, 6)
  const brandCopy =
    paragraph?.text?.trim() || 'WhatsApp com IA treinada no seu negócio para mais velocidade e previsibilidade.'
  const ctaLabel = cta?.label?.trim() || 'Teste grátis'
  const ctaHref = cta?.href || '/login?mode=signup'

  return (
    <HomeSectionShell
      mode={mode}
      className={className}
      backgroundClass="bg-[linear-gradient(145deg,#09121C_0%,#111827_50%,#0E1521_100%)]"
      printBackgroundClass="bg-[#171F2D]"
      glowBackground="radial-gradient(820px 480px at 15% 15%, rgba(37,211,102,0.16), transparent 62%), radial-gradient(820px 480px at 85% 25%, rgba(56,189,248,0.14), transparent 58%)"
    >
      <div className="flex h-full flex-col justify-between px-6 py-6 lg:px-8 lg:py-8">
        <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
                <MessageCircle className="h-5 w-5 text-black" />
              </div>
              <span className="text-2xl font-bold text-white">
                Auto<span className="gradient-text">Whats</span>
              </span>
            </div>
            <p className="mt-4 max-w-md text-sm text-gray-300/78">{brandCopy}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-gray-500">{deck.title}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <span key={link} className="rounded-full border border-white/12 bg-surface/50 px-3 py-1.5 text-xs text-gray-200/88">
                {link}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
          <p className="text-xs text-gray-400">Copyright {new Date().getFullYear()} AutoWhats. Todos os direitos reservados.</p>
          <a href={ctaHref} className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-black transition-colors hover:bg-primary-light">
            {ctaLabel}
          </a>
        </div>
      </div>
    </HomeSectionShell>
  )
}

function FooterLinksSectionSlide({ slide, mode, className }: Omit<HomeSectionSlideProps, 'deck'>) {
  const heading = getFirstBlock(slide.blocks, 'heading')
  const cards = getFirstBlock(slide.blocks, 'card-grid')
  const bullets = getFirstBlock(slide.blocks, 'bullet-list')

  const title = heading?.title?.trim() || 'Mapa rápido de navegação'
  const groups = cards?.items.slice(0, 4) ?? []
  const fallbackGroups = [
    { title: 'Produto', description: 'Showcase, automação e CRM' },
    { title: 'Operação', description: 'Como funciona e fluxo de implantação' },
    { title: 'Comercial', description: 'Planos, ROI e casos de uso' },
    { title: 'Suporte', description: 'FAQ e canais de contato' }
  ]
  const columns = groups.length > 0 ? groups : fallbackGroups
  const chips = (bullets?.items.length ? bullets.items : DEFAULT_MARKETING_LINKS).slice(0, 6)

  return (
    <HomeSectionShell
      mode={mode}
      className={className}
      backgroundClass="bg-[linear-gradient(145deg,#08111A_0%,#111A28_52%,#111423_100%)]"
      printBackgroundClass="bg-[#18202E]"
    >
      <div className="h-full px-6 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-[clamp(1.8rem,3.2vw,2.6rem)] font-bold text-white">{title}</h2>
          <p className="mt-3 text-sm text-gray-300/78">Estrutura de links e blocos inspirada no footer da home.</p>
        </div>

        <div className="mt-7 grid h-[calc(100%-8.5rem)] grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {columns.map((item, index) => (
            <article key={`${item.title}-${index}`} className="rounded-2xl border border-white/12 bg-surface/58 p-4">
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="mt-2 text-xs leading-relaxed text-gray-300/78">{item.description || 'Bloco navegavel da home.'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {chips.slice(index, index + 2).map((chip) => (
                  <span key={`${item.title}-${chip}`} className="rounded-full border border-white/10 bg-surface-light/30 px-2.5 py-1 text-[10px] text-gray-300/84">
                    {chip}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </HomeSectionShell>
  )
}

function FooterLegalSectionSlide({ deck, mode, className }: Pick<HomeSectionSlideProps, 'deck' | 'mode' | 'className'>) {
  return (
    <HomeSectionShell
      mode={mode}
      className={className}
      backgroundClass="bg-[linear-gradient(145deg,#080F17_0%,#0F1724_50%,#0C111B_100%)]"
      printBackgroundClass="bg-[#151E2A]"
      glowBackground="radial-gradient(860px 500px at 20% 20%, rgba(37,211,102,0.16), transparent 62%), radial-gradient(860px 520px at 80% 28%, rgba(14,165,233,0.12), transparent 58%)"
    >
      <div className="flex h-full flex-col justify-between px-6 py-6 lg:px-8 lg:py-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Fechamento</p>
          <h2 className="mt-3 text-[clamp(1.8rem,3.2vw,2.6rem)] font-bold text-white">Footer + contato rápido</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-300/78">
            Último slide inspirado no fim da home: informações legais, marca e acesso rápido ao WhatsApp.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2 text-sm text-gray-300/78">
            <p>{deck.title}</p>
            <p>Copyright {new Date().getFullYear()} AutoWhats. Todos os direitos reservados.</p>
            <p>Feito no Brasil.</p>
          </div>

          <a
            href="https://wa.me/"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-black shadow-[0_12px_26px_rgba(37,211,102,0.25)] transition-colors hover:bg-primary-light"
          >
            <MessageCircle className="h-4 w-4" />
            Falar no WhatsApp
          </a>
        </div>
      </div>
    </HomeSectionShell>
  )
}

function HomeSectionSlideByVariant({
  variant,
  slide,
  deck,
  mode,
  className
}: HomeSectionSlideProps & {
  variant: HomeSectionVariant
}) {
  switch (variant) {
    case 'lead-capture':
      return <LeadCaptureSectionSlide slide={slide} mode={mode} className={className} />
    case 'showcase':
      return <ShowcaseSectionSlide slide={slide} mode={mode} className={className} />
    case 'how-it-works':
      return <HowItWorksSectionSlide slide={slide} mode={mode} className={className} />
    case 'use-cases':
      return <UseCasesSectionSlide slide={slide} mode={mode} className={className} />
    case 'testimonials':
      return <TestimonialsSectionSlide slide={slide} mode={mode} className={className} />
    case 'pricing':
      return <PricingSectionSlide slide={slide} mode={mode} className={className} />
    case 'faq':
      return <FaqSectionSlide slide={slide} mode={mode} className={className} />
    case 'final-cta':
      return <FinalCtaSectionSlide slide={slide} mode={mode} className={className} />
    case 'footer-main':
      return <FooterMainSectionSlide slide={slide} deck={deck} mode={mode} className={className} />
    case 'footer-links':
      return <FooterLinksSectionSlide slide={slide} mode={mode} className={className} />
    case 'footer-legal':
      return <FooterLegalSectionSlide deck={deck} mode={mode} className={className} />
    default:
      return null
  }
}

function renderByLayout(slide: MarketingSlideV2, theme: ThemeStyle) {
  const heading = getFirstBlock(slide.blocks, 'heading')
  const paragraph = getFirstBlock(slide.blocks, 'paragraph')
  const bullets = getFirstBlock(slide.blocks, 'bullet-list')
  const stats = getFirstBlock(slide.blocks, 'stat-grid')
  const cards = getFirstBlock(slide.blocks, 'card-grid')
  const timeline = getFirstBlock(slide.blocks, 'timeline')
  const quote = getFirstBlock(slide.blocks, 'quote')
  const cta = getFirstBlock(slide.blocks, 'cta')
  const kpi = getFirstBlock(slide.blocks, 'kpi-strip')
  const extraCardBlocks = getBlocks(slide.blocks, 'card-grid').slice(1)

  const headingTitle = heading?.title ?? slide.title
  const headingSubtitle = heading?.subtitle

  const commonHeading = (
    <div className="space-y-3">
      {heading?.eyebrow ? (
        <span className={cn('inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]', theme.badge)}>
          {heading.eyebrow}
        </span>
      ) : null}
      <h2 className={cn('text-[clamp(2rem,3.8vw,3.6rem)] font-black leading-[0.98] tracking-tight', theme.heading)}>{headingTitle}</h2>
      {headingSubtitle ? <p className={cn('max-w-3xl text-base leading-relaxed lg:text-lg', theme.body)}>{headingSubtitle}</p> : null}
    </div>
  )

  const bulletList =
    bullets && bullets.items.length > 0 ? (
      <div className={cn('rounded-3xl border p-5', theme.panel, theme.border)}>
        {bullets.title ? <SectionLabel text={bullets.title} theme={theme} /> : null}
        <ul className="space-y-2.5">
          {bullets.items.map((item) => (
            <li key={item} className={cn('flex items-start gap-2.5 text-sm leading-relaxed', theme.body)}>
              <span className={cn('mt-[7px] inline-block h-2 w-2 shrink-0 rounded-full', theme.dot)} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    ) : null

  const paragraphBlock = paragraph ? (
    <div className={cn('rounded-3xl border p-5 text-sm leading-relaxed lg:text-base', theme.panelSoft, theme.border, theme.body)}>
      {paragraph.text}
    </div>
  ) : null

  const quoteBlock = quote ? <QuotePanel quote={quote} theme={theme} /> : null
  const ctaBlock = cta ? <CtaPanel cta={cta} theme={theme} /> : null

  const hasRenderableContent = Boolean(paragraphBlock || bulletList || cards || stats || timeline || quoteBlock || ctaBlock || kpi)

  if (!hasRenderableContent) {
    return (
      <div className="space-y-4">
        {commonHeading}
        <div className={cn('rounded-3xl border p-5 text-sm', theme.panel, theme.border, theme.subtle)}>
          Não ha conteudo visivel configurado para este slide.
        </div>
      </div>
    )
  }

  switch (slide.layout) {
    case 'hero-split':
      return (
        <div className="grid h-full gap-5 xl:grid-cols-[1.12fr_0.88fr]">
          <div className="flex flex-col justify-between gap-5">
            <div className="space-y-5">
              {commonHeading}
              {paragraphBlock}
            </div>
            <div className="space-y-3">
              <KpiStrip block={kpi} theme={theme} />
              {ctaBlock}
            </div>
          </div>
          <div className="space-y-4">
            <CardGrid block={cards} theme={theme} />
            {quoteBlock}
            {!quoteBlock ? <StatGrid block={stats} theme={theme} /> : null}
          </div>
        </div>
      )
    case 'problem-impact':
      return (
        <div className="space-y-5">
          {commonHeading}
          <div className="grid gap-4 xl:grid-cols-[1.06fr_0.94fr]">
            <div className="space-y-4">
              {bulletList}
              {paragraphBlock}
            </div>
            <div className="space-y-4">
              <StatGrid block={stats} theme={theme} />
              {quoteBlock}
            </div>
          </div>
          {ctaBlock}
        </div>
      )
    case 'solution-proof':
      return (
        <div className="space-y-5">
          {commonHeading}
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <CardGrid block={cards} theme={theme} />
              {extraCardBlocks.map((extra) => (
                <CardGrid key={extra.id} block={extra} theme={theme} />
              ))}
            </div>
            <div className="space-y-4">
              {paragraphBlock}
              {bulletList}
              {quoteBlock}
              {ctaBlock}
            </div>
          </div>
        </div>
      )
    case 'flow-diagram':
      return (
        <div className="space-y-5">
          {commonHeading}
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              {timeline ? <Timeline block={timeline} theme={theme} /> : bulletList}
              {!timeline ? <CardGrid block={cards} theme={theme} /> : null}
            </div>
            <div className="space-y-4">
              {paragraphBlock}
              <StatGrid block={stats} theme={theme} />
              <KpiStrip block={kpi} theme={theme} />
              {ctaBlock}
            </div>
          </div>
        </div>
      )
    case 'feature-masonry':
      return (
        <div className="space-y-5">
          {commonHeading}
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <CardGrid block={cards} theme={theme} />
              {extraCardBlocks.map((extra) => (
                <CardGrid key={extra.id} block={extra} theme={theme} />
              ))}
            </div>
            <div className="space-y-4">
              {bulletList}
              {paragraphBlock}
              <StatGrid block={stats} theme={theme} />
              {quoteBlock}
              {ctaBlock}
            </div>
          </div>
        </div>
      )
    case 'results-dashboard':
      return (
        <div className="space-y-5">
          {commonHeading}
          <StatGrid block={stats} theme={theme} />
          <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
            <CardGrid block={cards} theme={theme} />
            <div className="space-y-4">
              {bulletList}
              {paragraphBlock}
              {quoteBlock}
              {ctaBlock}
            </div>
          </div>
        </div>
      )
    case 'cases-grid':
      return (
        <div className="space-y-5">
          {commonHeading}
          <CardGrid block={cards} theme={theme} />
          <div className="grid gap-4 xl:grid-cols-2">
            {bulletList}
            {paragraphBlock}
          </div>
          {ctaBlock}
        </div>
      )
    case 'pricing-spotlight':
      return (
        <div className="space-y-5">
          {commonHeading}
          <CardGrid block={cards} theme={theme} />
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              {bulletList}
              {paragraphBlock}
            </div>
            <div className="space-y-4">
              <KpiStrip block={kpi} theme={theme} />
              {quoteBlock}
              {ctaBlock}
            </div>
          </div>
        </div>
      )
    case 'roi-focus':
      return (
        <div className="space-y-5">
          {commonHeading}
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              {paragraphBlock}
              <StatGrid block={stats} theme={theme} />
              {bulletList}
            </div>
            <div className="space-y-4">
              <CardGrid block={cards} theme={theme} />
              {quoteBlock}
              {ctaBlock}
            </div>
          </div>
        </div>
      )
    case 'objection-comparison':
      return (
        <div className="space-y-5">
          {commonHeading}
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <CardGrid block={cards} theme={theme} />
            <div className="space-y-4">
              {bulletList}
              {paragraphBlock}
              {quoteBlock}
              {ctaBlock}
            </div>
          </div>
        </div>
      )
    case 'timeline-roadmap':
      return (
        <div className="space-y-5">
          {commonHeading}
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">{timeline ? <Timeline block={timeline} theme={theme} /> : <CardGrid block={cards} theme={theme} />}</div>
            <div className="space-y-4">
              <KpiStrip block={kpi} theme={theme} />
              {paragraphBlock}
              {bulletList}
              {ctaBlock}
            </div>
          </div>
        </div>
      )
    case 'final-offer':
      return (
        <div className="flex h-full flex-col justify-center">
          <div className="mx-auto w-full max-w-4xl space-y-5 text-center">
            <div className="space-y-4">{commonHeading}</div>
            <div className="grid gap-4 text-left xl:grid-cols-2">
              {bulletList}
              {paragraphBlock}
            </div>
            <div className="mx-auto w-full max-w-3xl">
              <CardGrid block={cards} theme={theme} />
            </div>
            <div className="mx-auto w-full max-w-2xl">{quoteBlock}</div>
            <div className="mx-auto w-full max-w-2xl">{ctaBlock}</div>
          </div>
        </div>
      )
    default:
      return (
        <div className="space-y-5">
          {commonHeading}
          {paragraphBlock}
          {bulletList}
          <CardGrid block={cards} theme={theme} />
          <StatGrid block={stats} theme={theme} />
          <Timeline block={timeline} theme={theme} />
          {quoteBlock}
          {ctaBlock}
        </div>
      )
  }
}

export function HomeV2TemplateRenderer({
  slide,
  deck,
  slideIndex,
  totalSlides,
  mode = 'preview',
  className
}: MarketingTemplateSlideRendererProps) {
  const theme = THEME_STYLES[slide.theme]
  const isPreview = mode === 'preview'
  const isPrint = mode === 'print'
  const progress = totalSlides > 0 ? ((slideIndex + 1) / totalSlides) * 100 : 0

  if (slide.key === 'cover') {
    return <CoverHeroSlide slide={slide} mode={mode} className={className} />
  }

  const homeSectionVariant = HOME_SECTION_SEQUENCE[Math.max(slideIndex - 1, 0)]
  if (homeSectionVariant) {
    return (
      <HomeSectionSlideByVariant
        variant={homeSectionVariant}
        slide={slide}
        deck={deck}
        mode={mode}
        className={className}
      />
    )
  }

  return (
    <article
      className={cn(
        'relative isolate overflow-hidden p-[1px]',
        isPreview ? 'aspect-video rounded-[30px] shadow-[0_35px_90px_-45px_rgba(0,0,0,0.8)]' : 'h-full w-full rounded-none',
        isPrint ? theme.framePrint : theme.frame,
        className
      )}
    >
      <div
        className={cn(
          'relative h-full overflow-hidden',
          isPreview ? 'rounded-[29px] border border-white/5' : 'rounded-none',
          isPrint ? theme.shellPrint : theme.shell
        )}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className={cn('absolute -right-20 -top-20 h-72 w-72 rounded-full blur-3xl', theme.haloPrimary)} />
          <div className={cn('absolute -bottom-24 -left-16 h-80 w-80 rounded-full blur-3xl', theme.haloSecondary)} />
          <div className="absolute inset-0 opacity-[0.28] [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)] bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:56px_56px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] via-transparent to-black/30" />
        </div>

        <div className="relative z-10 flex h-full flex-col p-6 lg:p-8">
          <header className="mb-5 flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className={cn('inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]', theme.badge)}>
                {deck.title}
              </p>
              <p className={cn('max-w-2xl text-xs leading-relaxed lg:text-sm', theme.subtle)}>{deck.subtitle}</p>
            </div>
            <div className={cn('rounded-2xl border px-3 py-2 text-right', theme.panelSoft, theme.border)}>
              <p className={cn('text-[10px] font-semibold uppercase tracking-[0.22em]', theme.subtle)}>Slide</p>
              <p className={cn('text-sm font-bold leading-tight', theme.heading)}>
                {slideIndex + 1}
                <span className={cn('ml-1 text-xs font-medium', theme.subtle)}>/ {totalSlides}</span>
              </p>
            </div>
          </header>

          <div className="flex-1">{renderByLayout(slide, theme)}</div>

          <footer className="mt-5 space-y-2">
            <div className={cn('h-1.5 overflow-hidden rounded-full border bg-surface-light/35', theme.border)}>
              <div className={cn('h-full rounded-full', theme.dot)} style={{ width: `${progress}%` }} />
            </div>
            <p className={cn('text-[10px] font-semibold uppercase tracking-[0.22em]', theme.subtle)}>{slide.title}</p>
          </footer>
        </div>
      </div>
    </article>
  )
}

