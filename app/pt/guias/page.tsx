import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PublicPageShell } from '@/components/public-site/page-shell'
import { JsonLd } from '@/components/seo/json-ld'
import { getPublicGuidesIndexPath, listPublicGuides } from '@/lib/public-site/guides'
import { createPublicMetadata } from '@/lib/seo/public-metadata'
import { createBreadcrumbJsonLd } from '@/lib/seo/structured-data'

function getGuideImage(guide: ReturnType<typeof listPublicGuides>[number]) {
  for (const section of guide.sections) {
    const image = section.blocks.find((block) => block.type === 'image')
    if (image && image.type === 'image') {
      return image
    }
  }
  return null
}

const PT_GUIDES_PATH = '/pt/guias'
const EN_GUIDES_PATH = '/en/guides'

export const metadata = createPublicMetadata({
  title: 'Guias de automação de WhatsApp com IA | AutoWhats',
  description:
    'Aprenda como conectar WhatsApp, treinar IA, organizar leads, fazer follow-up, agendar e criar transmissões com os guias do AutoWhats.',
  path: PT_GUIDES_PATH,
  locale: 'pt-BR',
  type: 'website',
  alternatesByLocale: {
    'pt-BR': PT_GUIDES_PATH,
    en: EN_GUIDES_PATH,
    'x-default': PT_GUIDES_PATH
  }
})

export default function GuidesIndexPage() {
  const guides = listPublicGuides('pt-BR')

  return (
    <>
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: 'Home', path: '/pt' },
          { name: 'Guias', path: PT_GUIDES_PATH }
        ])}
      />

      <PublicPageShell
        locale="pt-BR"
        eyebrow="Guias públicos"
        title="Guias práticos de automação, CRM e atendimento no WhatsApp"
        description="Conteúdo reaproveitado do produto para ajudar você a entender como conectar, configurar e operar atendimento com IA no WhatsApp."
        breadcrumbs={[
          { label: 'Home', href: '/pt' },
          { label: 'Guias' }
        ]}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {guides.map((guide) => {
            const image = getGuideImage(guide)

            return (
              <article
                key={guide.slug}
                className="overflow-hidden rounded-3xl border border-white/10 bg-surface/55"
              >
                {image ? (
                  <div className="border-b border-white/5 bg-surface-light/30">
                    <Image
                      src={image.src}
                      alt={image.alt}
                      width={1600}
                      height={900}
                      className="h-auto w-full object-cover"
                    />
                  </div>
                ) : null}

                <div className="p-6">
                  <div className="flex flex-wrap gap-2">
                    {guide.topic.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/10 bg-surface-light/35 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <h2 className="mt-4 text-2xl font-bold text-white">{guide.title}</h2>
                  <p className="mt-3 leading-relaxed text-gray-300/80">{guide.excerpt}</p>

                  <div className="mt-6 flex items-center justify-between gap-4 text-sm text-gray-400">
                    <span>{guide.readingMinutes} min de leitura</span>
                    <Link
                      href={guide.path}
                      className="inline-flex items-center gap-2 font-semibold text-primary transition-colors hover:text-primary-light"
                    >
                      Ler guia
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </PublicPageShell>
    </>
  )
}
