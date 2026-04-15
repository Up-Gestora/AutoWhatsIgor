'use client'

import { useState, FormEvent, useRef, ChangeEvent } from 'react'
import { Send, CheckCircle, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveLead } from '@/app/actions/save-lead'
import { track, trackCustom } from '@/lib/metaPixel'

export function WaitlistForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    whatsapp: '',
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const hasStartedRef = useRef(false)
  const hasSubmittedRef = useRef(false)

  const handleInputChange =
    (field: 'name' | 'email' | 'whatsapp') => (e: ChangeEvent<HTMLInputElement>) => {
      if (!hasStartedRef.current) {
        hasStartedRef.current = true
        trackCustom('LeadIncompleto')
      }
      const value = e.target.value
      setFormData((prev) => ({ ...prev, [field]: value }))
    }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    
    const result = await saveLead(formData)
    
    if (result.success) {
      hasSubmittedRef.current = true
      track('Lead')
      setStatus('success')
      setFormData({ name: '', email: '', whatsapp: '' })
    } else {
      setStatus('error')
      alert(result.error || "Ocorreu um erro ao salvar seus dados.")
    }
  }

  const handleReset = () => {
    hasStartedRef.current = false
    hasSubmittedRef.current = false
    setStatus('idle')
  }

  if (status === 'success') {
    return (
      <section id="waitlist" className="py-24 relative">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mx-auto text-center">
            <div className="bg-surface-light rounded-2xl p-12 border border-primary/30">
              <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">
                Solicitação enviada! 🎉
              </h3>
              <p className="text-gray-400">
                Obrigado pelo interesse! Nossa equipe entrará em contato em breve via WhatsApp para liberar seu acesso gratuito.
              </p>
              <Button
                variant="outline"
                className="mt-6"
                onClick={handleReset}
              >
                Solicitar para outro número
              </Button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id="waitlist" className="py-24 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-light border border-surface-lighter mb-6">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-gray-400">Acesso antecipado liberado</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Comece seu{' '}
              <span className="gradient-text">Teste Gratuito</span>
            </h2>
            <p className="text-gray-400">
              Preencha os dados abaixo para solicitar seu acesso ao AutoWhats e começar a automatizar seu atendimento
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-surface-light rounded-2xl p-8 border border-surface-lighter">
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                  Seu nome
                </label>
                <Input
                  id="name"
                  type="text"
                  placeholder="João Silva"
                  value={formData.name}
                  onChange={handleInputChange('name')}
                  required
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Seu melhor email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="joao@empresa.com"
                  value={formData.email}
                  onChange={handleInputChange('email')}
                  required
                />
              </div>

              {/* WhatsApp */}
              <div>
                <label htmlFor="whatsapp" className="block text-sm font-medium text-gray-300 mb-2">
                  WhatsApp <span className="text-gray-500">(opcional)</span>
                </label>
                <Input
                  id="whatsapp"
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={formData.whatsapp}
                  onChange={handleInputChange('whatsapp')}
                />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                size="lg"
                className="w-full mt-4"
                disabled={status === 'loading'}
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Enviando...
                  </>
                ) : (
                  <>
                    Solicitar acesso gratuito
                    <Send className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            </div>

            <p className="text-center text-gray-500 text-sm mt-4">
              Não enviamos spam. Prometemos.
            </p>
          </form>
        </div>
      </div>
    </section>
  )
}

