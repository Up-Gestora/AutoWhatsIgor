'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bot, ExternalLink, LifeBuoy, X } from 'lucide-react'
import { WHATSAPP_LINK } from '@/lib/contact'
import { cn } from '@/lib/utils'

type SupportFaq = {
  id: string
  questionPt: string
  answerPt: string
  questionEn: string
  answerEn: string
}

const SUPPORT_FAQS: SupportFaq[] = [
  {
    id: 'onboarding',
    questionPt: 'Como começo sem suporte humano?',
    answerPt:
      'Conecte seu WhatsApp, preencha o treinamento com seus serviços e horários e faça um teste guiado. O tutorial do painel já cobre esse fluxo.',
    questionEn: 'How do I start without human support?',
    answerEn:
      'Connect WhatsApp, fill the training fields with your services and business hours, then run the guided test. The in-app tutorial covers this flow.'
  },
  {
    id: 'credits',
    questionPt: 'Como funcionam plano e créditos?',
    answerPt:
      'No Básico, o modelo é pay-per-use: sem mensalidade fixa e consumo da IA por mensagem enviada. Você pode recarregar créditos na aba Assinatura e créditos.',
    questionEn: 'How do plan and credits work?',
    answerEn:
      'Basic runs as pay-per-use: no fixed monthly fee and AI usage charged per message sent. You can top up credits in Subscription and credits.'
  },
  {
    id: 'training',
    questionPt: 'O que mais evita erro da IA?',
    answerPt:
      'Os campos mais importantes são: nome da empresa, descrição de serviços/produtos, horários e regras gerais de atendimento.',
    questionEn: 'What prevents most AI mistakes?',
    answerEn:
      'The key fields are: company name, service/product description, business hours, and general response rules.'
  },
  {
    id: 'handoff',
    questionPt: 'Se não resolver por aqui, como pedir ajuda?',
    answerPt:
      'Você pode pedir atendimento personalizado pelo botão abaixo e nossa equipe continua com você no WhatsApp.',
    questionEn: 'If this does not solve it, how do I get help?',
    answerEn:
      'You can request personalized support with the button below and our team will continue on WhatsApp.'
  }
]

function buildWhatsAppLink(message: string) {
  return `${WHATSAPP_LINK}?text=${encodeURIComponent(message)}`
}

