import type { LocalizedValue, PublicLocale } from './types'

export type PublicInstitutionalPageId = 'about' | 'contact' | 'privacy' | 'terms'

export type PublicInstitutionalSection = {
  title: string
  paragraphs: string[]
  bullets?: string[]
}

export type PublicInstitutionalPage = {
  id: PublicInstitutionalPageId
  locale: PublicLocale
  slug: string
  path: string
  title: string
  seoTitle: string
  seoDescription: string
  excerpt: string
  updatedAt: string
  sections: PublicInstitutionalSection[]
}

type PublicInstitutionalDefinition = {
  id: PublicInstitutionalPageId
  updatedAt: string
  localized: LocalizedValue<{
    slug: string
    title: string
    seoTitle: string
    seoDescription: string
    excerpt: string
    sections: PublicInstitutionalSection[]
  }>
}

const PUBLIC_INSTITUTIONAL_DEFINITIONS: PublicInstitutionalDefinition[] = [
  {
    id: 'about',
    updatedAt: '2026-03-12',
    localized: {
      'pt-BR': {
        slug: 'sobre',
        title: 'Sobre o AutoWhats',
        seoTitle: 'Sobre o AutoWhats | Automação de WhatsApp com IA para atendimento e CRM',
        seoDescription: 'Conheça o AutoWhats, plataforma de automação de WhatsApp com IA para atendimento, CRM, follow-up e agendamentos.',
        excerpt: 'Conheça a proposta do AutoWhats, para quem a plataforma foi criada e como ela ajuda negócios que atendem pelo WhatsApp.',
        sections: [
          {
            title: 'O que é o AutoWhats',
            paragraphs: [
              'O AutoWhats é uma plataforma de automação de WhatsApp com IA para empresas que precisam responder clientes com agilidade, manter contexto comercial e organizar a operação em um só painel.',
              'A proposta é unir atendimento com IA, CRM, follow-up, agenda e transmissões em um fluxo único, sem exigir instalação local nem processos complexos para começar.'
            ]
          },
          {
            title: 'Para quem a plataforma foi criada',
            paragraphs: [
              'O AutoWhats faz mais sentido para operações que recebem perguntas recorrentes sobre preços, horários, agendamentos, disponibilidade, catálogo ou status de atendimento.',
              'Isso inclui clínicas, consultórios, e-commerce, restaurantes, serviços locais, times comerciais e operações que usam o WhatsApp como principal canal de entrada.'
            ],
            bullets: [
              'Atendimento com IA treinada no seu negócio',
              'Qualificação de leads e CRM no mesmo fluxo',
              'Follow-up e agendamento sem sair do painel',
              'Controles para pausar, revisar e repassar para humano'
            ]
          },
          {
            title: 'Como funciona na prática',
            paragraphs: [
              'Você conecta o WhatsApp via QR Code, configura regras, tom de voz, serviços, preços e FAQs. A partir daí, a IA responde dentro do escopo definido e chama um humano quando necessário.',
              'A operação continua visível em um painel com conversas, leads, clientes, agenda, arquivos e métricas para ajuste fino.'
            ]
          }
        ]
      },
      en: {
        slug: 'about',
        title: 'About AutoWhats',
        seoTitle: 'About AutoWhats | WhatsApp automation with AI for support and CRM',
        seoDescription: 'Meet AutoWhats, a WhatsApp automation platform with AI for support, CRM, follow-ups, and scheduling.',
        excerpt: 'Understand the AutoWhats proposition, who the platform is built for, and how it helps businesses that run support on WhatsApp.',
        sections: [
          {
            title: 'What AutoWhats is',
            paragraphs: [
              'AutoWhats is a WhatsApp automation platform with AI for teams that need to reply quickly, keep commercial context, and organize operations in a single workspace.',
              'The goal is to bring AI support, CRM, follow-ups, scheduling, and broadcasts into one flow without local installation or complex setup.'
            ]
          },
          {
            title: 'Who the platform is built for',
            paragraphs: [
              'AutoWhats fits operations that receive recurring questions about pricing, availability, schedules, catalogs, or support status through WhatsApp.',
              'That includes clinics, ecommerce stores, restaurants, local services, sales teams, and businesses that use WhatsApp as a primary inbound channel.'
            ],
            bullets: [
              'AI support trained on your business',
              'Lead qualification and CRM in the same flow',
              'Follow-ups and scheduling from the same dashboard',
              'Controls to pause, review, and hand off to a human'
            ]
          },
          {
            title: 'How it works in practice',
            paragraphs: [
              'You connect WhatsApp with a QR code and configure rules, tone of voice, services, pricing, and FAQs. From there, AI replies within the defined scope and calls a human when needed.',
              'The full operation stays visible in one dashboard with conversations, leads, clients, calendar, files, and metrics for fine-tuning.'
            ]
          }
        ]
      }
    }
  },
  {
    id: 'contact',
    updatedAt: '2026-03-12',
    localized: {
      'pt-BR': {
        slug: 'contato',
        title: 'Contato',
        seoTitle: 'Contato AutoWhats | Fale sobre automação de WhatsApp com IA',
        seoDescription: 'Fale com o time do AutoWhats para tirar dúvidas sobre automação de WhatsApp com IA, CRM, agendamento e implantação.',
        excerpt: 'Canais de contato do AutoWhats para falar com o time comercial e tirar dúvidas sobre a plataforma.',
        sections: [
          {
            title: 'Fale com o time',
            paragraphs: [
              'Hoje o canal mais rápido para contato inicial com o AutoWhats é o WhatsApp comercial. É o melhor caminho para dúvidas sobre implantação, uso do produto e próximos passos.',
              'Se você preferir, também pode iniciar pelo teste grátis e deixar o seu número para receber uma demonstração prática da IA.'
            ]
          },
          {
            title: 'Quando faz sentido entrar em contato',
            paragraphs: [
              'A conversa costuma ser mais útil quando você já sabe o que quer automatizar primeiro: atendimento comercial, dúvidas frequentes, agendamento, follow-up ou organização do CRM.'
            ],
            bullets: [
              'Avaliar aderência ao seu tipo de negócio',
              'Entender como conectar o WhatsApp Business',
              'Ver como a IA usa regras, FAQs e contexto',
              'Entender como funcionam créditos, assinatura e operação'
            ]
          },
          {
            title: 'Próximo passo recomendado',
            paragraphs: [
              'Se o objetivo é validar rápido, o melhor caminho é abrir um teste grátis e ver a IA em ação no próprio WhatsApp.',
              'Se o objetivo é discutir implantação comercial, integração ao processo atual ou operação em escala, o contato direto pelo WhatsApp tende a ser o caminho mais rápido.'
            ]
          }
        ]
      },
      en: {
        slug: 'contact',
        title: 'Contact',
        seoTitle: 'Contact AutoWhats | Talk about WhatsApp automation with AI',
        seoDescription: 'Talk to the AutoWhats team about WhatsApp automation with AI, CRM, scheduling, and rollout.',
        excerpt: 'AutoWhats contact channels to reach the commercial team and clarify questions about the platform.',
        sections: [
          {
            title: 'Talk to the team',
            paragraphs: [
              'Today, the fastest way to reach AutoWhats is through the commercial WhatsApp number. It is the best path for rollout questions, product usage, and next steps.',
              'If you prefer, you can also start with the free trial and leave your number to receive a practical AI demo.'
            ]
          },
          {
            title: 'When it makes sense to contact us',
            paragraphs: [
              'The conversation is usually more productive when you already know what you want to automate first: sales support, frequent questions, scheduling, follow-ups, or CRM organization.'
            ],
            bullets: [
              'Assess fit for your business model',
              'Understand how to connect WhatsApp Business',
              'See how AI uses rules, FAQs, and context',
              'Understand credits, subscription, and operations'
            ]
          },
          {
            title: 'Recommended next step',
            paragraphs: [
              'If the goal is quick validation, the fastest path is to start a free trial and see AI working inside your own WhatsApp.',
              'If the goal is to discuss rollout, integration into your current process, or scale operations, direct WhatsApp contact is usually the fastest route.'
            ]
          }
        ]
      }
    }
  },
  {
    id: 'privacy',
    updatedAt: '2026-03-12',
    localized: {
      'pt-BR': {
        slug: 'politica-de-privacidade',
        title: 'Política de Privacidade',
        seoTitle: 'Política de Privacidade | AutoWhats',
        seoDescription: 'Entenda como o AutoWhats coleta, usa e protege dados de navegação, cadastro e operação da plataforma.',
        excerpt: 'Resumo das práticas de coleta, uso e proteção de dados do AutoWhats.',
        sections: [
          {
            title: 'Dados que podem ser coletados',
            paragraphs: [
              'O AutoWhats pode coletar dados informados diretamente por você em formulários, cadastro, contato comercial e uso da plataforma. Isso inclui, por exemplo, nome, telefone, e-mail e informações necessárias para operar a conta.',
              'Também podem ser coletados dados técnicos de navegação e aquisição, como páginas visitadas, parâmetros de campanha, cookies e eventos de uso do site.'
            ]
          },
          {
            title: 'Como os dados são usados',
            paragraphs: [
              'Os dados são usados para prestar o serviço, melhorar a experiência, analisar aquisição, responder solicitações e manter a operação do produto.',
              'Quando você solicita demonstração, teste grátis ou contato comercial, os dados informados também podem ser usados para retorno sobre a plataforma e acompanhamento do atendimento.'
            ],
            bullets: [
              'Operação da conta e autenticação',
              'Atendimento comercial e suporte',
              'Medição de marketing e desempenho do site',
              'Melhorias de produto e segurança operacional'
            ]
          },
          {
            title: 'Compartilhamento, cookies e segurança',
            paragraphs: [
              'O AutoWhats pode usar provedores e ferramentas de infraestrutura, autenticação, analytics e mensageria para operar o serviço. Esses parceiros recebem apenas os dados necessários para a finalidade contratada.',
              'Cookies e tecnologias similares podem ser usados para medir tráfego, origem de campanhas, conversões e uso do site. Medidas técnicas e operacionais são adotadas para reduzir risco de acesso indevido, perda ou uso indevido dos dados.'
            ]
          },
          {
            title: 'Direitos e revisão',
            paragraphs: [
              'Você pode solicitar revisão, atualização ou esclarecimentos sobre os dados associados ao seu contato ou à sua conta pelos canais de atendimento do AutoWhats.',
              'Este texto é uma base operacional do site atual e pode ser revisado para refletir mudanças de produto, infraestrutura, integrações ou exigências regulatórias.'
            ]
          }
        ]
      },
      en: {
        slug: 'privacy-policy',
        title: 'Privacy Policy',
        seoTitle: 'Privacy Policy | AutoWhats',
        seoDescription: 'Understand how AutoWhats collects, uses, and protects navigation, signup, and operational data.',
        excerpt: 'Summary of AutoWhats practices for data collection, usage, and protection.',
        sections: [
          {
            title: 'Data that may be collected',
            paragraphs: [
              'AutoWhats may collect data that you provide directly in forms, signup flows, commercial contact, and platform usage. That may include your name, phone number, email, and other information required to operate the account.',
              'We may also collect technical browsing and acquisition data such as visited pages, campaign parameters, cookies, and website usage events.'
            ]
          },
          {
            title: 'How data is used',
            paragraphs: [
              'Data is used to provide the service, improve the experience, analyze acquisition, respond to requests, and keep the product operating properly.',
              'When you request a demo, free trial, or commercial contact, submitted data may also be used to respond about the platform and follow up on the conversation.'
            ],
            bullets: [
              'Account operation and authentication',
              'Commercial support and customer service',
              'Marketing measurement and site performance',
              'Product improvements and operational security'
            ]
          },
          {
            title: 'Sharing, cookies, and security',
            paragraphs: [
              'AutoWhats may rely on infrastructure, authentication, analytics, and messaging providers to operate the service. Those partners only receive the data needed for the contracted purpose.',
              'Cookies and similar technologies may be used to measure traffic, campaign origin, conversions, and site usage. Technical and operational safeguards are adopted to reduce the risk of unauthorized access, loss, or misuse of data.'
            ]
          },
          {
            title: 'Rights and updates',
            paragraphs: [
              'You may request review, correction, or clarification regarding the data associated with your contact or account through AutoWhats support channels.',
              'This text reflects the current operational baseline of the site and may be updated to match product, infrastructure, integration, or regulatory changes.'
            ]
          }
        ]
      }
    }
  },
  {
    id: 'terms',
    updatedAt: '2026-03-12',
    localized: {
      'pt-BR': {
        slug: 'termos-de-uso',
        title: 'Termos de Uso',
        seoTitle: 'Termos de Uso | AutoWhats',
        seoDescription: 'Condições gerais de acesso e uso do AutoWhats, incluindo regras operacionais, responsabilidades e limites do serviço.',
        excerpt: 'Condições gerais para uso da plataforma AutoWhats e responsabilidades de operação.',
        sections: [
          {
            title: 'Objeto e acesso',
            paragraphs: [
              'O AutoWhats oferece uma plataforma web para automação de atendimento no WhatsApp com IA, CRM, follow-up, agenda e recursos correlatos.',
              'O acesso à plataforma depende de cadastro, autenticação e, conforme o plano, créditos ou assinatura ativa para uso continuado de determinados recursos.'
            ]
          },
          {
            title: 'Responsabilidades do usuário',
            paragraphs: [
              'O usuário é responsável pelas informações inseridas na plataforma, pela configuração das regras da IA, pela revisão operacional do que for necessário e pelo uso compatível com sua atividade.',
              'Também é responsabilidade do usuário respeitar políticas do WhatsApp, boas práticas de atendimento e regras aplicáveis ao seu negócio.'
            ],
            bullets: [
              'Manter dados de acesso atualizados e protegidos',
              'Configurar corretamente contexto, serviços e regras da IA',
              'Revisar fluxos críticos antes de escalar a operação',
              'Usar a plataforma de forma lícita e compatível com o canal'
            ]
          },
          {
            title: 'Limites do serviço',
            paragraphs: [
              'O AutoWhats busca oferecer estabilidade e continuidade operacional, mas o funcionamento pode depender de provedores terceiros, integrações, disponibilidade de infraestrutura e limites do canal utilizado.',
              'Recursos baseados em IA dependem de configuração, contexto e dados fornecidos pelo usuário. O desempenho da IA pode variar conforme o uso e o escopo definido.'
            ]
          },
          {
            title: 'Planos, créditos e atualizações',
            paragraphs: [
              'Determinados recursos podem exigir assinatura, saldo de créditos ou condições comerciais específicas. Mudanças de produto, interface, integrações e políticas operacionais podem ocorrer ao longo do tempo para melhoria da plataforma.',
              'O uso continuado da plataforma após atualizações relevantes representa concordância com a versão vigente das regras operacionais publicadas pelo AutoWhats.'
            ]
          }
        ]
      },
      en: {
        slug: 'terms-of-use',
        title: 'Terms of Use',
        seoTitle: 'Terms of Use | AutoWhats',
        seoDescription: 'General conditions for accessing and using AutoWhats, including operational rules, responsibilities, and service limits.',
        excerpt: 'General conditions for using the AutoWhats platform and the related operational responsibilities.',
        sections: [
          {
            title: 'Purpose and access',
            paragraphs: [
              'AutoWhats provides a web platform for WhatsApp automation with AI, CRM, follow-ups, scheduling, and related workflows.',
              'Access to the platform depends on signup, authentication, and, depending on the plan, active credits or subscription for continued use of certain resources.'
            ]
          },
          {
            title: 'User responsibilities',
            paragraphs: [
              'Users are responsible for the information entered into the platform, the configuration of AI rules, the operational review required for their workflow, and use that is compatible with their business activity.',
              'Users are also responsible for respecting WhatsApp policies, support best practices, and the rules applicable to their business.'
            ],
            bullets: [
              'Keep access data updated and protected',
              'Configure AI context, services, and rules correctly',
              'Review critical flows before scaling operations',
              'Use the platform lawfully and in a channel-compatible way'
            ]
          },
          {
            title: 'Service limits',
            paragraphs: [
              'AutoWhats aims to provide stability and operational continuity, but the service may depend on third-party providers, integrations, infrastructure availability, and channel limitations.',
              'AI-based features depend on configuration, context, and the data supplied by the user. AI performance may vary depending on the use case and the scope that was defined.'
            ]
          },
          {
            title: 'Plans, credits, and updates',
            paragraphs: [
              'Some features may require an active subscription, credit balance, or specific commercial terms. Product, interface, integration, and operational policy changes may happen over time to improve the platform.',
              'Continuing to use the platform after relevant updates means acceptance of the current version of the operational rules published by AutoWhats.'
            ]
          }
        ]
      }
    }
  }
]

