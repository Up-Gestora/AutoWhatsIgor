'use client'

import { ArrowRight, Bot, CheckCircle2, Compass, MessageCircle, ShieldCheck, Sparkles, Workflow, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MARKETING_PRICING_PLANS,
  MARKETING_PRO_AI_CREDITS_TOKEN,
  PRO_AI_CREDITS_LABEL_BY_BILLING
} from '@/lib/marketing/pricing-catalog'
import type { MarketingTemplateSlideRendererProps } from '@/components/admin/marketing/templates/types'
import type { MarketingBlock, MarketingKpiStripBlock } from '@/lib/marketing/deck-types'

const DEFAULT_TITLE = 'AutoWhats: apresentação institucional em uma pagina'
const DEFAULT_SUBTITLE =
  'Plataforma SaaS para automatizar atendimento no WhatsApp com IA treinada no contexto do negócio.'
const DEFAULT_SUMMARY =
  'O sistema conecta seu número via QR Code, organiza leads no CRM, responde com IA e escala para humano quando necessário.'
const DEFAULT_CTA_LABEL = 'Começar teste grátis'
const DEFAULT_CTA_HREF = '/login?mode=signup'

const DEFAULT_FEATURES = [
  'Atendimento automático com IA por chat',
  'Treinamento com regras e base de conhecimento',
  'Escalada para humano no momento certo',
  'CRM com controle de leads e etapas',
  'Painel admin com sessões e observabilidade',
  'Sugestões de follow-up para acelerar vendas'
] as const

const DEFAULT_FLOW = ['Conectar WhatsApp', 'Treinar IA', 'Ativar operação', 'Otimizar com dados'] as const

const DEFAULT_AUDIENCE = [
  'PMEs com volume de mensagens diario',
  'Times comerciais que precisam responder rápido',
  'Operações que buscam padrao e previsibilidade'
] as const

const DEFAULT_DIFFERENTIALS = [
  'Implantação rápida (15-30 min no setup inicial)',
  'Modelo SaaS com créditos de IA',
  'Controle operacional sem depender de dev interno'
] as const

const DEFAULT_KPIS = [
  { label: 'Tempo de setup', value: '15-30 min' },
  { label: 'Disponibilidade', value: 'Atendimento 24/7' },
  { label: 'Operação', value: 'SaaS + IA + CRM' }
] as const

function getFirstBlock<T extends MarketingBlock['type']>(blocks: MarketingBlock[], type: T) {
  return blocks.find((block) => block.type === type) as Extract<MarketingBlock, { type: T }> | undefined
}

function resolvePlanPrice(plan: (typeof MARKETING_PRICING_PLANS)[number]) {
  if (plan.price) return plan.price
  if (plan.priceMonthly && plan.priceAnnual) {
    return `${plan.priceMonthly} / mes ou ${plan.priceAnnual} / ano`
  }
  if (plan.priceMonthly) return `${plan.priceMonthly} / mes`
  if (plan.priceAnnual) return `${plan.priceAnnual} / ano`
  return '-'
}

function resolvePlanFeature(feature: string) {
  if (feature === MARKETING_PRO_AI_CREDITS_TOKEN) {
    return PRO_AI_CREDITS_LABEL_BY_BILLING.monthly
  }
  return feature
}

function KpiCard({ item }: { item: { label: string; value: string } }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100/70">{item.label}</p>
      <p className="mt-1 text-sm font-bold text-white">{item.value}</p>
    </div>
  )
}

function ListItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <CheckCircle2 className="mt-[2px] h-4 w-4 shrink-0 text-emerald-300" />
      <span className="text-[12px] leading-relaxed text-gray-200/92">{text}</span>
    </li>
  )
}

function extractKpis(block?: MarketingKpiStripBlock) {
  if (!block || block.items.length === 0) {
    return DEFAULT_KPIS
  }

  return block.items.slice(0, 3).map((item) => ({
    label: item.label,
    value: item.value
  }))
}

