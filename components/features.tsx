'use client'

import { Bot, QrCode, Brain, LayoutDashboard } from 'lucide-react'

const features = [
  {
    icon: Bot,
    title: 'Respostas Automáticas com IA',
    description: 'Nossa IA entende o contexto das conversas e responde de forma natural e personalizada, como se fosse um atendente humano.',
  },
  {
    icon: QrCode,
    title: 'Conexão Simples via QR Code',
    description: 'Conecte o WhatsApp da sua empresa em segundos. Basta escanear o QR Code, sem precisar de conhecimento técnico.',
  },
  {
    icon: Brain,
    title: 'IA que Sabe Seus Limites',
    description: 'Quando a pergunta foge da base de conhecimento, a IA não inventa! Ela simplesmente deixa um humano responder.',
  },
  {
    icon: LayoutDashboard,
    title: 'Dashboard Completo',
    description: 'Acompanhe todas as conversas, métricas de atendimento e gerencie sua base de conhecimento em um só lugar.',
  },
]

export function Features() {
  return (
    <section id="features" className="py-24 relative">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Por que escolher o{' '}
            <span className="gradient-text">AutoWhats</span>?
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Funcionalidades pensadas para simplificar seu atendimento e aumentar suas vendas
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group bg-surface-light rounded-2xl p-8 border border-surface-lighter card-hover"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Icon */}
              <div className="w-14 h-14 rounded-xl gradient-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <feature.icon className="w-7 h-7 text-black" />
              </div>

              {/* Content */}
              <h3 className="text-xl font-semibold text-white mb-3">
                {feature.title}
              </h3>
              <p className="text-gray-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

