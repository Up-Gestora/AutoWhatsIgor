import { ChevronDown, HelpCircle } from 'lucide-react'
import { Reveal } from '@/components/marketing-v2/reveal'
import { cn } from '@/lib/utils'
import { faqs } from './faq-data'

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-2xl bg-surface/55 border border-white/10 overflow-hidden">
      <summary className="list-none cursor-pointer px-6 py-5 min-h-[104px] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 text-primary flex items-center justify-center flex-shrink-0">
            <HelpCircle className="w-5 h-5" />
          </span>
          <span
            className="font-semibold text-white leading-snug"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {q}
          </span>
        </div>
        <ChevronDown className="w-5 h-5 text-gray-300/70 transition-transform duration-300 group-open:rotate-180 flex-shrink-0" />
      </summary>

      <div
        className={cn(
          'grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out',
          'group-open:grid-rows-[164px]'
        )}
      >
        <div className="overflow-hidden">
          <div className="h-[164px] overflow-y-auto px-6 pb-6 pr-4 text-sm text-gray-300/80 leading-relaxed">
            {a}
          </div>
        </div>
      </div>
    </details>
  )
}

export function FaqV2() {
  return (
    <section id="faq" className="py-24 relative scroll-mt-24">
      <div className="container mx-auto px-4">
        <Reveal>
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold">
              Perguntas <span className="gradient-text">frequentes</span>
            </h2>
            <p className="text-gray-300/80 mt-3">
              Tudo o que você precisa saber para decidir com confiança.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto items-start">
          {faqs.map((item, index) => (
            <Reveal key={item.q} delayMs={index * 80}>
              <FaqItem q={item.q} a={item.a} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
