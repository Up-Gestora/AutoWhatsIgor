import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PublicGuideContent } from '@/components/public-site/guide-content'
import { PublicPageShell } from '@/components/public-site/page-shell'
import { JsonLd } from '@/components/seo/json-ld'
import { getPublicGuideAlternates, getPublicGuideById, getPublicGuideBySlug, listPublicGuides } from '@/lib/public-site/guides'
import { createPublicMetadata } from '@/lib/seo/public-metadata'
import { createArticleJsonLd, createBreadcrumbJsonLd } from '@/lib/seo/structured-data'

export const dynamicParams = false

export function generateStaticParams() {
  return listPublicGuides('en').map((guide) => ({ slug: guide.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const guide = getPublicGuideBySlug('en', slug)
  if (!guide) {
    return {}
  }

  return createPublicMetadata({
    title: guide.seoTitle,
    description: guide.seoDescription,
    path: guide.path,
    locale: 'en',
    type: 'article',
    alternatesByLocale: getPublicGuideAlternates(guide.id)
  })
}

export default async function EnGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const guide = getPublicGuideBySlug('en', slug)
  if (!guide) {
    notFound()
  }

  const relatedGuides = guide.relatedIds
    .map((id) => getPublicGuideById('en', id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  return (
    <>
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: 'Home', path: '/en' },
          { name: 'Guides', path: '/en/guides' },
          { name: guide.title, path: guide.path }
        ])}
      />
      <JsonLd
        data={createArticleJsonLd({
          headline: guide.title,
          description: guide.seoDescription,
          path: guide.path,
          dateModified: guide.updatedAt
        })}
      />

      <PublicPageShell
        locale="en"
        eyebrow="Practical guide"
        title={guide.title}
        description={guide.excerpt}
        breadcrumbs={[
          { label: 'Home', href: '/en' },
          { label: 'Guides', href: '/en/guides' },
          { label: guide.title }
        ]}
      >
        <PublicGuideContent guide={guide} locale="en" />

        {relatedGuides.length ? (
          <section className="mt-8 rounded-3xl border border-white/10 bg-surface/55 p-6 md:p-8">
            <h2 className="text-2xl font-bold text-white">Related guides</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {relatedGuides.map((relatedGuide) => (
                <Link
                  key={relatedGuide.slug}
                  href={relatedGuide.path}
                  className="rounded-2xl border border-white/10 bg-surface-light/30 p-5 transition-colors hover:border-primary/30"
                >
                  <h3 className="font-semibold text-white">{relatedGuide.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-400">{relatedGuide.excerpt}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </PublicPageShell>
    </>
  )
}
