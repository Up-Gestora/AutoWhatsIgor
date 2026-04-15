'use client'

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { CheckCircle2, Loader2, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { track, trackCustom } from '@/lib/metaPixel'
import { Reveal } from '@/components/marketing-v2/reveal'
import { captureLeadV2 } from '@/app/actions/capture-lead-v2'

type Status = 'idle' | 'loading' | 'success' | 'error'

function getUtmParams() {
  if (typeof window === 'undefined') {
    return {}
  }
  const params = new URLSearchParams(window.location.search)
  const pick = (key: string) => {
    const value = params.get(key)?.trim() ?? ''
    return value ? value : undefined
  }

  return {
    source: pick('utm_source'),
    medium: pick('utm_medium'),
    campaign: pick('utm_campaign'),
    content: pick('utm_content'),
    term: pick('utm_term')
  }
}

function mapErrorMessage(code: string | undefined) {
  switch (code) {
    case 'whatsapp_invalid':
      return 'Enter a valid WhatsApp number. E.g.: +1 555 123 4567'
    case 'name_invalid':
      return 'Enter your name to continue.'
    case 'lead_save_failed':
      return 'Could not save your data now. Please try again.'
    case 'whatsapp_send_failed':
      return 'Could not send the message now. Please try again in a few minutes.'
    default:
      return 'An error occurred. Please try again.'
  }
}

export function LeadCaptureV2({ pagePath }: { pagePath?: string }) {
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [company, setCompany] = useState('') // honeypot
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const hasStartedRef = useRef(false)
  const hasSubmittedRef = useRef(false)

  const trackStartOnce = () => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true
    trackCustom('LandingV2_LeadForm_Start')
  }

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    trackStartOnce()
    setName(e.target.value)
  }

  const handleWhatsappChange = (e: ChangeEvent<HTMLInputElement>) => {
    trackStartOnce()
    setWhatsapp(e.target.value)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (status === 'loading') return

    setStatus('loading')
    setError(null)

    const resolvedPagePath =
      pagePath ?? (typeof window === 'undefined' ? '/' : window.location?.pathname || '/')

    const result = await captureLeadV2({
      name,
      whatsapp,
      pagePath: resolvedPagePath,
      referrer: typeof document === 'undefined' ? '' : document.referrer || '',
      utm: getUtmParams(),
      honey: company
    })

    if (result.success) {
      if (!hasSubmittedRef.current) {
        hasSubmittedRef.current = true
        track('Lead')
        trackCustom('LandingV2_LeadForm_Success')
      }
      setStatus('success')
      setName('')
      setWhatsapp('')
      setCompany('')
      return
    }

    setStatus('error')
    setError(mapErrorMessage(result.error))
  }

  const handleReset = () => {
    hasStartedRef.current = false
    hasSubmittedRef.current = false
    setStatus('idle')
    setError(null)
  }

  return (
    <section id="lead-capture" className="py-16 relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <Reveal>
          <div className="max-w-5xl mx-auto rounded-[2.25rem] p-[1px] bg-[linear-gradient(110deg,rgba(37,211,102,0.55),rgba(255,255,255,0.10),rgba(10,143,127,0.55))] bg-[length:200%_200%] animate-shine motion-reduce:animate-none">
            <div className="rounded-[2.2rem] bg-surface/70 backdrop-blur-md border border-white/5 px-6 py-10 md:px-10 md:py-12">
              {status === 'success' ? (
                <div className="max-w-3xl mx-auto text-center">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center text-primary">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mt-5">
                    Done! We sent you a WhatsApp message.
                  </h2>
                  <p className="text-gray-300/80 mt-3 leading-relaxed">
                    If it does not arrive in a few minutes, check the number and try again.
                  </p>
                  <div className="mt-7 flex justify-center">
                    <Button variant="outline" onClick={handleReset}>
                      Send to another number
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 items-start">
                  <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-light/30 border border-white/10">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-sm text-gray-300/90">See AI in action on WhatsApp</span>
                    </div>

                    <h2 className="text-3xl md:text-4xl font-bold text-white mt-6 leading-tight">
                      Enter your WhatsApp and see what our AI can do
                    </h2>
                    <p className="text-gray-300/80 mt-4 leading-relaxed">
                      Our AI will send you a message and show its main features in practice
                    </p>

                    <div className="mt-7 grid sm:grid-cols-3 gap-3">
                      {[
                        'Context-aware replies',
                        'Lead qualification',
                        'Scheduling and sales'
                      ].map((item) => (
                        <div
                          key={item}
                          className="rounded-xl bg-surface/50 border border-white/10 px-4 py-3 text-sm text-gray-200/90"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="rounded-2xl bg-surface-light/40 border border-white/10 p-6">
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="lead-name" className="block text-sm font-medium text-gray-300 mb-2">
                          Your name
                        </label>
                        <Input
                          id="lead-name"
                          type="text"
                          autoComplete="name"
                          placeholder="John"
                          value={name}
                          onChange={handleNameChange}
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="lead-whatsapp" className="block text-sm font-medium text-gray-300 mb-2">
                          WhatsApp
                        </label>
                        <Input
                          id="lead-whatsapp"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="(11) 99999-9999"
                          value={whatsapp}
                          onChange={handleWhatsappChange}
                          required
                        />
                      </div>

                      {/* Honeypot */}
                      <div className="hidden" aria-hidden="true">
                        <label htmlFor="lead-company">Company</label>
                        <input
                          id="lead-company"
                          type="text"
                          name="company"
                          autoComplete="off"
                          tabIndex={-1}
                          value={company}
                          onChange={(e) => setCompany(e.target.value)}
                        />
                      </div>

                      <Button type="submit" size="lg" className="w-full" disabled={status === 'loading'}>
                        {status === 'loading' ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            Sending...
                          </>
                        ) : (
                          <>
                            See AI on WhatsApp
                            <Send className="w-5 h-5 ml-2" />
                          </>
                        )}
                      </Button>

                      {status === 'error' && error ? (
                        <p className="text-sm text-red-300/90">
                          {error}{' '}
                          <span className="text-gray-400">
                            If you prefer, use the floating WhatsApp button.
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">
                          By submitting, you agree to receive a message with information about AutoWhats.
                        </p>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

