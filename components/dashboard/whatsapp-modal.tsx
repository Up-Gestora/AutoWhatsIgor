'use client'

import { useState } from 'react'
import { Phone, Loader2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { db } from '@/lib/firebase'
import { useI18n } from '@/lib/i18n/client'
import { emitOnboardingEventSafe } from '@/lib/onboarding/events'
import { doc, updateDoc } from 'firebase/firestore'

interface WhatsAppModalProps {
  userId: string
  onSuccess: () => void
}

export function WhatsAppModal({ userId, onSuccess }: WhatsAppModalProps) {
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const tr = (pt: string, en: string) => (isEn ? en : pt)

  const [whatsapp, setWhatsapp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!whatsapp) {
      setError(tr('Por favor, insira seu número de WhatsApp.', 'Please enter your WhatsApp number.'))
      return
    }

    setLoading(true)
    setError('')

    try {
      if (!db) throw new Error('firestore_not_initialized')

      const userRef = doc(db, 'users', userId)
      await updateDoc(userRef, {
        whatsapp,
        telefone: whatsapp,
        updatedAt: new Date().toISOString()
      })
      await emitOnboardingEventSafe({
        sessionId: userId,
        eventName: 'whatsapp_saved',
        properties: {
          hasWhatsapp: true,
          whatsapp: whatsapp.trim()
        }
      })

      onSuccess()
    } catch (err) {
      console.error('Failed to save WhatsApp:', err)
      setError(tr('Erro ao salvar o número. Tente novamente.', 'Failed to save number. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-surface-light w-full max-w-md rounded-2xl border border-surface-lighter shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-4 glow-primary">
              <MessageCircle className="w-10 h-10 text-black" />
            </div>
            <h2 className="text-2xl font-bold text-white text-center">{tr('Quase la!', 'Almost done!')}</h2>
            <p className="text-gray-400 text-center mt-2">
              {tr(
                'Para continuar, precisamos do seu número de WhatsApp para configurar sua conta.',
                'To continue, we need your WhatsApp number to configure your account.'
              )}
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-lg mb-6 text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="modal-whatsapp" className="block text-sm font-medium text-gray-300">
                WhatsApp
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <Input
                  id="modal-whatsapp"
                  type="tel"
                  placeholder="(00) 00000-0000"
                  className="pl-10 h-12"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <p className="text-[10px] text-gray-500 italic">
                {tr('* Use o formato com DDD, ex: 11999999999', '* Use area code format, e.g. 11999999999')}
              </p>
            </div>

            <Button className="w-full h-12 text-base font-semibold" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : tr('Salvar e acessar dashboard', 'Save and open dashboard')}
            </Button>
          </form>
        </div>

        <div className="bg-surface p-4 border-t border-surface-lighter">
          <p className="text-[11px] text-gray-500 text-center">
            {tr(
              'Prometemos não enviar spam. Seu número e usado apenas para a funcionalidade do sistema.',
              'We do not send spam. Your number is only used for system functionality.'
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
