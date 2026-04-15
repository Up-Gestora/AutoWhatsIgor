import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AutoWhats | WhatsApp com IA (V2)',
  description:
    'Automatize seu atendimento no WhatsApp com IA treinada no seu negócio. Conecte via QR, defina regras e escale com CRM, agenda e follow-ups.',
  alternates: { canonical: '/' },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false
    }
  },
  openGraph: {
    title: 'AutoWhats | WhatsApp com IA (V2)',
    description:
      'Automatize seu atendimento no WhatsApp com IA treinada no seu negócio. Conecte via QR, defina regras e escale com CRM, agenda e follow-ups.',
    type: 'website',
    locale: 'pt_BR'
  }
}

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return children
}
