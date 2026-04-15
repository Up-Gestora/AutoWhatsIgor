'use client'

import { useState } from 'react'
import { Menu, X, MessageCircle } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'

const navLinks = [
  { href: '#features', label: 'Funcionalidades' },
  { href: '#como-funciona', label: 'Como Funciona' },
  { href: '#depoimentos', label: 'Depoimentos' },
  { href: '#precos', label: 'Preços' },
]

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { user, loading } = useAuth()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-md border-b border-surface-lighter">
      <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2 group">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center group-hover:scale-110 transition-transform">
            <MessageCircle className="w-6 h-6 text-black" />
          </div>
          <span className="text-xl font-bold text-white">
            Auto<span className="gradient-text">Whats</span>
          </span>
        </a>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-gray-400 hover:text-white transition-colors font-medium"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="hidden md:flex items-center gap-4">
          {!loading && user ? (
            <ButtonLink href="/dashboard" variant="default">
              Dashboard
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost">
                Login
              </ButtonLink>
              <ButtonLink href="/login?mode=signup">
                Teste gratuitamente
              </ButtonLink>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 text-gray-400 hover:text-white"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
        >
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {/* Mobile Menu */}
      <div
        className={cn(
          "md:hidden absolute top-16 left-0 right-0 bg-surface border-b border-surface-lighter transition-all duration-300",
          isMenuOpen ? "opacity-100 visible" : "opacity-0 invisible"
        )}
      >
        <div className="container mx-auto px-4 py-4 flex flex-col gap-4">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-gray-400 hover:text-white transition-colors font-medium py-2"
              onClick={() => setIsMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <div className="flex flex-col gap-2 mt-2">
            {!loading && user ? (
              <ButtonLink href="/dashboard" variant="default" onClick={() => setIsMenuOpen(false)}>
                Dashboard
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/login" variant="ghost" onClick={() => setIsMenuOpen(false)}>
                  Login
                </ButtonLink>
                <ButtonLink href="/login?mode=signup" onClick={() => setIsMenuOpen(false)}>
                  Teste gratuitamente
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
