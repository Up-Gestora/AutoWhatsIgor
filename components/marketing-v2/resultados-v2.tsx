'use client'

import { useEffect, useRef, useState } from 'react'
import { Clock, Sparkles, TrendingUp } from 'lucide-react'
import { Reveal, useInViewOnce, usePrefersReducedMotion } from '@/components/marketing-v2/reveal'

type MetricKey = 'response_time' | 'conversions' | 'hours_saved'

type Metric = {
  key: MetricKey
  icon: React.ComponentType<{ className?: string }>
  target: number
  prefix: string
  suffix: string
  label: string
  highlight: string
  description: string
}

const metrics: Metric[] = [
  {
    key: 'response_time',
    icon: Clock,
    target: 32,
    prefix: '-',
    suffix: '%',
    label: 'tempo de resposta',
    highlight: '\u221232% tempo de resposta',
    description: 'Clientes recebem resposta rápido, mesmo fora do horário.'
  },
  {
    key: 'conversions',
    icon: TrendingUp,
    target: 18,
    prefix: '+',
    suffix: '%',
    label: 'conversões',
    highlight: '+18% conversões',
    description: 'A IA qualifica e conduz a conversa até o próximo passo.'
  },
  {
    key: 'hours_saved',
    icon: Sparkles,
    target: 4,
    prefix: '+',
    suffix: 'h/dia',
    label: 'economizadas',
    highlight: '+4h/dia economizadas',
    description: 'Sua equipe para de repetir o básico e foca no que importa.'
  }
]

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

function formatMetric(metric: Metric, value: number) {
  const v = Math.max(0, Math.round(value))
  return `${metric.prefix}${v}${metric.suffix}`
}

export function ResultadosV2({ countUp = false }: { countUp?: boolean }) {
  const reducedMotion = usePrefersReducedMotion()
  const { ref, inView } = useInViewOnce<HTMLElement>({
    rootMargin: '0px 0px -20% 0px',
    threshold: 0.2
  })

  const [values, setValues] = useState<number[]>(() =>
    countUp ? metrics.map(() => 0) : metrics.map((m) => m.target)
  )
  const didAnimateRef = useRef(false)

  useEffect(() => {
    if (!countUp) {
      setValues(metrics.map((m) => m.target))
      return
    }
    if (reducedMotion) {
      setValues(metrics.map((m) => m.target))
      return
    }
    if (!inView) {
      setValues(metrics.map(() => 0))
      return
    }
    if (didAnimateRef.current) {
      return
    }
    didAnimateRef.current = true

    const durationMs = 950
    const start = performance.now()
    let rafId = 0

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const p = easeOutCubic(t)
      setValues(metrics.map((m) => Math.round(p * m.target)))
      if (t < 1) {
        rafId = window.requestAnimationFrame(tick)
      }
    }

    rafId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(rafId)
  }, [countUp, inView, reducedMotion])

  return (
    <section id="resultados" className="py-20 relative scroll-mt-24" ref={ref}>
      <div className="container mx-auto px-4">
        <Reveal>
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface/50 border border-white/10 backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-gray-300/90">Prova em números</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mt-6">
              Resultados que aparecem no <span className="gradient-text">dia a dia</span>
            </h2>
            <p className="text-gray-300/80 mt-3">
              Um atendimento mais rápido, mais consistente e pronto para vender sem perder o toque humano.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          {metrics.map((item, index) => (
            <Reveal key={item.key} delayMs={index * 120}>
              <div className="relative rounded-2xl p-8 bg-surface/55 border border-white/10 overflow-hidden">
                <div className="absolute inset-0 pointer-events-none opacity-70">
                  <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-primary/12 blur-3xl" />
                </div>

                <div className="relative">
                  <div className="flex items-center justify-between gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center text-primary">
                      <item.icon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-full">
                      {item.highlight}
                    </span>
                  </div>

                  <div className="mt-6">
                    <div className="text-4xl font-extrabold text-white">
                      {formatMetric(item, values[index] ?? item.target)}
                    </div>
                    <div className="text-sm text-gray-300/80 mt-1">{item.label}</div>
                  </div>

                  <p className="text-sm text-gray-300/70 mt-4 leading-relaxed">{item.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
