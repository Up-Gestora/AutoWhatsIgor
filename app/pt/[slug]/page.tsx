import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ButtonLink } from '@/components/ui/button'
import { PublicPageShell } from '@/components/public-site/page-shell'
import { JsonLd } from '@/components/seo/json-ld'
import { getInstitutionalPageAlternates, getInstitutionalPageBySlug, getInstitutionalPagePathById, listPublicInstitutionalPages } from '@/lib/public-site/institutional-pages'
import { getPublicSignupPath } from '@/lib/public-site/paths'
import { WHATSAPP_LINK } from '@/lib/contact'
import { createPublicMetadata } from '@/lib/seo/public-metadata'
import { createArticleJsonLd, createBreadcrumbJsonLd } from '@/lib/seo/structured-data'

export const dynamicParams = false

export function generateStaticParams() {
  return listPublicInstitutionalPages('pt-BR').map((page) => ({ slug: page.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = getInstitutionalPageBySlug('pt-BR', slug)
  if (!page) {
    return {}
  }

  return createPublicMetadata({
    title: page.seoTitle,
    description: page.seoDescription,
    path: page.path,
    locale: 'pt-BR',
    type: 'article',
    alternatesByLocale: getInstitutionalPageAlternates(page.id)
  })
}

export default async function InstitutionalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = getInstitutionalPageBySlug('pt-BR', slug)
  if (!page) {
    notFound()
  }

  const isContactPage = page.id === 'contact'

  return (
    <>
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: 'Home', path: '/pt' },
          { name: page.title, path: page.path }
        ])}
      />
      <JsonLd
        data={createArticleJsonLd({
          headline: page.title,
          description: page.seoDescription,
          path: page.path,
          dateModified: page.updatedAt
        })}
      />

      <PublicPageShell
        locale="pt-BR"
        eyebrow="Página institucional"
        title={page.title}
        description={page.excerpt}
        breadcrumbs={[
          { label: 'Home', href: '/pt' },
          { label: page.title }
        ]}
      >
        <div className="space-y-6">
          {page.sections.map((section) => (
            <section
              key={section.title}
              className="rounded-3xl border border-white/10 bg-surface/55 p-6 md:p-8"
            >
              <h2 className="text-2xl font-bold text-white">{section.title}</h2>
              <div className="mt-4 space-y-4">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="leading-relaxed text-gray-300">
                    {paragraph}
                  </p>
                ))}
                {section.bullets?.length ? (
                  <ul className="space-y-3">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3 text-gray-300">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}

          <section className="rounded-3xl border border-white/10 bg-surface/55 p-6 md:p-8">
            <h2 className="text-2xl font-bold text-white">
              {isContactPage ? 'Falar com o time' : 'Próximo passo'}
            </h2>
            <p className="mt-3 max-w-3xl text-gray-300/80">
              {isContactPage
                ? 'Se quiser conversar sobre operação, implantação ou aderência ao seu negócio, o WhatsApp comercial é o caminho mais rápido.'
                : 'Se quiser ver a IA em ação no seu próprio WhatsApp, o melhor caminho é iniciar um teste grátis.'}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href={getPublicSignupPath('pt-BR')}>Teste grátis</ButtonLink>
              {isContactPage ? (
                <ButtonLink href={WHATSAPP_LINK} target="_blank" rel="noreferrer noopener" variant="outline">
                  Falar no WhatsApp
                </ButtonLink>
              ) : (
                <Link
                  href={getInstitutionalPagePathById('pt-BR', 'contact')}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border-2 border-primary px-6 py-2 text-sm font-semibold text-primary transition-all duration-300 hover:bg-primary hover:text-black"
                >
                  Ver contato
                </Link>
              )}
            </div>
          </section>
        </div>
      </PublicPageShell>
    </>
  )
}
