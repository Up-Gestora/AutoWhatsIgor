'use client'

import { MessageCircle, Bot, Zap, ArrowRight } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-light border border-surface-lighter mb-8 animate-fade-in">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm text-gray-400">Revolucione seu atendimento</span>
          </div>

          {/* Main Title */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 animate-fade-in-up">
            Automatize seu{' '}
            <span className="gradient-text">WhatsApp</span>
            {' '}com{' '}
            <span className="gradient-text">Inteligência Artificial</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-2xl mx-auto animate-fade-in-up delay-100">
            Deixe a IA responder seus clientes automaticamente, 24 horas por dia. 
            Ela sabe exatamente quando passar a conversa para um humano.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up delay-200">
            <ButtonLink size="lg" href="/login?mode=signup" className="gap-2">
              Teste gratuitamente
              <ArrowRight className="w-5 h-5" />
            </ButtonLink>
            <ButtonLink variant="outline" size="lg" href="#como-funciona">
              Como Funciona
            </ButtonLink>
          </div>

          {/* Phone Mockup / Visual */}
          <div className="mt-16 relative animate-fade-in-up delay-300">
            <div className="relative mx-auto w-full max-w-md">
              {/* Phone frame */}
              <div className="bg-surface-light rounded-[2.5rem] p-3 border border-surface-lighter glow-primary">
                <div className="bg-surface rounded-[2rem] overflow-hidden">
                  {/* Phone header */}
                  <div className="bg-accent px-4 py-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">AutoWhats IA</p>
                      <p className="text-green-300 text-xs">Online</p>
                    </div>
                  </div>
                  
                  {/* Chat messages */}
                  <div className="p-4 space-y-3 min-h-[280px] bg-[#0B141A]">
                    {/* Customer message */}
                    <div className="flex justify-end">
                      <div className="bg-primary-dark text-white px-4 py-2 rounded-2xl rounded-tr-md max-w-[80%]">
                        <p className="text-sm">Oi! Vocês estão abertos hoje?</p>
                        <p className="text-[10px] text-gray-300 text-right mt-1">14:32</p>
                      </div>
                    </div>

                    {/* AI Response */}
                    <div className="flex justify-start">
                      <div className="bg-surface-lighter text-white px-4 py-2 rounded-2xl rounded-tl-md max-w-[80%]">
                        <p className="text-sm">Olá! 👋 Sim, estamos abertos! Nosso horário hoje é das 9h às 18h. Posso ajudar com algo mais?</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Bot className="w-3 h-3 text-primary" />
                          <p className="text-[10px] text-primary">Respondido pela IA</p>
                        </div>
                      </div>
                    </div>

                    {/* Customer message */}
                    <div className="flex justify-end">
                      <div className="bg-primary-dark text-white px-4 py-2 rounded-2xl rounded-tr-md max-w-[80%]">
                        <p className="text-sm">Qual o preço do serviço X?</p>
                        <p className="text-[10px] text-gray-300 text-right mt-1">14:33</p>
                      </div>
                    </div>

                    {/* AI Response */}
                    <div className="flex justify-start">
                      <div className="bg-surface-lighter text-white px-4 py-2 rounded-2xl rounded-tl-md max-w-[80%]">
                        <p className="text-sm">O serviço X custa R$ 99,90. Quer saber mais detalhes ou agendar?</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Bot className="w-3 h-3 text-primary" />
                          <p className="text-[10px] text-primary">Respondido pela IA</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating elements */}
              <div className="absolute -right-4 top-1/4 bg-surface-light rounded-xl p-3 border border-surface-lighter animate-pulse-glow">
                <MessageCircle className="w-6 h-6 text-primary" />
              </div>
              <div className="absolute -left-4 bottom-1/3 bg-surface-light rounded-xl p-3 border border-surface-lighter">
                <Bot className="w-6 h-6 text-primary" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

