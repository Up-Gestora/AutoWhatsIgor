'use client'

import { MessageCircle, Instagram, Linkedin, Twitter } from 'lucide-react'

const socialLinks = [
  { icon: Instagram, href: '#', label: 'Instagram' },
  { icon: Linkedin, href: '#', label: 'LinkedIn' },
  { icon: Twitter, href: '#', label: 'Twitter' },
]

const footerLinks = [
  {
    title: 'Produto',
    links: [
      { label: 'Funcionalidades', href: '#features' },
      { label: 'Como Funciona', href: '#como-funciona' },
      { label: 'Depoimentos', href: '#depoimentos' },
      { label: 'Preços', href: '#precos' },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Sobre', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Contato', href: '#' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacidade', href: '#' },
      { label: 'Termos de Uso', href: '#' },
    ],
  },
]

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-surface border-t border-surface-lighter">
      <div className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-5 gap-12 mb-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <a href="#" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-black" />
              </div>
              <span className="text-xl font-bold text-white">
                Auto<span className="gradient-text">Whats</span>
              </span>
            </a>
            <p className="text-gray-400 mb-6 max-w-sm">
              Automatize o atendimento do seu WhatsApp com inteligência artificial. 
              Mais vendas, menos trabalho manual.
            </p>
            {/* Social Links */}
            <div className="flex gap-4">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  className="w-10 h-10 rounded-lg bg-surface-lighter flex items-center justify-center text-gray-400 hover:text-primary hover:bg-surface-light transition-colors"
                  aria-label={social.label}
                >
                  <social.icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {footerLinks.map((group) => (
            <div key={group.title}>
              <h4 className="font-semibold text-white mb-4">{group.title}</h4>
              <ul className="space-y-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-gray-400 hover:text-primary transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="pt-8 border-t border-surface-lighter flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-500 text-sm">
            © {currentYear} AutoWhats. Todos os direitos reservados.
          </p>
          <p className="text-gray-500 text-sm">
            Feito com 💚 no Brasil
          </p>
        </div>
      </div>
    </footer>
  )
}

