'use client'

import { QrCode, FileText, Power, ArrowRight } from 'lucide-react'

const steps = [
  {
    icon: QrCode,
    step: '01',
    title: 'Conecte seu WhatsApp',
    description: 'Escaneie o QR Code e pronto! Seu WhatsApp Business está conectado ao AutoWhats em segundos.',
  },
  {
    icon: FileText,
    step: '02',
    title: 'Configure a Base de Conhecimento',
    description: 'Adicione informações sobre sua empresa: produtos, serviços, horários, preços e FAQs.',
  },
  {
    icon: Power,
    step: '03',
    title: 'Ative a IA',
    description: 'Com um clique, sua IA começa a responder automaticamente. Você foca no que importa!',
  },
]

export function HowItWorks() {
  return (
    <section id="como-funciona" className="py-24 relative bg-surface-light/30">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Como <span className="gradient-text">Funciona</span>?
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Em apenas 3 passos simples, você automatiza todo o atendimento do seu WhatsApp
          </p>
        </div>

        {/* Steps */}
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connection line (desktop) */}
            <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-primary via-primary to-primary/50" />

            {steps.map((step, index) => (
              <div key={step.title} className="relative">
                {/* Mobile arrow */}
                {index < steps.length - 1 && (
                  <div className="md:hidden absolute -bottom-6 left-1/2 -translate-x-1/2">
                    <ArrowRight className="w-6 h-6 text-primary rotate-90" />
                  </div>
                )}

                <div className="bg-surface rounded-2xl p-8 border border-surface-lighter text-center relative z-10 card-hover h-full">
                  {/* Step number */}
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-black font-bold text-sm px-4 py-1 rounded-full">
                    Passo {step.step}
                  </div>

                  {/* Icon */}
                  <div className="w-16 h-16 rounded-2xl bg-surface-lighter flex items-center justify-center mx-auto mt-4 mb-6">
                    <step.icon className="w-8 h-8 text-primary" />
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-semibold text-white mb-3">
                    {step.title}
                  </h3>
                  <p className="text-gray-400 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