export function getInstitutionalPagePath(locale: PublicLocale, slug: string): string {
  const prefix = locale === 'en' ? '/en' : '/pt'
  return `${prefix}/${slug}`
}

export function getInstitutionalPagePathById(locale: PublicLocale, id: PublicInstitutionalPageId): string {
  const definition = PUBLIC_INSTITUTIONAL_DEFINITIONS.find((page) => page.id === id)
  if (!definition) {
    throw new Error(`Institutional page not found: ${id}`)
  }

  return getInstitutionalPagePath(locale, definition.localized[locale].slug)
}

export function getInstitutionalPageAlternates(
  id: PublicInstitutionalPageId
): Record<'pt-BR' | 'en' | 'x-default', string> {
  const definition = PUBLIC_INSTITUTIONAL_DEFINITIONS.find((page) => page.id === id)
  if (!definition) {
    throw new Error(`Institutional page not found: ${id}`)
  }

  return {
    'pt-BR': getInstitutionalPagePath('pt-BR', definition.localized['pt-BR'].slug),
    en: getInstitutionalPagePath('en', definition.localized.en.slug),
    'x-default': getInstitutionalPagePath('pt-BR', definition.localized['pt-BR'].slug)
  }
}

export function listPublicInstitutionalPages(locale: PublicLocale = 'pt-BR'): PublicInstitutionalPage[] {
  return PUBLIC_INSTITUTIONAL_DEFINITIONS.map((definition) => {
    const localized = definition.localized[locale]
    return {
      id: definition.id,
      locale,
      slug: localized.slug,
      path: getInstitutionalPagePath(locale, localized.slug),
      title: localized.title,
      seoTitle: localized.seoTitle,
      seoDescription: localized.seoDescription,
      excerpt: localized.excerpt,
      updatedAt: definition.updatedAt,
      sections: localized.sections
    }
  })
}

export function getInstitutionalPageBySlug(locale: PublicLocale, slug: string): PublicInstitutionalPage | null {
  return listPublicInstitutionalPages(locale).find((page) => page.slug === slug) ?? null
}

export function getInstitutionalPageById(
  locale: PublicLocale,
  id: PublicInstitutionalPageId
): PublicInstitutionalPage | null {
  return listPublicInstitutionalPages(locale).find((page) => page.id === id) ?? null
}
