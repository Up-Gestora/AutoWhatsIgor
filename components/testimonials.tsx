'use client'

import { Star } from 'lucide-react'

type Testimonial = {
  name: string
  role: string
  company: string
  quote: string
  metric: string
  initials: string
  gradientFrom: string
  gradientTo: string
}

const testimonials: Testimonial[] = [
  {
    name: 'Mariana Lima',
    role: 'Coordenadora de Atendimento',
    company: 'Clínica Vida Plena',
    quote:
      'Em 2 semanas, o AutoWhats respondeu 70% das dúvidas recorrentes e liberou nossa equipe para casos complexos.',
    metric: '−32% tempo de resposta',
    initials: 'ML',
    gradientFrom: '#34E879',
    gradientTo: '#25D366',
  },
  {
    name: 'Rafael Souza',
    role: 'Fundador',
    company: 'Urban Sneakers',
    quote:
      'As conversas no WhatsApp viraram vendas. A IA entende o contexto e passa para o humano na hora certa.',
    metric: '+18% conversões',
    initials: 'RS',
    gradientFrom: '#25D366',
    gradientTo: '#0A8F7F',
  },
  {
    name: 'Camila Torres',
    role: 'Gerente de Operações',
    company: 'Restaurante Sabor & Arte',
    quote:
      'Reservas e cardápio ficaram automáticos. A equipe parou de responder as mesmas perguntas o dia todo.',
    metric: '+4h/dia economizadas',
    initials: 'CT',
    gradientFrom: '#0A8F7F',
    gradientTo: '#075E54',
  },
]

const buildAvatarSvg = (initials: string, fromColor: string, toColor: string) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="${initials}">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${fromColor}" />
          <stop offset="100%" stop-color="${toColor}" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="48" fill="url(#g)" />
      <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-family="Outfit, Arial, sans-serif" font-size="34" font-weight="700" fill="#0D1117">
        ${initials}
      </text>
    </svg>
  `

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function Testimonials() {
  return (
    <section id="depoimentos" className="py-24 relative bg-surface-light/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-light border border-surface-lighter mb-6">
            <Star className="w-4 h-4 text-primary" />
            <span className="text-sm text-gray-400">Depoimentos reais</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Clientes que j&aacute;{' '}
            <span className="gradient-text">automatizaram</span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Hist&oacute;rias de empresas que reduziram o volume de atendimento manual e venderam mais com a IA.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.name}
              className="bg-surface-light border border-surface-lighter rounded-2xl p-8 card-hover h-full flex flex-col"
            >
              <div className="flex items-center gap-1 mb-6 text-primary">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star key={index} className="w-4 h-4 fill-current" />
                ))}
              </div>

              <p className="text-gray-200 leading-relaxed mb-6 flex-1">
                &ldquo;{testimonial.quote}&rdquo;
              </p>

              <div className="text-sm text-primary font-semibold mb-6">
                {testimonial.metric}
              </div>

              <div className="flex items-center gap-4">
                <img
                  src={buildAvatarSvg(
                    testimonial.initials,
                    testimonial.gradientFrom,
                    testimonial.gradientTo
                  )}
                  alt={testimonial.name}
                  className="w-12 h-12 rounded-full border border-surface-lighter"
                  loading="lazy"
                />
                <div>
                  <p className="text-white font-semibold">{testimonial.name}</p>
                  <p className="text-gray-400 text-sm">
                    {testimonial.role} &mdash; {testimonial.company}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
