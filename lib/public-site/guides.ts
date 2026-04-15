import { TUTORIAL_TOPICS as EN_TUTORIAL_TOPICS } from '@/lib/tutorials/content-en'
import { TUTORIAL_TOPICS as PT_TUTORIAL_TOPICS } from '@/lib/tutorials/content'
import type { TutorialTopic } from '@/lib/tutorials/types'
import type { LocalizedValue, PublicLocale } from './types'
import { publicLocaleToPrefix } from './types'

export type PublicGuideId =
  | 'connect-whatsapp-business-qr-code'
  | 'train-ai-for-whatsapp-support'
  | 'whatsapp-crm-and-leads'
  | 'whatsapp-scheduling'
  | 'whatsapp-follow-up'
  | 'whatsapp-broadcasts'

export type PublicGuide = {
  id: PublicGuideId
  locale: PublicLocale
  slug: string
  path: string
  topicId: string
  sectionIds?: string[]
  title: string
  seoTitle: string
  seoDescription: string
  excerpt: string
  updatedAt: string
  readingMinutes: number
  relatedIds: PublicGuideId[]
  relatedSlugs: string[]
  topic: TutorialTopic
  sections: TutorialTopic['sections']
}

type PublicGuideDefinition = {
  id: PublicGuideId
  topicId: string
  sectionIds?: string[]
  updatedAt: string
  relatedIds: PublicGuideId[]
  localized: LocalizedValue<{
    slug: string
    title: string
    seoTitle: string
    seoDescription: string
    excerpt: string
    readingMinutes: number
  }>
}

const tutorialTopicsByLocale: Record<PublicLocale, Map<string, TutorialTopic>> = {
  'pt-BR': new Map(PT_TUTORIAL_TOPICS.map((topic) => [topic.id, topic])),
  en: new Map(EN_TUTORIAL_TOPICS.map((topic) => [topic.id, topic]))
}

