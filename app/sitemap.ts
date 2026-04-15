import type { MetadataRoute } from 'next'
import { listPublicInstitutionalPages } from '@/lib/public-site/institutional-pages'
import { listPublicGuides } from '@/lib/public-site/guides'
import { SITE_URL } from '@/lib/site-url'

function buildUrl(path: string) {
  return `${SITE_URL}${path}`
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const ptGuides = listPublicGuides('pt-BR')
  const enGuides = listPublicGuides('en')
  const ptInstitutionalPages = listPublicInstitutionalPages('pt-BR')
  const enInstitutionalPages = listPublicInstitutionalPages('en')

  const baseEntries: MetadataRoute.Sitemap = [
    {
      url: buildUrl('/pt'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1
    },
    {
      url: buildUrl('/en'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9
    },
    {
      url: buildUrl('/pt/guias'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9
    },
    {
      url: buildUrl('/en/guides'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85
    },
    {
      url: buildUrl('/pt/atualizacoes'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8
    },
    {
      url: buildUrl('/en/updates'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.75
    }
  ]

  const ptGuideEntries: MetadataRoute.Sitemap = ptGuides.map((guide) => ({
    url: buildUrl(guide.path),
    lastModified: new Date(guide.updatedAt),
    changeFrequency: 'monthly',
    priority: 0.75
  }))

  const enGuideEntries: MetadataRoute.Sitemap = enGuides.map((guide) => ({
    url: buildUrl(guide.path),
    lastModified: new Date(guide.updatedAt),
    changeFrequency: 'monthly',
    priority: 0.7
  }))

  const ptInstitutionalEntries: MetadataRoute.Sitemap = ptInstitutionalPages.map((page) => ({
    url: buildUrl(page.path),
    lastModified: new Date(page.updatedAt),
    changeFrequency: 'monthly',
    priority: page.id === 'about' || page.id === 'contact' ? 0.7 : 0.5
  }))

  const enInstitutionalEntries: MetadataRoute.Sitemap = enInstitutionalPages.map((page) => ({
    url: buildUrl(page.path),
    lastModified: new Date(page.updatedAt),
    changeFrequency: 'monthly',
    priority: page.id === 'about' || page.id === 'contact' ? 0.65 : 0.45
  }))

  return [
    ...baseEntries,
    ...ptGuideEntries,
    ...enGuideEntries,
    ...ptInstitutionalEntries,
    ...enInstitutionalEntries
  ]
}
