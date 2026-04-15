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
    'Oi, vim pelo site de vocês. Pode me enviar mais informações?'
  )}`

export const PRO_AI_CREDITS_LABEL_BY_BILLING = {
  monthly: '20 reais de créditos de IA mensais',
  annual: '25 reais de créditos de IA mensais'
} as const

export const MARKETING_PRICING_PLANS: MarketingPricingPlan[] = [
  {
    id: 'trial',
    name: 'Teste Grátis',
    price: 'R$ 0,00',
    description: 'Conheça o AutoWhats sem custo ou compromisso.',
    features: [
      'Configure rápido',
      'Acesso completo ao sistema',
      'R$ 5,00 de crédito',
      'Acesso por até 30 dias'
    ],
    highlighted: false,
    ctaLabel: 'Teste grátis',
    ctaHref: '/login?mode=signup',
    footnote: 'Crie conta e comece agora.'
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 'R$ 100,00',
    priceAnnual: 'R$ 600,00',
    description: 'Para empresas que recebem 20-500 mensagens por dia.',
    features: [
      'Ajuda na configuração inicial',
      'Sistema de créditos para uso da IA',
      'Até 2h de suporte por mês',
      MARKETING_PRO_AI_CREDITS_TOKEN,
      'Desconto para tráfego pago'
    ],
    highlighted: true,
    ctaLabel: 'Começar com teste grátis',
    ctaHref: '/login?mode=signup',
    footnote: 'Assine o Pro dentro do painel.'
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Sob consulta',
    description: 'Soluções personalizadas.',
    features: [
      'Peça melhorias no sistema',
      'Integre ao seu ERP/CRM',
      'Desconto nos créditos de IA',
      'Suporte ilimitado'
    ],
    highlighted: false,
    ctaLabel: 'Falar conosco',
    ctaHref: buildSalesWhatsAppLink(),
    ctaExternal: true,
    footnote: 'Atendimento assistido via WhatsApp.'
  }
]
