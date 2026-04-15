import { Bot, Building2, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import { Reveal } from '@/components/marketing-v2/reveal'

type Message = { from: 'customer' | 'ai'; text: string; time: string }

const useCases: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
  automations: string[]
  messages: Message[]
}[] = [
  {
    icon: Building2,
    title: 'Clínicas e consultórios',
    subtitle: 'Agendamento, valores e dúvidas frequentes.',
    automations: ['Horários e valores', 'Triagem e qualificação', 'Confirmação de agenda'],
    messages: [
      { from: 'customer', text: 'Oi! Vocês atendem hoje?', time: '09:12' },
      {
        from: 'ai',
        text: 'Oi! Sim. Hoje atendemos das 9h às 18h. Quer agendar para qual horário?',
        time: '09:12'
      },
      { from: 'customer', text: 'Quinta à tarde tem?', time: '09:13' }
    ]
  },
  {
    icon: ShoppingBag,
    title: 'E-commerce',
    subtitle: 'Produtos, entrega, trocas e conversão.',
    automations: ['Catálogo e preços', 'Status de pedido', 'Upsell e carrinho abandonado'],
    messages: [
      { from: 'customer', text: 'Qual o prazo de entrega?', time: '14:08' },
      {
        from: 'ai',
        text: 'Para sua região, entregamos em 1-3 dias úteis. Quer que eu calcule com seu CEP?',
        time: '14:08'
      },
      { from: 'customer', text: 'Tenho, e 86000-000', time: '14:09' }
    ]
  },
  {
    icon: UtensilsCrossed,
    title: 'Restaurantes',
    subtitle: 'Cardápio, reservas e pedidos.',
    automations: ['Cardápio e combos', 'Reserva de mesa', 'Horário e localização'],
    messages: [
      { from: 'customer', text: 'Vocês têm mesa para 4 hoje?', time: '19:22' },
      {
        from: 'ai',
        text: 'Tenho sim! Prefere 20:00 ou 20:30? Posso reservar agora.',
        time: '19:22'
      },
      { from: 'customer', text: '20:30', time: '19:23' }
    ]
  }
]

function ChatBubble({ message }: { message: Message }) {
  const isCustomer = message.from === 'customer'
  return (
    <div className={isCustomer ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          isCustomer
            ? 'bg-primary-dark/90 text-white px-4 py-2 rounded-2xl rounded-tr-md max-w-[86%] border border-white/5'
            : 'bg-surface-light/50 text-white px-4 py-2 rounded-2xl rounded-tl-md max-w-[86%] border border-white/5'
        }
      >
        <p className="text-sm leading-snug">{message.text}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          {!isCustomer && (
            <span className="inline-flex items-center gap-1 text-[10px] text-primary">
              <Bot className="w-3 h-3" />
              Respondido pela IA
            </span>
          )}
          <span className="text-[10px] text-white/60 ml-auto">{message.time}</span>
        </div>
      </div>
    </div>
  )
}

export function CasosDeUsoV2() {
  return (
    <section className="py-24 relative scroll-mt-24" aria-label="Casos de uso">
      <div className="container mx-auto px-4">
        <Reveal>
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold">
              Funciona no <span className="gradient-text">seu tipo</span> de negócio
            </h2>
            <p className="text-gray-300/80 mt-3">
              Veja exemplos reais de como a IA conversa, qualifica e leva o cliente para o próximo passo.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-12">
          {useCases.map((c, index) => (
            <Reveal key={c.title} delayMs={index * 120}>
              <div className="rounded-3xl bg-surface/55 border border-white/10 overflow-hidden">
                <div className="p-7 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center text-primary">
                      <c.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-white">{c.title}</div>
                      <div className="text-sm text-gray-300/75">{c.subtitle}</div>
                    </div>
                  </div>

                  <ul className="mt-5 space-y-2 text-sm text-gray-200/85">
                    {c.automations.map((a) => (
                      <li key={a} className="flex items-start gap-2">
                        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-6 bg-[#0B141A]">
                  <div className="space-y-3">
                    {c.messages.map((m, idx) => (
                      <ChatBubble key={`${c.title}-${idx}`} message={m} />
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
