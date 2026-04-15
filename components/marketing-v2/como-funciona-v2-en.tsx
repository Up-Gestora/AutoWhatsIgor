import { ArrowRight, Brain, LayoutDashboard, MessageSquare, QrCode, Sparkles } from 'lucide-react'
import { Reveal } from '@/components/marketing-v2/reveal'

const steps = [
  {
    icon: QrCode,
    step: '01',
    title: 'Connect via QR Code',
    description: 'Scan and done. Your WhatsApp connects to AutoWhats in seconds.'
  },
  {
    icon: Brain,
    step: '02',
    title: 'Train with your business data',
    description: 'Set rules, tone of voice, prices, and FAQs. AI follows what you configure.'
  },
  {
    icon: MessageSquare,
    step: '03',
    title: 'Enable and monitor conversations',
    description: 'AI replies 24/7 and hands off to humans when needed. You monitor everything in the dashboard.'
  },
  {
    icon: LayoutDashboard,
    step: '04',
    title: 'Tune and scale with CRM',
    description: 'Qualify leads, organize statuses, and use follow-ups to increase conversion.'
  }
]

export function ComoFuncionaV2() {
  return (
    <section id="how-it-works" className="py-24 relative scroll-mt-24">
      <div className="container mx-auto px-4 relative z-10">
        <Reveal>
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface/50 border border-white/10 backdrop-blur-md mb-6">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-gray-300/90">Simple flow</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">
              How it <span className="gradient-text">works</span> in practice
            </h2>
            <p className="text-gray-300/80 mt-3">
              In a few steps, you automate support and save time for your team to sell.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 max-w-6xl mx-auto">
          <div className="relative">
            <div className="hidden lg:block absolute top-16 left-[8%] right-[8%] h-px bg-primary/30 blur-sm opacity-40" />
            <div className="hidden lg:block absolute top-16 left-[8%] right-[8%] h-px bg-gradient-to-r from-primary/60 via-primary/30 to-primary/5" />

            <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {steps.map((item, index) => (
                <li key={item.step} className="relative h-full">
                  {index < steps.length - 1 && (
                    <div className="md:hidden absolute -bottom-7 left-1/2 -translate-x-1/2">
                      <ArrowRight className="w-6 h-6 text-primary rotate-90 opacity-80" />
                    </div>
                  )}

                  <Reveal delayMs={index * 120} className="h-full">
                    <div
                      className={[
                        'relative group h-full rounded-3xl p-[1px]',
                        'bg-[linear-gradient(110deg,rgba(37,211,102,0.45),rgba(255,255,255,0.08),rgba(10,143,127,0.45))]',
                        'bg-[length:200%_200%] hover:animate-shine motion-reduce:hover:animate-none',
                        'transition-transform duration-300 ease-out hover:-translate-y-1',
                        'hover:shadow-[0_18px_60px_rgba(37,211,102,0.10)]'
                      ].join(' ')}
                    >
                      <div className="relative h-full rounded-3xl bg-surface/60 backdrop-blur-md border border-white/10 p-7 overflow-hidden transition-[border-color,box-shadow,background-color] duration-300 ease-out group-hover:border-primary/25">
                        <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/12 blur-3xl" />
                        </div>

                        <span
                          aria-hidden
                          className="absolute bottom-5 right-6 text-7xl font-extrabold text-white/5 select-none pointer-events-none"
                        >
                          {item.step}
                        </span>

                        <div className="relative pt-6">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center text-primary flex-shrink-0">
                              <item.icon className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                              <p className="text-sm text-gray-300/75 leading-relaxed mt-2">
                                {item.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="absolute -top-4 left-6 bg-primary text-black font-bold text-sm px-4 py-1 rounded-full shadow-[0_10px_30px_rgba(37,211,102,0.15)]">
                        Step {item.step}
                      </div>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}