const GUIDE_DEFINITIONS: PublicGuideDefinition[] = [
  {
    id: 'connect-whatsapp-business-qr-code',
    topicId: 'primeiros-passos',
    updatedAt: '2026-03-12',
    relatedIds: ['train-ai-for-whatsapp-support', 'whatsapp-scheduling'],
    localized: {
      'pt-BR': {
        slug: 'conectar-whatsapp-business-qr-code',
        title: 'Como conectar o WhatsApp Business por QR Code',
        seoTitle: 'Como conectar o WhatsApp Business por QR Code | Guia AutoWhats',
        seoDescription: 'Aprenda como conectar o WhatsApp Business por QR Code, confirmar a sessão e evitar erros comuns no pareamento.',
        excerpt: 'Guia prático para conectar o WhatsApp Business via QR Code e confirmar que a sessão ficou pronta para operação.',
        readingMinutes: 7
      },
      en: {
        slug: 'connect-whatsapp-business-qr-code',
        title: 'How to connect WhatsApp Business with a QR code',
        seoTitle: 'How to connect WhatsApp Business with a QR code | AutoWhats Guide',
        seoDescription: 'Learn how to connect WhatsApp Business with a QR code, confirm the session, and avoid common pairing issues.',
        excerpt: 'Practical guide to connect WhatsApp Business with a QR code and confirm the session is ready for operation.',
        readingMinutes: 7
      }
    }
  },
  {
    id: 'train-ai-for-whatsapp-support',
    topicId: 'treinamento',
    updatedAt: '2026-03-12',
    relatedIds: ['whatsapp-crm-and-leads', 'whatsapp-follow-up'],
    localized: {
      'pt-BR': {
        slug: 'treinar-ia-para-atendimento-no-whatsapp',
        title: 'Como treinar a IA para atendimento no WhatsApp',
        seoTitle: 'Como treinar a IA para atendimento no WhatsApp | Guia AutoWhats',
        seoDescription: 'Veja como configurar empresa, serviços, tom de voz, regras, FAQs, CRM e agenda para treinar a IA no WhatsApp.',
        excerpt: 'Guia prático para configurar empresa, serviços, tom de voz, FAQs e regras de repasse na IA do AutoWhats.',
        readingMinutes: 12
      },
      en: {
        slug: 'train-ai-for-whatsapp-support',
        title: 'How to train AI for WhatsApp support',
        seoTitle: 'How to train AI for WhatsApp support | AutoWhats Guide',
        seoDescription: 'See how to configure your business, services, tone of voice, rules, FAQs, CRM, and calendar to train AI for WhatsApp support.',
        excerpt: 'Practical guide to configure your business, services, tone of voice, FAQs, and handoff rules inside AutoWhats AI.',
        readingMinutes: 12
      }
    }
  },
  {
    id: 'whatsapp-crm-and-leads',
    topicId: 'leads',
    sectionIds: ['tabela', 'filtros', 'sugestoes', 'logs'],
    updatedAt: '2026-03-12',
    relatedIds: ['whatsapp-follow-up', 'train-ai-for-whatsapp-support'],
    localized: {
      'pt-BR': {
        slug: 'crm-e-leads-no-whatsapp',
        title: 'CRM e leads no WhatsApp: como organizar o funil',
        seoTitle: 'CRM e leads no WhatsApp | Como organizar o funil com IA',
        seoDescription: 'Entenda como organizar leads no WhatsApp, usar filtros, revisar sugestões da IA e manter o CRM atualizado no atendimento.',
        excerpt: 'Aprenda a ler a lista de leads, filtrar contatos, revisar sugestões da IA e manter o CRM organizado no WhatsApp.',
        readingMinutes: 9
      },
      en: {
        slug: 'whatsapp-crm-and-leads',
        title: 'WhatsApp CRM and leads: how to organize your funnel',
        seoTitle: 'WhatsApp CRM and leads | How to organize your funnel with AI',
        seoDescription: 'Understand how to organize WhatsApp leads, use filters, review AI suggestions, and keep CRM updated during support.',
        excerpt: 'Learn how to read your lead list, filter contacts, review AI suggestions, and keep CRM organized on WhatsApp.',
        readingMinutes: 9
      }
    }
  },
  {
    id: 'whatsapp-scheduling',
    topicId: 'agenda',
    updatedAt: '2026-03-12',
    relatedIds: ['connect-whatsapp-business-qr-code', 'train-ai-for-whatsapp-support'],
    localized: {
      'pt-BR': {
        slug: 'agendamento-pelo-whatsapp',
        title: 'Agendamento pelo WhatsApp: como organizar horários e confirmações',
        seoTitle: 'Agendamento pelo WhatsApp | Guia para organizar horários com IA',
        seoDescription: 'Veja como organizar horários, agendas e confirmações de compromissos pelo WhatsApp com apoio da IA.',
        excerpt: 'Guia para configurar horários, revisar eventos e manter agendamentos sem conflito na operação via WhatsApp.',
        readingMinutes: 8
      },
      en: {
        slug: 'whatsapp-scheduling',
        title: 'WhatsApp scheduling: how to organize time slots and confirmations',
        seoTitle: 'WhatsApp scheduling | Guide to organize appointments with AI',
        seoDescription: 'See how to organize time slots, calendars, and appointment confirmations through WhatsApp with AI support.',
        excerpt: 'Guide to configure availability, review events, and keep scheduling conflict-free in your WhatsApp operation.',
        readingMinutes: 8
      }
    }
  },
  {
    id: 'whatsapp-follow-up',
    topicId: 'leads',
    sectionIds: ['followup'],
    updatedAt: '2026-03-12',
    relatedIds: ['whatsapp-crm-and-leads', 'train-ai-for-whatsapp-support'],
    localized: {
      'pt-BR': {
        slug: 'follow-up-no-whatsapp',
        title: 'Follow-up no WhatsApp: como retomar conversas sem perder contexto',
        seoTitle: 'Follow-up no WhatsApp | Como retomar conversas com IA',
        seoDescription: 'Aprenda como fazer follow-up no WhatsApp com contexto, próximo contato e apoio da IA para recuperar oportunidades.',
        excerpt: 'Guia para estruturar follow-up no WhatsApp, definir próximo contato e retomar leads com contexto comercial.',
        readingMinutes: 6
      },
      en: {
        slug: 'whatsapp-follow-up',
        title: 'WhatsApp follow-up: how to resume conversations without losing context',
        seoTitle: 'WhatsApp follow-up | How to resume conversations with AI',
        seoDescription: 'Learn how to run WhatsApp follow-ups with context, next-contact reminders, and AI assistance to recover opportunities.',
        excerpt: 'Guide to structure WhatsApp follow-ups, define the next contact, and resume leads with commercial context.',
        readingMinutes: 6
      }
    }
  },
  {
    id: 'whatsapp-broadcasts',
    topicId: 'transmissao',
    updatedAt: '2026-03-12',
    relatedIds: ['whatsapp-crm-and-leads', 'whatsapp-follow-up'],
    localized: {
      'pt-BR': {
        slug: 'transmissao-no-whatsapp',
        title: 'Transmissão no WhatsApp: como criar campanhas com segurança',
        seoTitle: 'Transmissão no WhatsApp | Como criar campanhas e acompanhar respostas',
        seoDescription: 'Aprenda como criar transmissões no WhatsApp com segmentação, mensagem objetiva e acompanhamento do envio.',
        excerpt: 'Guia para criar campanhas de transmissão no WhatsApp com segmentação, revisão e acompanhamento.',
        readingMinutes: 7
      },
      en: {
        slug: 'whatsapp-broadcasts',
        title: 'WhatsApp broadcasts: how to create campaigns safely',
        seoTitle: 'WhatsApp broadcasts | How to create campaigns and track replies',
        seoDescription: 'Learn how to create WhatsApp broadcasts with segmentation, concise messaging, and delivery tracking.',
        excerpt: 'Guide to build WhatsApp broadcast campaigns with segmentation, review, and execution tracking.',
        readingMinutes: 7
      }
    }
  }
]

