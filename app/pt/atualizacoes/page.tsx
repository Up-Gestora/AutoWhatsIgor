import { PublicPageShell } from '@/components/public-site/page-shell'
import { PublicUpdatesFeed } from '@/components/public-site/updates-feed'
import { JsonLd } from '@/components/seo/json-ld'
import { createPublicMetadata } from '@/lib/seo/public-metadata'
import { createBreadcrumbJsonLd } from '@/lib/seo/structured-data'

const PT_UPDATES_PATH = '/pt/atualizacoes'
const EN_UPDATES_PATH = '/en/updates'

export const metadata = createPublicMetadata({
  title: 'Atualizações do AutoWhats | Changelog público do produto',
  description:
    'Acompanhe as principais atualizações do AutoWhats em atendimento com IA, CRM, agenda, arquivos, transmissões e estabilidade.',
  path: PT_UPDATES_PATH,
  locale: 'pt-BR',
  type: 'website',
  alternatesByLocale: {
    'pt-BR': PT_UPDATES_PATH,
    en: EN_UPDATES_PATH,
    'x-default': PT_UPDATES_PATH
  }
})

export default function PublicUpdatesPage() {
  return (
    <>
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: 'Home', path: '/pt' },
          { name: 'Atualizações', path: PT_UPDATES_PATH }
        ])}
      />

      <PublicPageShell
        locale="pt-BR"
        eyebrow="Changelog público"
        title="Atualizações do AutoWhats"
        description="Visão pública das principais entregas do produto em automação de WhatsApp com IA, CRM, agendamento, arquivos e transmissões."
        breadcrumbs={[
          { label: 'Home', href: '/pt' },
          { label: 'Atualizações' }
        ]}
      >
        <PublicUpdatesFeed locale="pt-BR" />
      </PublicPageShell>
    </>
  )
}
