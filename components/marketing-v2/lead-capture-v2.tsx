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
      return 'Digite um WhatsApp válido. Ex.: (11) 99999-9999'
    case 'name_invalid':
      return 'Digite seu nome para continuar.'
    case 'lead_save_failed':
      return 'Não conseguimos salvar seus dados agora. Tente novamente.'
    case 'whatsapp_send_failed':
      return 'Não conseguimos enviar a mensagem agora. Tente novamente em alguns minutos.'
    default:
      return 'Ocorreu um erro. Tente novamente.'
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
                    Pronto! Te enviamos uma mensagem no WhatsApp.
                  </h2>
                  <p className="text-gray-300/80 mt-3 leading-relaxed">
                    Se não chegar em alguns minutos, confira se o número está correto e tente novamente.
                  </p>
                  <div className="mt-7 flex justify-center">
                    <Button variant="outline" onClick={handleReset}>
                      Enviar para outro número
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 items-start">
                  <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-light/30 border border-white/10">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-sm text-gray-300/90">Veja a IA em ação no WhatsApp</span>
                    </div>

                    <h2 className="text-3xl md:text-4xl font-bold text-white mt-6 leading-tight">
                      Preencha seu WhatsApp e veja do que a nossa IA é capaz
                    </h2>
                    <p className="text-gray-300/80 mt-4 leading-relaxed">
                      A nossa IA vai te enviar uma mensagem e te mostrar, na prática, suas principais funcionalidades
                    </p>

                    <div className="mt-7 grid sm:grid-cols-3 gap-3">
                      {[
                        'Respostas com contexto',
                        'Qualificação de leads',
                        'Agendamentos e vendas'
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
                          Seu nome
                        </label>
                        <Input
                          id="lead-name"
                          type="text"
                          autoComplete="name"
                          placeholder="João"
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
                            Enviando...
                          </>
                        ) : (
                          <>
                            Ver a IA no WhatsApp
                            <Send className="w-5 h-5 ml-2" />
                          </>
                        )}
                      </Button>

                      {status === 'error' && error ? (
                        <p className="text-sm text-red-300/90">
                          {error}{' '}
                          <span className="text-gray-400">
                            Se preferir, use o botão flutuante do WhatsApp.
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">
                          Ao enviar, você concorda em receber uma mensagem com informações sobre o AutoWhats.
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
