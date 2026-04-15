import { MessageCircle } from 'lucide-react'

const footerLinks = [
  { label: 'Product', href: '#product' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Guides', href: '/pt/guias' },
  { label: 'About', href: '/pt/sobre' },
  { label: 'Contact', href: '/pt/contato' }
]

export function FooterV2({
  homeHref = '/en',
  loginHref = '/en/login',
  signupHref = '/en/signup'
}: {
  homeHref?: string
  loginHref?: string
  signupHref?: string
}) {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-surface border-t border-white/5">
      <div className="container mx-auto px-4 py-14">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-10">
          <div>
            <a href={homeHref} className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-black" />
              </div>
              <span className="text-xl font-bold text-white">
                Auto<span className="gradient-text">Whats</span>
              </span>
            </a>
            <p className="text-gray-400 mt-3 max-w-sm">
              WhatsApp with AI trained on your business: faster support, higher conversion.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            {footerLinks.map((link) => (
              <a key={link.href} href={link.href} className="text-gray-400 hover:text-primary transition-colors">
                {link.label}
              </a>
            ))}
            <a href={loginHref} className="text-gray-400 hover:text-primary transition-colors">
              Login
            </a>
            <a href={signupHref} className="text-gray-400 hover:text-primary transition-colors">
              Free trial
            </a>
          </div>
        </div>

        <div className="pt-10 mt-10 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-gray-500 text-sm">Copyright {year} AutoWhats. All rights reserved.</p>
          <p className="text-gray-500 text-sm">Built in Brazil.</p>
        </div>
      </div>
    </footer>
  )
}
