import { SITE_URL } from '@/lib/site-url'
import { WHATSAPP_DISPLAY, WHATSAPP_LINK } from '@/lib/contact'

type FaqEntry = {
  q: string
  a: string
}

type BreadcrumbItem = {
  name: string
  path: string
}

export function createOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'AutoWhats',
    url: SITE_URL,
    logo: `${SITE_URL}/icon`,
    description:
      'Automação de WhatsApp com IA para atendimento, CRM, follow-up e agendamentos.',
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        telephone: WHATSAPP_DISPLAY,
        url: WHATSAPP_LINK,
        availableLanguage: ['pt-BR', 'en']
      }
    ]
  }
}

export function createWebsiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AutoWhats',
    url: SITE_URL,
    inLanguage: ['pt-BR', 'en']
  }
}

export function createSoftwareApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AutoWhats',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description:
      'Plataforma web para automação de WhatsApp com IA, CRM, follow-up, agenda e transmissões.',
    featureList: [
      'Atendimento no WhatsApp com IA',
      'CRM com leads e clientes',
      'Follow-up com contexto',
      'Agendamento pelo WhatsApp',
      'Transmissão e campanhas'
    ]
  }
}

export function createFaqJsonLd(faqs: readonly FaqEntry[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a
      }
    }))
  }
}

export function createBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`
    }))
  }
}

export function createArticleJsonLd(options: {
  headline: string
  description: string
  path: string
  dateModified: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: options.headline,
    description: options.description,
    dateModified: options.dateModified,
    author: {
      '@type': 'Organization',
      name: 'AutoWhats'
    },
    publisher: {
      '@type': 'Organization',
      name: 'AutoWhats'
    },
    mainEntityOfPage: `${SITE_URL}${options.path}`
  }
}
