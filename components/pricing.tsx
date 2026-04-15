'use client'

import { useState } from 'react'
import { Check, Clock } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const whatsappNumber = '5543988462272'
const buildWhatsAppLink = () =>
  `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
    'Oi, vim pelo site de vocês. Pode me enviar mais informações?'
  )}`

type Plan = {
  name: string
  description: string
  features: string[]
  ctaLabel: string
  ctaHref: string
  highlighted: boolean
  price?: string
  priceMonthly?: string
  priceAnnual?: string
  ctaExternal?: boolean
}

const plans: Plan[] = [
  {
    name: 'Teste Grátis',
    price: 'R$ 0,00',
    description: 'Conheça o AutoWhats sem custo ou compromisso',
    features: [
      'Configure rápidamente',
      'Acesso completo ao sistema',
      'R$ 5,00 de crédito',
      'Acesso por até 30 dias',
    ],
    ctaLabel: 'Teste gratuitamente',
    ctaHref: '/login?mode=signup',
    highlighted: false,
  },
  {
    name: 'Pro',
    priceMonthly: 'R$ 100,00',
    priceAnnual: 'R$ 600,00',
    description: 'Para empresas que recebem 20-500 mensagens por dia.',
    features: [
      'Ajudamos na configuração inicial',
      'Sistema de créditos para uso da IA',
      'Até 2h de suporte por mês',
      'CRM integrado com IA',
      'Desconto para tráfego pago',
    ],
    ctaLabel: 'Fale conosco',
    ctaHref: buildWhatsAppLink(),
    ctaExternal: true,
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Sob consulta',
    description: 'Soluções personalizadas',
    features: [
      'Peça melhorias no sistema',
      'Integre ao seu ERP/CRM',
      'Desconto nos créditos de IA',
      'Suporte ilimitado',
    ],
    ctaLabel: 'Fale conosco',
    ctaHref: buildWhatsAppLink(),
    ctaExternal: true,
    highlighted: false,
  },
]

export function Pricing() {
  const [proBilling, setProBilling] = useState<'monthly' | 'annual'>('monthly')

  return (
    <section id="precos" className="py-24 relative">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-light border border-surface-lighter mb-6">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-sm text-gray-400">Planos e valores</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Planos para Cada{' '}
            <span className="gradient-text">Necessidade</span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Comece seu teste gratuito hoje mesmo e descubra como a IA pode transformar seu atendimento no WhatsApp
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-8 border card-hover ${
                plan.highlighted
                  ? 'bg-gradient-to-b from-primary/10 to-surface-light border-primary/50'
                  : 'bg-surface-light border-surface-lighter'
              }`}
            >
              {/* Popular badge */}
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-black font-bold text-sm px-4 py-1 rounded-full">
                  Mais Popular
                </div>
              )}

              {/* Plan info */}
              <div className="text-center mb-8">
                <h3 className="text-xl font-semibold text-white mb-2">
                  {plan.name}
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  {plan.description}
                </p>
                {plan.name === 'Pro' ? (
                  <>
                    <div className="text-3xl font-bold text-white">
                      {proBilling === 'monthly' ? plan.priceMonthly : plan.priceAnnual}{' '}
                      <span className="text-base font-medium text-gray-400">
                        {proBilling === 'monthly' ? '/ mês' : '/ ano'}
                      </span>
                    </div>
                    <div className="mt-4 inline-flex items-center gap-1 rounded-full bg-surface border border-surface-lighter p-1">
                      <button
                        type="button"
                        onClick={() => setProBilling('monthly')}
                        className={cn(
                          'px-4 py-1.5 text-xs font-semibold rounded-full transition-colors',
                          proBilling === 'monthly'
                            ? 'bg-primary text-black'
                            : 'text-gray-400 hover:text-white'
                        )}
                        aria-pressed={proBilling === 'monthly'}
                      >
                        Mensal
                      </button>
                      <button
                        type="button"
                        onClick={() => setProBilling('annual')}
                        className={cn(
                          'px-4 py-1.5 text-xs font-semibold rounded-full transition-colors',
                          proBilling === 'annual'
                            ? 'bg-primary text-black'
                            : 'text-gray-400 hover:text-white'
                        )}
                        aria-pressed={proBilling === 'annual'}
                      >
                        Anual
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-3xl font-bold text-white">
                    {plan.price}
                  </div>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <ButtonLink
                variant={plan.highlighted ? 'default' : 'outline'}
                className="w-full"
                href={plan.ctaHref}
                target={plan.ctaExternal ? '_blank' : undefined}
                rel={plan.ctaExternal ? 'noreferrer' : undefined}
              >
                {plan.ctaLabel}
              </ButtonLink>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