export function WhatsAppFloat() {
  const pathname = usePathname()
  const isEn = pathname?.startsWith('/en') ?? false
  const isLoggedArea = pathname?.includes('/dashboard') ?? false
  const [isOpen, setIsOpen] = useState(false)
  const [activeFaqId, setActiveFaqId] = useState<string>(SUPPORT_FAQS[0].id)

  const labels = useMemo(
    () => ({
      title: isEn ? 'Automatic FAQ Support' : 'Suporte automático (FAQ)',
      subtitle: isEn ? 'Quick answers for common questions' : 'Respostas rápidas para dúvidas comuns',
      open: isEn ? 'Open support' : 'Abrir suporte',
      close: isEn ? 'Close support' : 'Fechar suporte',
      hoverMessage: isEn ? 'Talk to our support team' : 'Fale com o nosso atendimento',
      human: isEn ? 'Request personalized support' : 'Solicitar atendimento personalizado',
      contact: isEn ? 'Request contact' : 'Solicitar contato',
      solved: isEn ? 'That solved my question' : 'Isso resolveu minha dúvida'
    }),
    [isEn]
  )

  const activeFaq = useMemo(
    () => SUPPORT_FAQS.find((item) => item.id === activeFaqId) ?? SUPPORT_FAQS[0],
    [activeFaqId]
  )

  const humanSupportHref = useMemo(
    () =>
      buildWhatsAppLink(
        isEn
          ? 'Hello! I need personalized support with AutoWhats setup.'
          : 'Olá! Preciso de atendimento personalizado para configurar o AutoWhats.'
      ),
    [isEn]
  )

  const requestContactHref = useMemo(
    () =>
      buildWhatsAppLink(
        isEn
          ? 'Hello! I would like to request a contact from your team.'
          : 'Olá! Quero solicitar um contato da equipe.'
      ),
    [isEn]
  )

  if (!isLoggedArea) {
    return (
      <div className="fixed bottom-5 right-5 z-[70] sm:bottom-6 sm:right-6">
        <Link
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={isEn ? 'Talk on WhatsApp' : 'Falar no WhatsApp'}
          title={isEn ? 'Talk on WhatsApp' : 'Falar no WhatsApp'}
          className="group relative inline-grid h-14 w-14 place-items-center overflow-hidden rounded-full border border-white/25 bg-[#25D366] text-white shadow-[0_12px_30px_rgba(37,211,102,0.45)] transition-transform duration-200 hover:scale-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117]"
        >
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-black/10" />
          <span aria-hidden className="pointer-events-none absolute -inset-1 -z-10 rounded-full bg-[#25D366]/45 blur-sm" />
          <span aria-hidden className="inline-grid h-7 w-7 place-items-center">
            <svg
              viewBox="0 0 24 24"
              preserveAspectRatio="xMidYMid meet"
              className="block h-7 w-7"
              fill="currentColor"
            >
              <path d="M20.52 3.48A11.5 11.5 0 0 0 3.47 20.54L2 22l1.52-.39A11.5 11.5 0 1 0 20.52 3.48zm-7.36 17.1a9.66 9.66 0 0 1-4.87-1.32l-.35-.2-2.9.75.77-2.83-.23-.36A9.65 9.65 0 1 1 13.16 20.58zm5.18-5.27c-.28-.14-1.64-.81-1.9-.9-.25-.1-.44-.14-.62.14-.18.28-.72.9-.89 1.08-.16.18-.33.2-.61.07-.28-.14-1.17-.43-2.23-1.37-.82-.74-1.38-1.65-1.54-1.92-.16-.28 0-.43.12-.56.12-.12.28-.3.41-.46.14-.16.18-.28.27-.46.1-.18.05-.36-.02-.5-.07-.14-.62-1.48-.86-2.03-.23-.55-.46-.47-.62-.48l-.52-.01c-.18 0-.47.07-.72.34s-.94.94-.94 2.29.97 2.67 1.11 2.85c.14.18 1.93 2.94 4.68 4.12.65.28 1.14.45 1.53.58.65.2 1.25.18 1.72.11.53-.08 1.64-.67 1.88-1.28.23-.62.23-1.16.16-1.28-.07-.12-.25-.18-.53-.32z" />
            </svg>
          </span>
        </Link>
      </div>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-[70] sm:bottom-6 sm:right-6">
      <div
        className={cn(
          'w-[min(92vw,360px)] rounded-2xl border border-white/15 bg-[#10151f]/95 p-4 shadow-2xl backdrop-blur',
          isOpen ? 'pointer-events-auto mb-3 opacity-100' : 'pointer-events-none mb-0 opacity-0'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">{labels.title}</p>
            <p className="mt-1 text-xs text-gray-300">{labels.subtitle}</p>
          </div>
          <Bot className="h-5 w-5 text-primary" />
        </div>

        <div className="mt-4 space-y-2">
          {SUPPORT_FAQS.map((item) => {
            const question = isEn ? item.questionEn : item.questionPt
            const isActive = item.id === activeFaq.id

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveFaqId(item.id)}
                className={cn(
                  'w-full rounded-xl border px-3 py-2 text-left text-xs transition',
                  isActive
                    ? 'border-primary/40 bg-primary/10 text-white'
                    : 'border-white/10 bg-surface-light/60 text-gray-200 hover:border-white/20'
                )}
              >
                {question}
              </button>
            )
          })}
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-surface-light/60 p-3">
          <p className="text-xs leading-relaxed text-gray-200">
            {isEn ? activeFaq.answerEn : activeFaq.answerPt}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-xl border border-white/15 bg-surface/70 px-3 py-2 text-xs font-medium text-gray-100 transition hover:border-white/25"
          >
            {labels.solved}
          </button>

          <Link
            href={humanSupportHref}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/45 bg-primary/15 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/25"
          >
            <LifeBuoy className="h-4 w-4" />
            {labels.human}
          </Link>

          <Link
            href={requestContactHref}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-surface/70 px-3 py-2 text-xs font-medium text-gray-100 transition hover:border-white/25"
          >
            {labels.contact}
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <button
        type="button"
        aria-label={isOpen ? labels.close : labels.open}
        title={isOpen ? labels.close : labels.open}
        onClick={() => setIsOpen((prev) => !prev)}
        className="group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-full border border-primary/35 bg-[#0F1724] px-3 text-white shadow-[0_12px_28px_rgba(15,23,36,0.55)] transition-all duration-200 hover:pr-4 hover:shadow-[0_16px_34px_rgba(15,23,36,0.62)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117]"
      >
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-black/10" />
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          {isOpen ? <X className="h-4.5 w-4.5" /> : <LifeBuoy className="h-4.5 w-4.5" />}
        </span>
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold text-gray-100 transition-all duration-200 group-hover:ml-1 group-hover:max-w-[220px]">
          {labels.hoverMessage}
        </span>
      </button>
    </div>
  )
}
