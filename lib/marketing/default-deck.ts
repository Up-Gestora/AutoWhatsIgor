import type { MarketingDeck, MarketingDeckStatus, MarketingSlideV2 } from '@/lib/marketing/deck-types'
import {
  MARKETING_PRICING_PLANS,
  MARKETING_PRO_AI_CREDITS_TOKEN,
  PRO_AI_CREDITS_LABEL_BY_BILLING
} from '@/lib/marketing/pricing-catalog'

const DEFAULT_DECK_NAME = 'Deck Comercial Pro - AutoWhats'

const pricingCards = MARKETING_PRICING_PLANS.map((plan) => ({
  title: plan.name,
  value: plan.price ?? `${plan.priceMonthly ?? '-'} / mes ou ${plan.priceAnnual ?? '-'} / ano`,
  description: plan.description,
  tag: plan.highlighted ? 'Mais escolhido' : undefined
}))

const proFeatureList = (MARKETING_PRICING_PLANS.find((plan) => plan.id === 'pro')?.features ?? []).map((feature) =>
  feature === MARKETING_PRO_AI_CREDITS_TOKEN ? PRO_AI_CREDITS_LABEL_BY_BILLING.monthly : feature
)

const DEFAULT_SLIDES: MarketingSlideV2[] = [
  {
    id: 'cover',
    key: 'cover',
    enabled: true,
    title: 'AutoWhats - proposta comercial',
    layout: 'hero-split',
    theme: 'emerald-night',
    blocks: [
      {
        id: 'cover-heading',
        type: 'heading',
        eyebrow: 'Proposta comercial',
        title: 'Atendimento no WhatsApp com IA que converte mais',
        subtitle:
          'Um sistema pronto para PMEs que precisam responder rápido, padronizar atendimento e transformar conversas em receita.'
      },
      {
        id: 'cover-paragraph',
        type: 'paragraph',
        text:
          'O AutoWhats automatiza a primeira camada de atendimento, qualifica leads e encaminha para o humano no momento certo.'
      },
      {
        id: 'cover-kpi',
        type: 'kpi-strip',
        items: [
          { label: 'Setup inicial', value: '15 a 30 min' },
          { label: 'Tempo de resposta', value: 'quase imediato' },
          { label: 'Modelo operacional', value: 'SaaS + créditos de IA' }
        ]
      },
      {
        id: 'cover-cta',
        type: 'cta',
        label: 'Quero testar no meu negócio',
        href: '/login?mode=signup',
        supportingText: 'Teste gratuito com onboarding guiado no painel.'
      }
    ]
  },
  {
    id: 'problem',
    key: 'problem',
    enabled: true,
    title: 'O gargalo atual do atendimento',
    layout: 'problem-impact',
    theme: 'midnight-blue',
    blocks: [
      {
        id: 'problem-heading',
        type: 'heading',
        eyebrow: 'Desafio comum',
        title: 'A maioria das empresas perde vendas na demora da resposta',
        subtitle: 'Quanto maior o volume de mensagens, maior o desperdicio de oportunidade.'
      },
      {
        id: 'problem-bullets',
        type: 'bullet-list',
        title: 'Dores mais frequentes',
        items: [
          'Leads esfriam por falta de follow-up estruturado.',
          'Equipe responde perguntas repetitivas e deixa de vender.',
          'Falta padrao: cada atendente responde de um jeito.',
          'Sem visibilidade de funil: difícil medir gargalos.'
        ]
      },
      {
        id: 'problem-stats',
        type: 'stat-grid',
        title: 'Impacto no caixa',
        items: [
          { label: 'Conversas sem retorno', value: 'ate 40%', note: 'quando não existe processo claro de atendimento' },
          { label: 'Tempo médio de resposta', value: '10-60 min', note: 'em operações manuais com pico de demanda' },
          { label: 'Leads perdidos', value: 'alto risco', note: 'quando o cliente busca resposta imediata' }
        ]
      }
    ]
  },
  {
    id: 'solution',
    key: 'solution',
    enabled: true,
    title: 'A solucao AutoWhats',
    layout: 'solution-proof',
    theme: 'ocean-cyan',
    blocks: [
      {
        id: 'solution-heading',
        type: 'heading',
        eyebrow: 'Solucao',
        title: 'Automação com IA, controle operacional e foco em conversão',
        subtitle: 'Não é só chatbot: é um fluxo comercial estruturado com governança.'
      },
      {
        id: 'solution-cards',
        type: 'card-grid',
        title: 'Pilares da plataforma',
        variant: 'proof',
        columns: 3,
        items: [
          {
            title: 'IA treinada no seu contexto',
            value: 'Respostas consistentes',
            description: 'Treine com regras, ofertas e informações reais do seu negócio.'
          },
          {
            title: 'Escalada para humano',
            value: 'No momento certo',
            description: 'Quando a IA identifica limite de contexto ou oportunidade sensível.'
          },
          {
            title: 'Visão de funil',
            value: 'Leads e clientes no painel',
            description: 'Acompanhamento contínuo para melhorar conversão.'
          }
        ]
      },
      {
        id: 'solution-quote',
        type: 'quote',
        quote: 'A gente ganhou velocidade de atendimento sem perder controle do processo comercial.',
        author: 'Operação comercial',
        role: 'Cliente AutoWhats'
      }
    ]
  },
  {
    id: 'how-it-works',
    key: 'how-it-works',
    enabled: true,
    title: 'Como funciona na prática',
    layout: 'flow-diagram',
    theme: 'forest-glow',
    blocks: [
      {
        id: 'flow-heading',
        type: 'heading',
        eyebrow: 'Implementação',
        title: 'Fluxo simples para entrar em produ??o',
        subtitle: 'Sem projeto longo ou dependência de time técnico interno.'
      },
      {
        id: 'flow-timeline',
        type: 'timeline',
        title: 'Passo a passo',
        steps: [
          { title: '1. Conexão', description: 'Conecte seu número de WhatsApp via QR Code.' },
          { title: '2. Treinamento', description: 'Defina regras, tom de voz e contexto da IA.' },
          { title: '3. Operação', description: 'Ative atendimento automático e acompanhe no CRM.' },
          { title: '4. Otimização', description: 'Ajuste prompts e fluxo com base em dados reais.' }
        ]
      }
    ]
  },
  {
    id: 'features',
    key: 'features',
    enabled: true,
    title: 'Funcionalidades que sustentam escala',
    layout: 'feature-masonry',
    theme: 'slate-premium',
    blocks: [
      {
        id: 'features-heading',
        type: 'heading',
        eyebrow: 'Produto',
        title: 'Ferramentas para vender e atender melhor',
        subtitle: 'Desenhado para operações comerciais com alto volume de conversa.'
      },
      {
        id: 'features-cards',
        type: 'card-grid',
        title: 'Principais recursos',
        variant: 'feature',
        columns: 3,
        items: [
          { title: 'CRM nativo', description: 'Leads, clientes e status em uma ?nica tela.' },
          { title: 'IA por chat', description: 'Liga/desliga por conversa para manter controle operacional.' },
          { title: 'Sugestões de follow-up', description: 'A IA sugere próximos passos para acelerar fechamento.' },
          { title: 'Painel admin', description: 'Gestão de sessões, usuários, créditos e configurações globais.' },
          { title: 'Observabilidade', description: 'Status de sessão e diagnóstico para reduzir indisponibilidade.' },
          { title: 'Evolução contínua', description: 'Atualizações frequentes no produto e roadmap ativo.' }
        ]
      }
    ]
  },
  {
    id: 'results',
    key: 'results',
    enabled: true,
    title: 'Resultado operacional esperado',
    layout: 'results-dashboard',
    theme: 'sunrise-orange',
    blocks: [
      {
        id: 'results-heading',
        type: 'heading',
        eyebrow: 'Ganho de performance',
        title: 'Mais agilidade, mais constância, mais conversão',
        subtitle: 'Cenários de referencia baseados em operações de atendimento digital.'
      },
      {
        id: 'results-stats',
        type: 'stat-grid',
        title: 'Indicadores acompanhados',
        items: [
          { label: 'Tempo de resposta inicial', value: '-70% a -90%' },
          { label: 'Capacidade de atendimento', value: '+2x a +4x' },
          { label: 'Leads com follow-up ativo', value: '+30% a +60%' },
          { label: 'Padronização de resposta', value: 'alto nivel' }
        ]
      },
      {
        id: 'results-proof-cards',
        type: 'card-grid',
        title: 'Impactos percebidos',
        variant: 'proof',
        columns: 2,
        items: [
          { title: 'Equipe mais focada em fechamento', description: 'Menos tempo gasto em perguntas repetitivas.' },
          { title: 'Atendimento 24/7 com critério', description: 'A IA segura o primeiro contato e encaminha quando precisa.' }
        ]
      }
    ]
  },
  {
    id: 'use-cases',
    key: 'use-cases',
    enabled: true,
    title: 'Casos de uso por tipo de negócio',
    layout: 'cases-grid',
    theme: 'ocean-cyan',
    blocks: [
      {
        id: 'cases-heading',
        type: 'heading',
        eyebrow: 'Aplicação real',
        title: 'Adaptável para diferentes operações comerciais',
        subtitle: 'Da captura de lead ao pós-venda.'
      },
      {
        id: 'cases-cards',
        type: 'card-grid',
        title: 'Onde o AutoWhats gera resultado',
        variant: 'generic',
        columns: 3,
        items: [
          {
            title: 'Clínicas e serviços',
            description: 'Triagem inicial, dúvidas frequentes e organização de retorno.'
          },
          {
            title: 'E-commerce e varejo',
            description: 'Resposta rápida sobre produto, pedido, prazo e condição comercial.'
          },
          {
            title: 'Infoprodutos e educação',
            description: 'Qualificação de interesse e encaminhamento para consultivo humano.'
          },
          {
            title: 'Imobiliário',
            description: 'Captura de perfil, faixa de investimento e agendamento de visita.'
          },
          {
            title: 'SaaS B2B',
            description: 'Pre-venda automatica, discovery inicial e roteamento para closer.'
          },
          {
            title: 'Franquias e unidades',
            description: 'Padronização de atendimento com adaptação regional.'
          }
        ]
      }
    ]
  },
  {
    id: 'pricing',
    key: 'pricing',
    enabled: true,
    title: 'Planos e investimento',
    layout: 'pricing-spotlight',
    theme: 'emerald-night',
    blocks: [
      {
        id: 'pricing-heading',
        type: 'heading',
        eyebrow: 'Modelo comercial',
        title: 'Comece com teste e escale conforme resultado',
        subtitle: 'Plano de entrada simples e opção de evolução para operações maiores.'
      },
      {
        id: 'pricing-cards',
        type: 'card-grid',
        title: 'Tabela de planos',
        variant: 'pricing',
        columns: 3,
        items: pricingCards
      },
      {
        id: 'pricing-bullets',
        type: 'bullet-list',
        title: 'Destaques do Pro',
        items: proFeatureList
      },
      {
        id: 'pricing-cta',
        type: 'cta',
        label: 'Iniciar teste gratuito',
        href: '/login?mode=signup',
        supportingText: 'Sem compromisso inicial para validar no seu fluxo.'
      }
    ]
  },
  {
    id: 'roi',
    key: 'roi',
    enabled: true,
    title: 'ROI e payback',
    layout: 'roi-focus',
    theme: 'midnight-blue',
    blocks: [
      {
        id: 'roi-heading',
        type: 'heading',
        eyebrow: 'Viabilidade financeira',
        title: 'Um projeto que se paga com ganho de eficiência e conversão',
        subtitle: 'Estimativa para operações com volume recorrente no WhatsApp.'
      },
      {
        id: 'roi-paragraph',
        type: 'paragraph',
        text:
          'Quando o tempo de resposta cai e o follow-up melhora, o volume de oportunidades aproveitadas aumenta. O resultado tende a superar o investimento mensal rápidamente.'
      },
      {
        id: 'roi-stats',
        type: 'stat-grid',
        title: 'Exemplo de cenário',
        items: [
          { label: 'Conversas/mensais', value: '3.000' },
          { label: 'Recuperação de oportunidades', value: '+8% a +15%' },
          { label: 'Potencial de receita incremental', value: '2x a 10x do custo' }
        ]
      },
      {
        id: 'roi-cards',
        type: 'card-grid',
        title: 'Antes vs depois',
        variant: 'comparison',
        columns: 2,
        items: [
          {
            title: 'Antes',
            value: 'Processo manual',
            description: 'Respostas lentas, pouco follow-up e baixa previsibilidade.'
          },
          {
            title: 'Depois',
            value: 'Fluxo orientado por IA',
            description: 'Mais velocidade, cobertura e consistência na jornada do lead.'
          }
        ]
      }
    ]
  },
  {
    id: 'objections',
    key: 'objections',
    enabled: true,
    title: 'Principais objeções respondidas',
    layout: 'objection-comparison',
    theme: 'slate-premium',
    blocks: [
      {
        id: 'objections-heading',
        type: 'heading',
        eyebrow: 'FAQ comercial',
        title: 'Perguntas que surgem antes de contratar',
        subtitle: 'Transparência para reduzir fricção na decisão.'
      },
      {
        id: 'objections-cards',
        type: 'card-grid',
        title: 'Objeções comuns',
        variant: 'comparison',
        columns: 2,
        items: [
          {
            title: 'A IA vai substituir meu time?',
            value: 'Não',
            description: 'Ela assume repeticao e acelera triagem; seu time foca em fechamento.'
          },
          {
            title: 'Consigo controlar respostas?',
            value: 'Sim',
            description: 'Você define regras, contexto, limites e escalada para humano.'
          },
          {
            title: 'E se a IA sair do contexto?',
            value: 'Existe protecao',
            description: 'O sistema permite desativar por chat e controlar comportamento.'
          },
          {
            title: 'Quanto tempo para operar?',
            value: 'No mesmo dia',
            description: 'Conexão e treinamento inicial em poucos passos.'
          }
        ]
      }
    ]
  },
  {
    id: 'onboarding',
    key: 'onboarding',
    enabled: true,
    title: 'Plano de implantação',
    layout: 'timeline-roadmap',
    theme: 'forest-glow',
    blocks: [
      {
        id: 'onboarding-heading',
        type: 'heading',
        eyebrow: 'Go-live',
        title: 'Entrada em operação com risco controlado',
        subtitle: 'Onboarding orientado por etapas objetivas.'
      },
      {
        id: 'onboarding-timeline',
        type: 'timeline',
        title: 'Roadmap sugerido',
        steps: [
          { title: 'Dia 1', description: 'Conexão do número e configuração base de atendimento.' },
          { title: 'Dia 2', description: 'Treinamento de IA com regras, ofertas e FAQ.' },
          { title: 'Dia 3', description: 'Rodada assistida com ajustes de prompt e funil.' },
          { title: 'Semana 2', description: 'Escala gradual com monitoramento de conversão.' }
        ]
      },
      {
        id: 'onboarding-kpi',
        type: 'kpi-strip',
        items: [
          { label: 'Tempo para ativar', value: 'curto' },
          { label: 'Complexidade tecnica', value: 'baixa' },
          { label: 'Acompanhamento', value: 'assistido no painel' }
        ]
      }
    ]
  },
  {
    id: 'final-cta',
    key: 'final-cta',
    enabled: true,
    title: 'Fechamento e próximo passo',
    layout: 'final-offer',
    theme: 'sunrise-orange',
    blocks: [
      {
        id: 'final-heading',
        type: 'heading',
        eyebrow: 'Decisão',
        title: 'Vamos validar o AutoWhats no seu funil ainda esta semana',
        subtitle: 'Entre em teste, mensure resultado e decida com dados reais.'
      },
      {
        id: 'final-bullets',
        type: 'bullet-list',
        title: 'Próximo passo recomendado',
        items: [
          'Criar conta e conectar o WhatsApp.',
          'Configurar o contexto de atendimento com nossa estrutura guiada.',
          'Rodar 7 dias de operação e comparar indicadores antes/depois.'
        ]
      },
      {
        id: 'final-cta',
        type: 'cta',
        label: 'Ativar teste grátis agora',
        href: '/login?mode=signup',
        supportingText: 'Se quiser, montamos a configuração inicial junto com você.'
      }
    ]
  }
]

export function createDefaultMarketingDeck(): MarketingDeck {
  return {
    version: 2,
    language: 'pt-BR',
    audience: 'pme',
    templateKey: 'home-v2',
    title: 'Apresentação Comercial - AutoWhats',
    subtitle: 'Automação de WhatsApp com IA para gerar mais resultado com previsibilidade',
    slides: DEFAULT_SLIDES.map((slide) => ({
      ...slide,
      blocks: slide.blocks.map((block) => JSON.parse(JSON.stringify(block)))
    }))
  }
}

export function createDefaultDeckName() {
  return DEFAULT_DECK_NAME
}

export function createDefaultDeckStatus(): MarketingDeckStatus {
  return 'draft'
}