export function InstitucionalOnepageTemplateRenderer({
  slide,
  deck,
  mode = 'preview',
  className
}: MarketingTemplateSlideRendererProps) {
  const isPreview = mode === 'preview'
  const isPrint = mode === 'print'

  const heading = getFirstBlock(slide.blocks, 'heading')
  const paragraph = getFirstBlock(slide.blocks, 'paragraph')
  const bulletList = getFirstBlock(slide.blocks, 'bullet-list')
  const cta = getFirstBlock(slide.blocks, 'cta')
  const kpi = getFirstBlock(slide.blocks, 'kpi-strip')

  const title = heading?.title?.trim() || DEFAULT_TITLE
  const subtitle = heading?.subtitle?.trim() || deck.subtitle || DEFAULT_SUBTITLE
  const summary = paragraph?.text?.trim() || DEFAULT_SUMMARY
  const ctaLabel = cta?.label?.trim() || DEFAULT_CTA_LABEL
  const ctaHref = cta?.href || DEFAULT_CTA_HREF

  const features = (bulletList?.items.length ? bulletList.items : [...DEFAULT_FEATURES]).slice(0, 6)
  const kpiItems = extractKpis(kpi)

  return (
    <article
      className={cn(
        'relative isolate overflow-hidden border border-white/10',
        isPreview ? 'aspect-video rounded-[30px] shadow-[0_35px_90px_-45px_rgba(0,0,0,0.82)]' : 'h-full w-full rounded-none',
        isPrint ? 'bg-[#0B1420]' : 'bg-[linear-gradient(145deg,#07111B_0%,#0E1726_50%,#0A1220_100%)]',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.62]"
          style={{
            background:
              'radial-gradient(900px 520px at 15% 16%, rgba(34,211,238,0.20), transparent 65%), radial-gradient(760px 460px at 84% 26%, rgba(16,185,129,0.20), transparent 62%), radial-gradient(860px 560px at 50% 88%, rgba(14,165,233,0.12), transparent 70%)'
          }}
        />
        <div className="absolute inset-0 opacity-[0.22] [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)] bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <div className="relative z-10 flex h-full flex-col p-6 lg:p-7">
        <header className="grid gap-4 xl:grid-cols-[1fr_auto]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/28 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100">
              <Compass className="h-3.5 w-3.5" />
              Apresentação institucional
            </div>
            <h2 className="mt-3 text-[clamp(1.5rem,2.6vw,2.5rem)] font-black leading-[1.02] text-white">{title}</h2>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-gray-200/84">{subtitle}</p>
          </div>

          <div className="rounded-2xl border border-white/12 bg-surface/48 px-4 py-3 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-300/72">{deck.title}</p>
            <p className="mt-1 text-sm font-bold text-white">Resumo de sistema, produto e precos</p>
          </div>
        </header>

        <div className="mt-4 grid flex-1 gap-4 xl:grid-cols-[1.12fr_0.88fr]">
          <section className="space-y-4">
            <div className="rounded-3xl border border-white/14 bg-surface/56 p-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100/88">
                <Bot className="h-3.5 w-3.5" />
                Resumao do sistema
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-200/88">{summary}</p>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {kpiItems.map((item, index) => (
                  <KpiCard key={`${item.label}-${index}`} item={item} />
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/12 bg-surface/52 p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100/85">
                <Sparkles className="h-3.5 w-3.5" />
                Funcionalidades principais
              </div>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {features.map((feature, index) => (
                  <ListItem key={`${feature}-${index}`} text={feature} />
                ))}
              </ul>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-3xl border border-white/12 bg-surface/52 p-4">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100/84">
                  <Workflow className="h-3.5 w-3.5" />
                  Fluxo recomendado
                </div>
                <ol className="space-y-2">
                  {DEFAULT_FLOW.map((step, index) => (
                    <li key={step} className="flex items-start gap-2 text-[12px] text-gray-200/90">
                      <span className="mt-[1px] inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200/30 bg-cyan-300/10 text-[10px] font-bold text-cyan-100">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </article>

              <article className="rounded-3xl border border-white/12 bg-surface/52 p-4">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100/86">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Para quem e
                </div>
                <ul className="space-y-2">
                  {DEFAULT_AUDIENCE.map((item) => (
                    <li key={item} className="text-[12px] leading-relaxed text-gray-200/90">
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </section>

          <section className="space-y-3">
            <article className="rounded-3xl border border-white/14 bg-surface/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100/86">
                <Zap className="h-3.5 w-3.5" />
                Planos e precos
              </div>

              <div className="space-y-2.5">
                {MARKETING_PRICING_PLANS.map((plan) => (
                  <div
                    key={plan.id}
                    className={cn(
                      'rounded-2xl border px-3 py-2.5',
                      plan.highlighted ? 'border-emerald-300/34 bg-emerald-300/10' : 'border-white/12 bg-white/[0.03]'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-bold text-white">{plan.name}</p>
                      <p className="text-[12px] font-semibold text-cyan-100">{resolvePlanPrice(plan)}</p>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-300/82">{plan.description}</p>
                    <p className="mt-2 text-[10px] leading-relaxed text-gray-300/75">
                      {plan.features
                        .slice(0, 2)
                        .map((feature) => resolvePlanFeature(feature))
                        .join(' | ')}
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-3xl border border-white/12 bg-surface/50 p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100/84">
                <ShieldCheck className="h-3.5 w-3.5" />
                Diferenciais
              </div>
              <ul className="space-y-2">
                {DEFAULT_DIFFERENTIALS.map((item) => (
                  <li key={item} className="text-[12px] leading-relaxed text-gray-200/90">
                    {item}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-3xl border border-emerald-300/32 bg-emerald-300/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100">Próximo passo</p>
              <p className="mt-2 text-[13px] leading-relaxed text-white">
                Validar em 7 dias com operação real e medir ganhos de tempo de resposta, follow-up e conversão.
              </p>
              <a
                href={ctaHref}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-black transition-colors hover:bg-primary-light"
              >
                {ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </a>
            </article>
          </section>
        </div>
      </div>
    </article>
  )
}
