import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { getInstitutionalPagePathById } from '@/lib/public-site/institutional-pages'
import { getPublicGuidesIndexPath } from '@/lib/public-site/guides'
import { getPublicHomePath, getPublicLoginPath, getPublicSignupPath, getPublicUpdatesPath } from '@/lib/public-site/paths'
import type { PublicLocale } from '@/lib/public-site/types'

type PublicSiteHeaderProps = {
  locale: PublicLocale
}

export function PublicSiteHeader({ locale }: PublicSiteHeaderProps) {
  const isEn = locale === 'en'
  const navLinks = [
    { label: isEn ? 'Guides' : 'Guias', href: getPublicGuidesIndexPath(locale) },
    { label: isEn ? 'Updates' : 'Atualizações', href: getPublicUpdatesPath(locale) },
    { label: isEn ? 'About' : 'Sobre', href: getInstitutionalPagePathById(locale, 'about') },
    { label: isEn ? 'Contact' : 'Contato', href: getInstitutionalPagePathById(locale, 'contact') }
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-surface/80 backdrop-blur-md">
      <nav className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href={getPublicHomePath(locale)} className="group flex items-center gap-2" aria-label="AutoWhats">
          <div className="gradient-primary flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110">
            <MessageCircle className="h-6 w-6 text-black" />
          </div>
          <span className="text-xl font-bold text-white">
            Auto<span className="gradient-text">Whats</span>
          </span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-300/85 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <ButtonLink href={getPublicLoginPath(locale)} variant="ghost">
            Login
          </ButtonLink>
          <ButtonLink href={getPublicSignupPath(locale)}>
            {isEn ? 'Free trial' : 'Teste grátis'}
          </ButtonLink>
        </div>
      </nav>
    </header>
  )
}
