import Image from 'next/image'
import { Sparkles, Star } from 'lucide-react'
import { Reveal } from '@/components/marketing-v2/reveal'
import { cn } from '@/lib/utils'

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
    role: 'Support Coordinator',
    company: 'Vida Plena Clinic',
    quote:
      'In 2 weeks, AutoWhats answered most recurring questions and freed our team for complex cases.',
    metric: '−32% response time',
    initials: 'ML',
    gradientFrom: '#34E879',
    gradientTo: '#25D366'
  },
  {
    name: 'Rafael Souza',
    role: 'Founder',
    company: 'Urban Sneakers',
    quote:
      'WhatsApp conversations turned into sales. AI understands context and hands off to humans at the right moment.',
    metric: '+18% conversions',
    initials: 'RS',
    gradientFrom: '#25D366',
    gradientTo: '#0A8F7F'
  },
  {
    name: 'Camila Torres',
    role: 'Operations Manager',
    company: 'Sabor & Arte Restaurant',
    quote:
      'Reservations and menu replies became automatic. The team stopped answering the same questions all day.',
    metric: '+4h/day saved',
    initials: 'CT',
    gradientFrom: '#0A8F7F',
    gradientTo: '#075E54'
  }
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

function TestimonialCard({ item, className }: { item: Testimonial; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-3xl p-[1px] bg-[linear-gradient(110deg,rgba(37,211,102,0.55),rgba(255,255,255,0.10),rgba(10,143,127,0.55))] bg-[length:200%_200%] animate-shine motion-reduce:animate-none',
        'transition-transform duration-300 ease-out hover:-translate-y-1',
        className
      )}
    >
      <div className="rounded-3xl bg-surface/65 backdrop-blur-md border border-white/5 p-7 h-full flex flex-col">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 text-primary">
            {Array.from({ length: 5 }).map((_, idx) => (
              <Star key={idx} className="w-4 h-4 fill-current" />
            ))}
          </div>
          <span className="text-[11px] px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">
            {item.metric}
          </span>
        </div>

        <p className="text-gray-200/90 leading-relaxed mt-6 flex-1">
          &ldquo;{item.quote}&rdquo;
        </p>

        <div className="flex items-center gap-4 mt-7">
          <Image
            src={buildAvatarSvg(item.initials, item.gradientFrom, item.gradientTo)}
            alt={item.name}
            width={48}
            height={48}
            className="h-12 w-12 rounded-full border border-white/10"
          />
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{item.name}</p>
            <p className="text-gray-400 text-sm truncate">
              {item.role} - {item.company}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DepoimentosV2() {
  return (
    <section id="testimonials" className="py-24 relative scroll-mt-24">
      <div className="container mx-auto px-4">
        <Reveal>
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface/50 border border-white/10 backdrop-blur-md mb-6">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-gray-300/90">Real testimonials</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">
              Companies that already <span className="gradient-text">automated</span>
            </h2>
            <p className="text-gray-300/80 mt-3">
              Real teams using it daily to reply faster and sell more.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <Reveal delayMs={100} className="h-full">
            <TestimonialCard item={testimonials[0]} className="h-full" />
          </Reveal>
          <Reveal delayMs={220} className="h-full">
            <TestimonialCard item={testimonials[1]} className="h-full" />
          </Reveal>
          <Reveal delayMs={340} className="h-full">
            <TestimonialCard item={testimonials[2]} className="h-full" />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
