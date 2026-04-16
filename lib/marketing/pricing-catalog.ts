export type MarketingPricingPlanId = 'trial' | 'pro' | 'enterprise'

export type MarketingPricingPlan = {
  id: MarketingPricingPlanId
  name: string
  description: string
  features: string[]
  highlighted: boolean
  price?: string
  priceMonthly?: string
  priceAnnual?: string
  ctaLabel: string
  ctaHref: string
  ctaExternal?: boolean
  footnote?: string
}

export const MARKETING_PRO_AI_CREDITS_TOKEN = '{{pro_ai_credits}}'

const SALES_WHATSAPP_NUMBER = '5543988462272'

export const buildSalesWhatsAppLink = () =>
  `https://wa.me/${SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    'Oi, vim pela página do AutoWhats e quero falar sobre o Plano Enterprise.'
  )}`

export const PRO_AI_CREDITS_LABEL_BY_BILLING = {
  monthly: 'R$ 20 em créditos de IA por mês',
  annual: 'R$ 30 em créditos de IA por mês'
} as const

export const MARKETING_PRICING_PLANS: MarketingPricingPlan[] = [
  {
    id: 'pro',
    name: 'Plano Básico',
    price: 'Sem mensalidade',
    description: 'Modelo pay-per-use para operar no essencial e adicionar créditos conforme uso.',
    features: [
      'Funcionalidades essenciais do painel (conforme plano básico ativo)',
      'Sem custo fixo adicional',
      'Consumo da IA por mensagem enviada: R$ 0,15',
      'Recarga de créditos quando precisar'
    ],
    highlighted: true,
    ctaLabel: 'Começar no Básico',
    ctaHref: '/login?mode=signup',
    footnote: 'Ideal para começar com previsibilidade de custo por uso.'
  },
  {
    id: 'enterprise',
    name: 'Plano Enterprise',
    price: 'R$ 300,00 / mês',
    description: 'Para operações que precisam recursos avançados e menor custo por mensagem da IA.',
    features: [
      'Lista de transmissão personalizada',
      'Agenda integrada',
      'Pagamento integrado',
      'Consumo da IA por mensagem enviada: R$ 0,05'
    ],
    highlighted: false,
    ctaLabel: 'Falar sobre Enterprise',
    ctaHref: buildSalesWhatsAppLink(),
    ctaExternal: true,
    footnote: 'Reduz o custo por mensagem e amplia capacidade operacional.'
  },
  {
    id: 'trial',
    name: 'Add-on Follow-up',
    price: '+ R$ 100,00 / mês',
    description: 'Funcionalidade opcional para follow-up automático em todos os clientes.',
    features: [
      'Follow-up para toda a base de clientes',
      'Fluxo adicional mensal',
      'Pode ser contratado junto ao Básico ou Enterprise'
    ],
    highlighted: false,
    ctaLabel: 'Quero ativar Follow-up',
    ctaHref: buildSalesWhatsAppLink(),
    ctaExternal: true,
    footnote: 'Opcional para quem quer acelerar reativações e recorrência.'
  }
]
