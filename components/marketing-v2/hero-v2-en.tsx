'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Bot, Brain, CalendarCheck, Check, LayoutDashboard, QrCode, Sparkles, Zap } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { trackCustom } from '@/lib/metaPixel'
import { cn } from '@/lib/utils'
import { Reveal, usePrefersReducedMotion } from '@/components/marketing-v2/reveal'

const PRIMARY_CTA = '/en/signup'

const bullets = [
  { icon: Zap, text: 'Instant replies with context' },
  { icon: Brain, text: 'Training with rules and knowledge base' },
  { icon: LayoutDashboard, text: 'CRM + lead qualification', explainTerms: true },
  { icon: CalendarCheck, text: 'Scheduling and AI follow-up' }
]

function InlineTermHint({ label, description }: { label: string; description: string }) {
  const [open, setOpen] = useState(false)
  const tooltipId = useId()
  const containerRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const closeOnOutside = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('touchstart', closeOnOutside)

    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('touchstart', closeOnOutside)
    }
  }, [open])

  return (
    <span ref={containerRef} className="relative inline-flex items-center group/term">
      <button
        type="button"
        className="rounded-sm underline decoration-dotted underline-offset-[3px] decoration-primary/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
        aria-describedby={tooltipId}
        aria-expanded={open}
      >
        {label}
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 bottom-full z-30 mb-2 w-60 max-w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-white/10 bg-surface-light/95 px-3 py-2 text-xs font-normal leading-relaxed text-gray-100 shadow-xl backdrop-blur-md transition-opacity duration-150',
          'invisible opacity-0 group-hover/term:visible group-hover/term:opacity-100 group-focus-within/term:visible group-focus-within/term:opacity-100',
          open && 'visible opacity-100'
        )}
      >
        {description}
      </span>
    </span>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1" aria-label="Typing" title="Typing">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full bg-white/70 animate-typing-dot motion-reduce:animate-none"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="inline-block w-1.5 h-1.5 rounded-full bg-white/70 animate-typing-dot motion-reduce:animate-none"
        style={{ animationDelay: '200ms' }}
      />
      <span
        className="inline-block w-1.5 h-1.5 rounded-full bg-white/70 animate-typing-dot motion-reduce:animate-none"
        style={{ animationDelay: '400ms' }}
      />
    </span>
  )
}

type ChatRole = 'customer' | 'ai'

type DemoEvent =
  | { kind: 'message'; from: ChatRole; text: string; time: string }
  | { kind: 'typing' }

const DEMO_EVENTS: DemoEvent[] = [
  { kind: 'message', from: 'customer', text: 'Hi! Are you open today?', time: '14:32' },
  { kind: 'typing' },
  {
    kind: 'message',
    from: 'ai',
    text: 'Hi! Yes, we are open. Today we are available from 9 AM to 6 PM. Would you like to book a time?',
    time: '14:32'
  },
  { kind: 'message', from: 'customer', text: 'What is the price for service X?', time: '14:33' },
  { kind: 'typing' },
  {
    kind: 'message',
    from: 'ai',
    text: 'Service X costs $99.90. Want details or should I send a link to get started?',
    time: '14:33'
  }
]

function ChatMessageBubble({ from, text, time }: { from: ChatRole; text: string; time: string }) {
  const isCustomer = from === 'customer'
  return (
    <div className={isCustomer ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={cn(
          'text-white px-4 py-2 rounded-2xl max-w-[86%] border border-white/5',
          isCustomer
            ? 'bg-primary-dark/90 rounded-tr-md'
            : 'bg-[#1F2C33] rounded-tl-md'
        )}
      >
        <p className="text-sm">{text}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          {!isCustomer && (
            <span className="inline-flex items-center gap-1 text-[10px] text-primary">
              <Bot className="w-3 h-3" />
              AI replied
            </span>
          )}
          <span className="text-[10px] text-white/60 ml-auto">{time}</span>
        </div>
      </div>
    </div>
  )
}

function ChatTypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="bg-[#1F2C33]/80 text-white px-4 py-2 rounded-2xl rounded-tl-md max-w-[70%] border border-white/5">
        <TypingDots />
      </div>
    </div>
  )
}

