import { PublicPageShell } from '@/components/public-site/page-shell'
import { PublicUpdatesFeed } from '@/components/public-site/updates-feed'
import { JsonLd } from '@/components/seo/json-ld'
import { createPublicMetadata } from '@/lib/seo/public-metadata'
import { createBreadcrumbJsonLd } from '@/lib/seo/structured-data'

const PT_UPDATES_PATH = '/pt/atualizacoes'
const EN_UPDATES_PATH = '/en/updates'

export const metadata = createPublicMetadata({
  title: 'AutoWhats Updates | Public product changelog',
  description:
    'Follow the main AutoWhats updates across AI support, CRM, scheduling, files, broadcasts, and platform stability.',
  path: EN_UPDATES_PATH,
  locale: 'en',
  type: 'website',
  alternatesByLocale: {
    'pt-BR': PT_UPDATES_PATH,
    en: EN_UPDATES_PATH,
    'x-default': PT_UPDATES_PATH
  }
})

export default function EnUpdatesPage() {
  return (
    <>
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: 'Home', path: '/en' },
          { name: 'Updates', path: EN_UPDATES_PATH }
        ])}
      />

      <PublicPageShell
        locale="en"
        eyebrow="Public changelog"
        title="AutoWhats updates"
        description="Public view of the main product releases across WhatsApp automation with AI, CRM, scheduling, files, and broadcasts."
        breadcrumbs={[
          { label: 'Home', href: '/en' },
          { label: 'Updates' }
        ]}
      >
        <PublicUpdatesFeed locale="en" />
      </PublicPageShell>
    </>
  )
}
