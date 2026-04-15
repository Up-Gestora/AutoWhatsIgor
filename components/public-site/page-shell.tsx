import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { PublicSiteHeader } from '@/components/public-site/site-header'
import { PublicSiteFooter } from '@/components/public-site/site-footer'
import type { PublicLocale } from '@/lib/public-site/types'

type BreadcrumbItem = {
  label: string
  href?: string
}

type PublicPageShellProps = {
  locale: PublicLocale
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
  breadcrumbs?: BreadcrumbItem[]
}

export function PublicPageShell(props: PublicPageShellProps) {
  const breadcrumbs = props.breadcrumbs ?? []

  return (
    <main lang={props.locale} className="min-h-screen bg-surface">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            background:
              'radial-gradient(1200px 600px at 18% 10%, rgba(37,211,102,0.22), transparent 60%), radial-gradient(900px 500px at 82% 16%, rgba(7,94,84,0.18), transparent 55%), radial-gradient(800px 540px at 50% 86%, rgba(52,232,121,0.10), transparent 60%)'
          }}
        />
      </div>

      <PublicSiteHeader locale={props.locale} />

      <section className="border-b border-white/5">
        <div className="container mx-auto px-4 py-14 md:py-18">
          {breadcrumbs.length ? (
            <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-gray-400">
              {breadcrumbs.map((item, index) => (
                <div key={`${item.label}-${index}`} className="flex items-center gap-2">
                  {item.href ? (
                    <Link href={item.href} className="transition-colors hover:text-white">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-gray-200">{item.label}</span>
                  )}
                  {index < breadcrumbs.length - 1 ? <ChevronRight className="h-4 w-4 text-gray-500" /> : null}
                </div>
              ))}
            </nav>
          ) : null}

          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface-light/30 px-4 py-2">
              <span className="text-sm text-gray-300/90">{props.eyebrow}</span>
            </div>
            <h1 className="mt-6 text-4xl font-bold leading-tight text-white md:text-5xl">{props.title}</h1>
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-gray-300/80">{props.description}</p>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-12 md:py-16">{props.children}</section>

      <PublicSiteFooter locale={props.locale} />
    </main>
  )
}