function AnimatedConversation({ enabled }: { enabled: boolean }) {
  const reducedMotion = usePrefersReducedMotion()
  const [cursor, setCursor] = useState(0)
  const [resetting, setResetting] = useState(false)
  const stepTimerRef = useRef<number | null>(null)
  const resetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || reducedMotion) {
      return
    }

    setCursor(0)
    setResetting(false)
  }, [enabled, reducedMotion])

  useEffect(() => {
    if (!enabled || reducedMotion) {
      return
    }

    if (stepTimerRef.current) {
      window.clearTimeout(stepTimerRef.current)
      stepTimerRef.current = null
    }
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }

    const isLast = cursor >= DEMO_EVENTS.length - 1
    const current = DEMO_EVENTS[Math.min(cursor, DEMO_EVENTS.length - 1)]

    if (isLast) {
      // Pause on the final state, then soft-reset the conversation.
      stepTimerRef.current = window.setTimeout(() => {
        setResetting(true)
        resetTimerRef.current = window.setTimeout(() => {
          setCursor(0)
          setResetting(false)
        }, 260)
      }, 4200)
      return () => {
        if (stepTimerRef.current) window.clearTimeout(stepTimerRef.current)
        if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
      }
    }

    const delayMs = current.kind === 'typing' ? 900 : current.from === 'customer' ? 1000 : 1650
    stepTimerRef.current = window.setTimeout(() => {
      setCursor((prev) => Math.min(prev + 1, DEMO_EVENTS.length - 1))
    }, delayMs)

    return () => {
      if (stepTimerRef.current) window.clearTimeout(stepTimerRef.current)
    }
  }, [cursor, enabled, reducedMotion])

  useEffect(() => {
    return () => {
      if (stepTimerRef.current) {
        window.clearTimeout(stepTimerRef.current)
      }
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const visible = DEMO_EVENTS.slice(0, Math.min(cursor + 1, DEMO_EVENTS.length))

  return (
    <div
      className={cn(
        'space-y-3 h-[430px] sm:h-[470px] overflow-hidden transition-opacity duration-300',
        resetting && 'opacity-0'
      )}
    >
      {visible.map((event, index) => {
        if (event.kind === 'typing') {
          return <ChatTypingBubble key={`typing-${index}`} />
        }
        return (
          <ChatMessageBubble
            key={`msg-${index}`}
            from={event.from}
            text={event.text}
            time={event.time}
          />
        )
      })}
    </div>
  )
}

function DashboardMock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative w-full max-w-[560px] motion-reduce:[transform:none] transform-gpu',
        '[transform:rotateX(10deg)_rotateY(-18deg)_translateZ(0)]',
        'transition-transform duration-500 ease-out group-hover:[transform:rotateX(8deg)_rotateY(-14deg)_translateY(-6px)] motion-reduce:group-hover:[transform:none]',
        className
      )}
    >
      <div className="rounded-2xl p-[1px] bg-[linear-gradient(110deg,rgba(37,211,102,0.55),rgba(255,255,255,0.10),rgba(10,143,127,0.55))] bg-[length:200%_200%] animate-shine motion-reduce:animate-none">
        <div className="rounded-2xl bg-surface/70 backdrop-blur-md border border-white/5 overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-surface-light/40">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
            </div>
            <div className="text-[11px] text-gray-300/80">Dashboard</div>
          </div>

          <div className="grid grid-cols-[56px_1fr]">
            <div className="border-r border-white/5 bg-surface-light/30 p-3 flex flex-col items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center text-primary">
                <Bot className="w-5 h-5" />
              </div>
              <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-300">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-300">
                <QrCode className="w-5 h-5" />
              </div>
              <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-300">
                <Brain className="w-5 h-5" />
              </div>
              <div className="mt-auto w-full text-center text-[10px] text-gray-400/70">
                IA: <span className="text-primary">ON</span>
              </div>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Leads', value: '128', tone: 'text-blue-300' },
                  { label: 'AI today', value: '342', tone: 'text-primary' },
                  { label: 'Response', value: '98%', tone: 'text-yellow-300' }
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl bg-surface-light/50 border border-white/5 p-3"
                  >
                    <div className="text-[10px] text-gray-400">{stat.label}</div>
                    <div className={cn('text-lg font-bold', stat.tone)}>{stat.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl bg-surface-light/40 border border-white/5 overflow-hidden">
                <div className="px-3 py-2 flex items-center justify-between border-b border-white/5">
                  <div className="text-xs font-semibold text-white">Conversas</div>
                  <div className="text-[11px] text-gray-400">Agora</div>
                </div>
                <div className="divide-y divide-white/5">
                  {[
                    { name: 'Mariana', last: 'Can I book for tomorrow?', tag: 'Scheduling' },
                    { name: 'Rafael', last: 'What is the Pro plan price?', tag: 'Sales' },
                    { name: 'Camila', last: 'Any availability tonight?', tag: 'AI' }
                  ].map((item) => (
                    <div key={item.name} className="px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] text-gray-200 font-semibold">{item.name}</div>
                        <div className="text-[11px] text-gray-400 truncate">{item.last}</div>
                      </div>
                      <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary whitespace-nowrap">
                        {item.tag}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PhoneMock({
  className,
  animatedDemo = false,
  reducedMotion = false
}: {
  className?: string
  animatedDemo?: boolean
  reducedMotion?: boolean
}) {
  const shouldAnimate = Boolean(animatedDemo && !reducedMotion)
  return (
    <div
      className={cn(
        'relative w-full max-w-[450px] motion-reduce:[transform:none] transform-gpu',
        '[transform:rotateX(6deg)_rotateY(12deg)_translateZ(0)]',
        'transition-transform duration-500 ease-out group-hover:[transform:rotateX(4deg)_rotateY(10deg)_translateY(-6px)] motion-reduce:group-hover:[transform:none]',
        className
      )}
    >
      <div className="rounded-[2.75rem] p-[1px] bg-[linear-gradient(135deg,rgba(37,211,102,0.65),rgba(255,255,255,0.10),rgba(7,94,84,0.65))] bg-[length:200%_200%] animate-shine motion-reduce:animate-none shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        <div className="rounded-[2.65rem] bg-surface-light border border-white/10 p-3">
          <div className="rounded-[2.35rem] overflow-hidden bg-[#0B141A]">
            <div className="bg-accent px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-black/30 border border-white/10 flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm truncate">AutoWhats IA</p>
                <p className="text-green-300 text-xs">Online</p>
              </div>
              <div className="ml-auto text-[10px] text-white/70 bg-black/20 border border-white/10 rounded-full px-2 py-1">
                Trained AI
              </div>
            </div>

            <div className="p-4">
              {shouldAnimate ? (
                <AnimatedConversation enabled={shouldAnimate} />
              ) : (
                <div className="space-y-3 h-[430px] sm:h-[470px] overflow-hidden">
                  <ChatMessageBubble
                    from="customer"
                    text="Hi! Are you open today?"
                    time="14:32"
                  />
                  <ChatMessageBubble
                    from="ai"
                    text="Hi! Yes, we are open. Today we are available from 9 AM to 6 PM. Would you like to book a time?"
                    time="14:32"
                  />
                  <ChatMessageBubble from="customer" text="What is the price for service X?" time="14:33" />
                  <ChatMessageBubble
                    from="ai"
                    text="Service X costs $99.90. Want details or should I send a link to get started?"
                    time="14:33"
                  />
                  <ChatTypingBubble />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FloatingCard({
  title,
  subtitle,
  className,
  icon
}: {
  title: string
  subtitle: string
  className?: string
  icon: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'absolute rounded-2xl bg-surface/70 backdrop-blur-md border border-white/10 shadow-xl px-4 py-3 w-[220px]',
        'animate-float-slow motion-reduce:animate-none',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">{title}</div>
          <div className="text-[11px] text-gray-300/80 leading-snug">{subtitle}</div>
        </div>
      </div>
    </div>
  )
}

type HeroV2VisualProps = {
  className?: string
  animatedDemo?: boolean
  parallax?: boolean
  reducedMotion?: boolean
  testId?: string
}

export function HeroV2Visual({
  className,
  animatedDemo = false,
  parallax = false,
  reducedMotion: reducedMotionProp,
  testId
}: HeroV2VisualProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const reducedMotion = reducedMotionProp ?? prefersReducedMotion
  const parallaxRef = useRef<HTMLDivElement | null>(null)
  const [parallaxCapable, setParallaxCapable] = useState(false)

  useEffect(() => {
    if (!parallax || reducedMotion) {
      setParallaxCapable(false)
      return
    }
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setParallaxCapable(false)
      return
    }

    const mediaQuery = window.matchMedia('(pointer:fine) and (hover:hover)')
    const update = () => setParallaxCapable(mediaQuery.matches)

    update()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update)
      return () => mediaQuery.removeEventListener('change', update)
    }

    mediaQuery.addListener(update)
    return () => mediaQuery.removeListener(update)
  }, [parallax, reducedMotion])

  useEffect(() => {
    if (!parallaxCapable) {
      return
    }

    const node = parallaxRef.current
    if (!node) {
      return
    }

    let rafId: number | null = null
    let px = 0
    let py = 0

    const commit = () => {
      rafId = null
      node.style.setProperty('--px', px.toFixed(4))
      node.style.setProperty('--py', py.toFixed(4))
    }

    const schedule = () => {
      if (rafId !== null) {
        return
      }
      rafId = window.requestAnimationFrame(commit)
    }

    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect()
      if (!rect.width || !rect.height) {
        return
      }
      const nx = (event.clientX - rect.left) / rect.width
      const ny = (event.clientY - rect.top) / rect.height

      px = Math.max(-1, Math.min(1, (nx - 0.5) * 2))
      py = Math.max(-1, Math.min(1, (ny - 0.5) * 2))

      schedule()
    }

    const onLeave = () => {
      px = 0
      py = 0
      schedule()
    }

    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)

    return () => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [parallaxCapable])

  const parallaxStyle: React.CSSProperties & { '--px': number; '--py': number } = {
    perspective: '1400px',
    '--px': 0,
    '--py': 0
  }

  return (
    <div
      ref={parallaxRef}
      data-testid={testId}
      className={cn('relative mx-auto max-w-[660px] min-h-[620px] sm:min-h-[700px] lg:min-h-[780px] group', className)}
      style={parallaxStyle}
    >
      <div
        className={cn(
          'relative transform-gpu will-change-transform',
          parallaxCapable &&
            '[transform:rotateX(calc(var(--py)*-6deg))_rotateY(calc(var(--px)*6deg))_translate3d(0,calc(var(--py)*-10px),0)] transition-transform duration-150 ease-out'
        )}
      >
        <DashboardMock className="absolute left-0 -top-2 w-[94%] hidden sm:block" />
        <PhoneMock
          className="relative sm:ml-auto w-full sm:w-[78%] pt-10 sm:pt-16"
          animatedDemo={animatedDemo}
          reducedMotion={reducedMotion}
        />

        <FloatingCard
          title="Qualified lead"
          subtitle="Interested in Pro plan. Ready to convert."
          icon={<Zap className="w-5 h-5" />}
          className="hidden sm:block -left-6 top-24"
        />
        <FloatingCard
          title="Booking created"
          subtitle="Thursday, 3:30 PM. Confirmed with client."
          icon={<CalendarCheck className="w-5 h-5" />}
          className="hidden sm:block -right-4 bottom-20"
        />
      </div>
    </div>
  )
}

export function HeroV2({
  animatedDemo = false,
  parallax = false,
  primaryCtaHref = PRIMARY_CTA,
  productHref = '#product'
}: {
  animatedDemo?: boolean
  parallax?: boolean
  primaryCtaHref?: string
  productHref?: string
}) {
  const handlePrimaryCta = (location: string) => {
    trackCustom('LandingV2_CTA_Primary_Click', { location })
  }

  return (
    <section className="relative pt-32 pb-28 lg:pt-36 lg:pb-32 overflow-hidden min-h-[calc(100svh+300px)] lg:min-h-[calc(100svh+220px)]">
      <div className="container mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          <div className="max-w-2xl">
            <Reveal>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface/60 border border-white/10 backdrop-blur-md">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm text-gray-300/90">
                  WhatsApp automation with AI for support, sales, and scheduling
                </span>
              </div>
            </Reveal>

            <Reveal delayMs={120}>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mt-6 leading-[1.05]">
                Automate your WhatsApp support with{' '}
                <span className="gradient-text">Trained AI</span> for your business
              </h1>
            </Reveal>

            <Reveal delayMs={220}>
              <p className="text-lg md:text-xl text-gray-300/80 mt-6 leading-relaxed">
                Connect your WhatsApp Business via QR Code, define rules, and let AI reply, qualify leads, and call a human when needed.
              </p>
            </Reveal>

            <Reveal delayMs={320}>
              <ul className="mt-8 grid sm:grid-cols-2 gap-3">
                {bullets.map((item) => (
                  <li
                    key={item.text}
                    className="flex items-center gap-3 rounded-xl bg-surface/40 border border-white/5 px-4 py-3"
                  >
                    <span className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center text-primary flex-shrink-0">
                      <item.icon className="w-5 h-5" />
                    </span>
                    <span className="text-sm text-gray-200/90 font-medium leading-snug">
                      {item.explainTerms ? (
                        <>
                          <InlineTermHint
                            label="CRM"
                            description="CRM organizes contacts, history, and pipeline stages so your team can sell with context."
                          />
                          {' + lead qualification '}
                          <InlineTermHint
                            label="leads"
                            description="Leads are potential customers who have already shown interest and can be handled by AI or sales reps."
                          />
                        </>
                      ) : (
                        item.text
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delayMs={420}>
              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <ButtonLink
                  size="lg"
                  href={primaryCtaHref}
                  className="gap-2"
                  onClick={() => handlePrimaryCta('hero')}
                >
                  Free trial
                  <ArrowRight className="w-5 h-5" />
                </ButtonLink>

                <ButtonLink variant="outline" size="lg" href={productHref}>
                  See product
                </ButtonLink>
              </div>
            </Reveal>

            <Reveal delayMs={520}>
              <p className="mt-5 text-sm text-gray-400">
                <Check className="w-4 h-4 inline-block text-primary mr-2" />
                Start in minutes. Create your account in 1 step.
              </p>
            </Reveal>
          </div>

          <div className="relative">
            <Reveal delayMs={160}>
              <HeroV2Visual animatedDemo={animatedDemo} parallax={parallax} />
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}

