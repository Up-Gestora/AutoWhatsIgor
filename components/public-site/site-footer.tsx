import Link from 'next/link'
import { getInstitutionalPagePathById } from '@/lib/public-site/institutional-pages'
import { getPublicGuidesIndexPath } from '@/lib/public-site/guides'
import { getPublicHomePath, getPublicUpdatesPath } from '@/lib/public-site/paths'
import type { PublicLocale } from '@/lib/public-site/types'

type PublicSiteFooterProps = {
  locale: PublicLocale
}

export function PublicSiteFooter({ locale }: PublicSiteFooterProps) {
  const year = new Date().getFullYear()
  const isEn = locale === 'en'
  const footerLinks = [
    { label: 'Home', href: getPublicHomePath(locale) },
    { label: isEn ? 'Guides' : 'Guias', href: getPublicGuidesIndexPath(locale) },
    { label: isEn ? 'Updates' : 'Atualizações', href: getPublicUpdatesPath(locale) },
    { label: isEn ? 'About' : 'Sobre', href: getInstitutionalPagePathById(locale, 'about') },
    { label: isEn ? 'Contact' : 'Contato', href: getInstitutionalPagePathById(locale, 'contact') },
    { label: isEn ? 'Privacy' : 'Privacidade', href: getInstitutionalPagePathById(locale, 'privacy') },
    { label: isEn ? 'Terms' : 'Termos', href: getInstitutionalPagePathById(locale, 'terms') }
  ]

  return (
    <footer className="border-t border-white/5 bg-surface">
      <div className="container mx-auto px-4 py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="text-lg font-semibold text-white">AutoWhats</h2>
            <p className="mt-2 text-sm text-gray-400">
              {isEn
                ? 'WhatsApp automation with AI for support, CRM, follow-ups, and scheduling.'
                : 'Automação de WhatsApp com IA para atendimento, CRM, follow-up e agendamentos.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-gray-400 transition-colors hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-8 border-t border-white/5 pt-6 text-sm text-gray-500">
          {isEn
            ? `Copyright ${year} AutoWhats. All rights reserved.`
            : `Copyright ${year} AutoWhats. Todos os direitos reservados.`}
        </div>
      </div>
    </footer>
  )
}
