'use client'

import { useEffect } from 'react'
import { Check, Clock, Sparkles } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Reveal, useInViewOnce } from '@/components/marketing-v2/reveal'
import { trackCustom } from '@/lib/metaPixel'
import { MARKETING_PRICING_PLANS } from '@/lib/marketing/pricing-catalog'

export function PrecosV2() {
  const { ref, inView } = useInViewOnce<HTMLElement>({
    rootMargin: '0px 0px -25% 0px',
    threshold: 0.2
  })

  useEffect(() => {
    if (!inView) return
    trackCustom('LandingV2_Pricing_View')
  }, [inView])

  const handlePrimaryCta = (location: string) => {
    trackCustom('LandingV2_CTA_Primary_Click', { location })
  }

  return (
    <section id="precos" className="py-24 relative scroll-mt-24" ref={ref}>
      <div className="container mx-auto px-4 relative z-10">
        <Reveal>
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface/50 border border-white/10 backdrop-blur-md mb-6">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-sm text-gray-300/90">Planos e valores</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">
              Preços para cada <span className="gradient-text">necessidade</span>
            </h2>
            <p className="text-gray-300/80 max-w-2xl mx-auto mt-3">
              Modelo pay-per-use: você adiciona créditos e paga somente o consumo da IA por mensagem enviada.
            </p>
          </div>
        </Reveal>

        <div className="mb-6 rounded-2xl border border-primary/25 bg-primary/10 p-4 text-sm text-primary">
          No plano Básico não há mensalidade fixa. No Enterprise, a mensalidade é de R$ 300,00 e a IA passa de R$ 0,15 para R$ 0,05 por mensagem.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {MARKETING_PRICING_PLANS.map((plan, index) => (
            <Reveal key={plan.id} delayMs={index * 120} className="h-full">
              <div
                className={cn(
                  'relative rounded-3xl p-8 border h-full flex flex-col',
                  plan.highlighted
                    ? 'bg-gradient-to-b from-primary/10 to-surface/60 border-primary/40'
                    : 'bg-surface/55 border-white/10'
                )}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-black font-bold text-sm px-4 py-1 rounded-full">
                    Mais popular
                  </div>
                )}

                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-light/30 border border-white/10 text-[11px] text-gray-200/80">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    {plan.name}
                  </div>
                  <p className="text-gray-300/75 text-sm mt-3">{plan.description}</p>

                  <div className="mt-6">
                    <div className="text-3xl font-bold text-white">{plan.price ?? '--'}</div>
                  </div>
                </div>

                <ul className="space-y-4 mb-8 flex-1">
                  {plan.features.map((feature) => {
                    return (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-gray-200/90">{feature}</span>
                      </li>
                    )
                  })}
                </ul>

                <ButtonLink
                  variant={plan.highlighted ? 'default' : 'outline'}
                  className="w-full mt-auto"
                  href={plan.ctaHref}
                  target={plan.ctaExternal ? '_blank' : undefined}
                  rel={plan.ctaExternal ? 'noreferrer' : undefined}
                  onClick={
                    plan.ctaExternal
                      ? undefined
                      : () => {
                          handlePrimaryCta(`pricing_${plan.id}`)
                        }
                  }
                >
                  {plan.ctaLabel}
                </ButtonLink>

                {plan.footnote ? (
                  <p className="text-center text-[11px] text-gray-400 mt-3">{plan.footnote}</p>
                ) : null}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