export function getPublicGuidesIndexPath(locale: PublicLocale): string {
  return locale === 'en' ? '/en/guides' : '/pt/guias'
}

export function getPublicGuidePath(locale: PublicLocale, slug: string): string {
  return `${getPublicGuidesIndexPath(locale)}/${slug}`
}

export function getPublicGuidePathById(locale: PublicLocale, id: PublicGuideId): string {
  const definition = GUIDE_DEFINITIONS.find((guide) => guide.id === id)
  if (!definition) {
    throw new Error(`Public guide not found: ${id}`)
  }

  return getPublicGuidePath(locale, definition.localized[locale].slug)
}

export function getPublicGuideAlternates(id: PublicGuideId): Record<'pt-BR' | 'en' | 'x-default', string> {
  const definition = GUIDE_DEFINITIONS.find((guide) => guide.id === id)
  if (!definition) {
    throw new Error(`Public guide not found: ${id}`)
  }

  return {
    'pt-BR': getPublicGuidePath('pt-BR', definition.localized['pt-BR'].slug),
    en: getPublicGuidePath('en', definition.localized.en.slug),
    'x-default': getPublicGuidePath('pt-BR', definition.localized['pt-BR'].slug)
  }
}

export function listPublicGuides(locale: PublicLocale = 'pt-BR'): PublicGuide[] {
  const topics = tutorialTopicsByLocale[locale]

  return GUIDE_DEFINITIONS.map((definition) => {
    const localized = definition.localized[locale]
    const topic = topics.get(definition.topicId)
    if (!topic) {
      throw new Error(`Tutorial topic not found for public guide: ${definition.topicId} (${locale})`)
    }

    const sections = definition.sectionIds?.length
      ? topic.sections.filter((section) => definition.sectionIds?.includes(section.id))
      : topic.sections

    return {
      id: definition.id,
      locale,
      slug: localized.slug,
      path: getPublicGuidePath(locale, localized.slug),
      topicId: definition.topicId,
      sectionIds: definition.sectionIds,
      title: localized.title,
      seoTitle: localized.seoTitle,
      seoDescription: localized.seoDescription,
      excerpt: localized.excerpt,
      updatedAt: definition.updatedAt,
      readingMinutes: localized.readingMinutes,
      relatedIds: definition.relatedIds,
      relatedSlugs: definition.relatedIds.map((relatedId) => {
        const relatedGuide = GUIDE_DEFINITIONS.find((item) => item.id === relatedId)
        if (!relatedGuide) {
          throw new Error(`Related public guide not found: ${relatedId}`)
        }
        return relatedGuide.localized[locale].slug
      }),
      topic,
      sections
    }
  })
}

export function getPublicGuideBySlug(locale: PublicLocale, slug: string): PublicGuide | null {
  return listPublicGuides(locale).find((guide) => guide.slug === slug) ?? null
}

export function getPublicGuideById(locale: PublicLocale, id: PublicGuideId): PublicGuide | null {
  return listPublicGuides(locale).find((guide) => guide.id === id) ?? null
}

export function getPublicGuideLocalePrefix(locale: PublicLocale): 'pt' | 'en' {
  return publicLocaleToPrefix(locale)
}
