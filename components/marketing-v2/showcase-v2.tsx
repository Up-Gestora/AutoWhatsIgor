'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Brain,
  Calendar,
  Check,
  Megaphone,
  MessageSquare,
  Pause,
  Paperclip,
  Play,
  QrCode,
  Sparkles,
  Users,
  Wand2,
  Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Reveal, useInViewOnce, usePrefersReducedMotion } from '@/components/marketing-v2/reveal'
import { trackCustom } from '@/lib/metaPixel'

type TabKey = 'qr' | 'training' | 'conversations' | 'files' | 'broadcast' | 'agenda' | 'crm'

type Tab = {
  key: TabKey
  label: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  bullets: string[]
  tipTitle: string
  tipText: string
}

const tabs: Tab[] = [
  {
    key: 'qr',
    label: 'Conexão por QR',
    icon: QrCode,
    title: 'Conecte seu WhatsApp em segundos',
    description:
      'Sem instalação, sem complicação. Escaneie e a automação começa a funcionar.',
    bullets: ['QR Code guiado', 'Status em tempo real', 'Pronto para atender no mesmo dia'],
    tipTitle: 'Dica rápida',
    tipText: 'Conectou? Faça um teste com você mesmo: mande "oi" e valide o fluxo antes de atender clientes.'
  },
  {
    key: 'training',
    label: 'Treinamento e regras',
    icon: Brain,
    title: 'Treine a IA no seu jeito de atender',
    description:
      'Defina regras, tom de voz e conhecimento. A IA responde curto, natural e sem inventar.',
    bullets: ['Base de conhecimento', 'Regras de repasse para humano', 'Controle do comportamento'],
    tipTitle: 'Dica de configuração',
    tipText: 'Comece com 10 FAQs + 3 regras de repasse. Ajuste depois com base nas conversas reais.'
  },
  {
    key: 'conversations',
    label: 'Conversas + Follow-up',
    icon: MessageSquare,
    title: 'Acompanhe conversas e gere follow-ups',
    description:
      'Veja tudo em um painel, use IA para sugerir mensagens e puxar o cliente para o próximo passo.',
    bullets: ['Lista de conversas', 'Rascunho com IA', 'Envio em 1 clique'],
    tipTitle: 'Dica de follow-up',
    tipText: 'Feche a conversa com 1 pergunta + 1 próximo passo (agendar, enviar arquivo ou pagar).'
  },
  {
    key: 'files',
    label: 'Envio de arquivos',
    icon: Paperclip,
    title: 'Envie arquivos sem sair do painel',
    description:
      'Anexe PDFs, imagens e documentos direto da conversa. Mais rápido que caçar no celular e copiar link.',
    bullets: ['Upload e pré-visualização', 'Envio em 1 clique', 'Histórico por conversa'],
    tipTitle: 'Dica de velocidade',
    tipText: 'Deixe seus 3 arquivos mais usados (tabela, catálogo, contrato) prontos para enviar em 1 clique.'
  },
  {
    key: 'broadcast',
    label: 'Transmissão',
    icon: Megaphone,
    title: 'Crie transmissões com controle e histórico',
    description:
      'Dispare campanhas com mensagem pronta, acompanhe o andamento e mantenha tudo organizado por transmissão.',
    bullets: ['Campanhas salvas', 'Acompanhamento do envio', 'Reaproveite mensagens'],
    tipTitle: 'Dica de campanha',
    tipText: 'Segmente por status (lead/cliente) e salve as transmissões que mais geram resposta.'
  },
  {
    key: 'agenda',
    label: 'Agenda',
    icon: Calendar,
    title: 'Agendamentos com disponibilidade e automação',
    description:
      'Configure horários, evite conflitos e deixe a IA sugerir e criar agendamentos quando fizer sentido.',
    bullets: ['Múltiplas agendas', 'Horários disponíveis', 'IA pode agendar'],
    tipTitle: 'Dica de agendamento',
    tipText: 'Ofereça sempre 2 opções objetivas para fechar rápido (ex.: 15:30 ou 16:00).'
  },
  {
    key: 'crm',
    label: 'CRM / Leads',
    icon: Users,
    title: 'Qualifique leads e organize o funil',
    description:
      'Marque status, capture contexto e mantenha a equipe alinhada. Menos caos no WhatsApp.',
    bullets: ['Status e tags', 'Histórico centralizado', 'Visão do pipeline'],
    tipTitle: 'Dica de organização',
    tipText: 'Use poucos status e mova o lead no final do atendimento. Assim, o funil ficará sempre atualizado.'
  }
]

function InlineTermHint({ label, description }: { label: string; description: string }) {
  const [open, setOpen] = useState(false)
  const tooltipId = useId()
  const containerRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const closeOnOutside = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('touchstart', closeOnOutside)

    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('touchstart', closeOnOutside)
    }
  }, [open])

  return (
    <span ref={containerRef} className="relative inline-flex items-center group/term">
      <button
        type="button"
        className="rounded-sm underline decoration-dotted underline-offset-[3px] decoration-primary/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
        aria-describedby={tooltipId}
        aria-expanded={open}
      >
        {label}
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-60 -translate-x-1/2 rounded-lg border border-white/10 bg-surface-light/95 px-3 py-2 text-xs font-normal leading-relaxed text-gray-100 shadow-xl backdrop-blur-md transition-opacity duration-150',
          'invisible opacity-0 group-hover/term:visible group-hover/term:opacity-100 group-focus-within/term:visible group-focus-within/term:opacity-100',
          open && 'visible opacity-100'
        )}
      >
        {description}
      </span>
    </span>
  )
}

function TabButton({
  tab,
  active,
  onSelect
}: {
  tab: Tab
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={`showcase-panel-${tab.key}`}
      id={`showcase-tab-${tab.key}`}
      onClick={onSelect}
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold transition-all',
        active
          ? 'bg-primary text-black border-primary shadow-[0_10px_30px_rgba(37,211,102,0.20)]'
          : 'bg-surface/40 text-gray-300/90 border-white/10 hover:border-primary/30 hover:text-white'
      )}
    >
      <tab.icon className={cn('w-4 h-4', active ? 'text-black' : 'text-primary')} />
      {tab.label}
    </button>
  )
}

function MockFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full rounded-3xl p-[1px] bg-[linear-gradient(110deg,rgba(37,211,102,0.55),rgba(255,255,255,0.10),rgba(10,143,127,0.55))] bg-[length:200%_200%] animate-shine motion-reduce:animate-none">
      <div className="h-full rounded-3xl bg-surface/70 backdrop-blur-md border border-white/5 shadow-2xl overflow-hidden">
        <div className="h-full overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}

function TopBar({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-surface-light/30">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
      </div>
      <div className="text-[11px] text-gray-300/80">{title}</div>
      <div className="w-10" />
    </div>
  )
}

function QrSvg({ className }: { className?: string }) {
  const size = 21
  const cells: { x: number; y: number }[] = []

  const inFinder = (x: number, y: number, ox: number, oy: number) => {
    const dx = x - ox
    const dy = y - oy
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false
    const onBorder = dx === 0 || dy === 0 || dx === 6 || dy === 6
    const innerBorder = dx === 2 || dy === 2 || dx === 4 || dy === 4
    return onBorder || innerBorder
  }

  const isDark = (x: number, y: number) => {
    // Basic finder patterns
    if (inFinder(x, y, 0, 0) || inFinder(x, y, size - 7, 0) || inFinder(x, y, 0, size - 7)) {
      return true
    }

    // Timing patterns
    if (x === 6 || y === 6) {
      return (x + y) % 2 === 0
    }

    // Pseudo-random fill (deterministic)
    const v = (x * 17 + y * 31 + x * y) % 11
    return v === 0 || v === 3 || v === 7
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (isDark(x, y)) {
        cells.push({ x, y })
      }
    }
  }

  return (
    <svg viewBox="0 0 210 210" className={className} aria-hidden="true">
      <rect x="0" y="0" width="210" height="210" rx="18" fill="#FFFFFF" />
      {cells.map((cell) => (
        <rect
          key={`${cell.x}-${cell.y}`}
          x={cell.x * 10 + 10}
          y={cell.y * 10 + 10}
          width="8"
          height="8"
          rx="1.5"
          fill="#0B141A"
          opacity="0.95"
        />
      ))}
      <rect x="0" y="0" width="210" height="210" rx="18" fill="none" stroke="#E5E7EB" opacity="0.75" />
    </svg>
  )
}

function QrMock() {
  return (
    <MockFrame>
      <TopBar title="Conexões" />
      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_210px] gap-4 items-center">
          <div>
            <h4 className="text-white font-bold text-xl">Conecte seu WhatsApp Business</h4>
            <p className="text-sm text-gray-300/80 mt-2">
              Abra o WhatsApp no celular, toque em Dispositivos conectados e escaneie o QR.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { label: 'Sessão', value: 'Ativa' },
                { label: 'IA', value: 'Ligada' },
                { label: 'Modo', value: 'Atendimento' },
                { label: 'Repasse', value: 'Automático' }
              ].map((row) => (
                <div
                  key={row.label}
                  className="rounded-xl bg-surface-light/40 border border-white/5 px-3 py-2"
                >
                  <div className="text-[10px] text-gray-400">{row.label}</div>
                  <div className="text-sm font-semibold text-white">{row.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div className="rounded-2xl bg-white p-3 shadow-xl">
              <QrSvg className="w-[170px] h-[170px]" />
              <div className="text-center mt-3 text-[11px] text-gray-700 font-semibold">
                Escanear com WhatsApp
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-surface-light/35 border border-white/10 px-4 py-3">
          <div className="text-xs font-semibold text-white">Como funciona a conexão</div>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-300/80">
            Após ler o QR Code, o sistema sincroniza suas conversas em segundos e mantém a sessão conectada
            para atendimento contínuo no painel.
          </p>
        </div>
      </div>
    </MockFrame>
  )
}

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'on' | 'off' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-semibold',
        tone === 'on' && 'bg-primary/10 border-primary/20 text-primary',
        tone === 'off' && 'bg-red-500/10 border-red-500/20 text-red-200',
        tone === 'neutral' && 'bg-surface-light/40 border-white/10 text-gray-200/80'
      )}
    >
      {children}
    </span>
  )
}

function TrainingMock() {
  return (
    <MockFrame>
      <TopBar title="Treinamento IA" />
      <div className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_210px] gap-4">
          <div className="rounded-2xl bg-surface-light/35 border border-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-white">Regras e comportamento</div>
              <Pill tone="on">IA ligada</Pill>
            </div>
            <div className="mt-3 grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface/40 border border-white/10 p-3">
                <div className="text-[10px] text-gray-400">Tom de voz</div>
                <div className="text-sm text-white mt-1">Humano, curto e direto</div>
              </div>
              <div className="rounded-xl bg-surface/40 border border-white/10 p-3">
                <div className="text-[10px] text-gray-400">Quando não souber</div>
                <div className="text-sm text-white mt-1">Chamar humano</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-surface/40 border border-white/10 p-3">
              <div className="text-[10px] text-gray-400">Orientações gerais (exemplo)</div>
              <div className="mt-2 font-mono text-[11px] leading-relaxed text-gray-200/80">
                <div>{'SEU OBJETIVO: tirar dúvidas, vender e agendar.'}</div>
                <div className="mt-2">{'- Mensagens curtas, 1-2 perguntas por vez.'}</div>
                <div>{'- Quando necessário, passe para humano.'}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-surface-light/35 border border-white/5 p-4">
            <div className="text-sm font-bold text-white">Modelo</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill>Provider: Google</Pill>
              <Pill>Gemini 3 Flash</Pill>
              <Pill tone="neutral">Latência baixa</Pill>
            </div>

            <div className="mt-4 rounded-xl bg-surface/40 border border-white/10 p-3">
              <div className="text-[10px] text-gray-400">Chaves de controle</div>
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-gray-200/80">
                  <span>Responder clientes</span>
                  <Pill tone="on">ON</Pill>
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-200/80">
                  <span>Responder grupos</span>
                  <Pill tone="off">OFF</Pill>
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-200/80">
                  <span>Follow-up</span>
                  <Pill tone="on">ON</Pill>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MockFrame>
  )
}

function ConversationsMock() {
  return (
    <MockFrame>
      <div className="h-full flex flex-col">
        <TopBar title="Conversas" />
        <div className="grid grid-cols-[200px_1fr] flex-1 min-h-0">
          <div className="h-full flex flex-col overflow-hidden border-r border-white/5 bg-surface-light/25">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <div className="text-xs font-semibold text-white">Inbox</div>
              <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">
                5 novos
              </span>
            </div>
            <div className="flex-1 divide-y divide-white/5 overflow-hidden">
              {[
                { name: 'Mariana', msg: 'Pode agendar para quinta?', tag: 'Agendamento' },
                { name: 'Rafael', msg: 'Qual o valor do Pro?', tag: 'Venda' },
                { name: 'Camila', msg: 'Tem horário hoje?', tag: 'IA' },
                { name: 'Bruna', msg: 'Consegue me enviar o catálogo?', tag: 'Arquivo' },
                { name: 'Eduardo', msg: 'Vocês atendem sábado?', tag: 'Dúvida' }
              ].map((c) => (
                <div key={c.name} className="px-4 py-2.5 hover:bg-white/5 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] text-white font-semibold">{c.name}</div>
                    <span className="text-[10px] text-primary">{c.tag}</span>
                  </div>
                  <div className="text-[11px] text-gray-400 truncate mt-1">{c.msg}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 h-full min-h-0 flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">Mariana</div>
                <div className="text-[11px] text-gray-400">Atendimento com IA</div>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">
                IA sugerindo
              </span>
            </div>

            <div className="mt-3 flex-1 space-y-2 overflow-hidden">
              <div className="flex justify-end">
                <div className="bg-primary-dark/90 text-white px-4 py-2 rounded-2xl rounded-tr-md max-w-[85%] border border-white/5 text-sm">
                  Oi! Tem horário na quinta à tarde?
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-surface-light/50 text-white px-4 py-2 rounded-2xl rounded-tl-md max-w-[85%] border border-white/5 text-sm">
                  Tenho sim. Prefere 15:30 ou 16:00?
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-primary">
                    <Wand2 className="w-3 h-3" />
                    Respondido pela IA
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-primary-dark/90 text-white px-4 py-2 rounded-2xl rounded-tr-md max-w-[85%] border border-white/5 text-sm">
                  Perfeito, 15:30 funciona para mim.
                </div>
              </div>
            </div>

            <div className="mt-3 shrink-0 rounded-2xl bg-surface/70 border border-white/10 backdrop-blur-md p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Follow-up com IA</div>
                    <div className="text-[11px] text-gray-300/70">Rascunho pronto para enviar</div>
                  </div>
                </div>
                <span className="text-[10px] px-3 py-1 rounded-full bg-primary text-black font-bold">
                  Enviar
                </span>
              </div>
              <div className="mt-2 text-[11px] text-gray-200/80 leading-relaxed max-h-[2.8em] overflow-hidden">
                &ldquo;Perfeito! Posso confirmar quinta às 15:30? Se preferir 16:00, me avise :)&rdquo;
              </div>
            </div>
          </div>
        </div>
      </div>
    </MockFrame>
  )
}

function FilesMock() {
  return (
    <MockFrame>
      <TopBar title="Envio de arquivos" />
      <div className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-white">Arquivos</div>
            <div className="text-[11px] text-gray-400">Envie PDFs, imagens e documentos em segundos</div>
          </div>
          <span className="text-[10px] px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">
            Arraste e solte
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] gap-4 items-stretch">
          <div className="rounded-2xl bg-surface-light/35 border border-white/5 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 text-[10px] uppercase tracking-wide text-gray-400">
              Biblioteca
            </div>
            <div className="divide-y divide-white/5">
              {[
                { name: 'Tabela de preços.pdf', meta: '210 KB' },
                { name: 'Portfólio.jpg', meta: '1.2 MB' },
                { name: 'Contrato.docx', meta: '78 KB' },
                { name: 'Proposta comercial.pdf', meta: '324 KB' }
              ].map((file) => (
                <div key={file.name} className="px-4 py-3 hover:bg-white/5 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] text-white font-semibold truncate">{file.name}</div>
                      <div className="text-[10px] text-gray-400 mt-1">{file.meta}</div>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-surface/60 border border-white/10 text-gray-200/80">
                      Enviar
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-2xl bg-surface-light/35 border border-white/5 p-4 relative min-h-[280px] overflow-hidden">
            <div className="text-[11px] text-gray-400">Pré-visualização</div>
            <div className="mt-2 rounded-xl bg-surface/40 border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center text-primary">
                  <Paperclip className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">Tabela de preços.pdf</div>
                  <div className="text-[11px] text-gray-300/70 truncate">Pronto para enviar para Mariana</div>
                </div>
              </div>
            </div>

            <div className="absolute right-4 bottom-4 left-4 rounded-2xl bg-surface/70 border border-white/10 backdrop-blur-md p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Sugestão da IA</div>
                    <div className="text-[11px] text-gray-300/70">Anexar e mandar mensagem</div>
                  </div>
                </div>
                <span className="text-[10px] px-3 py-1 rounded-full bg-primary text-black font-bold">
                  Enviar
                </span>
              </div>
              <div className="mt-3 text-[11px] text-gray-200/80 leading-relaxed">
                &ldquo;Segue a tabela de preços atualizada. Quer que eu separe o melhor plano para você?&rdquo;
              </div>
            </div>
          </div>
        </div>
      </div>
    </MockFrame>
  )
}

function BroadcastMock() {
  return (
    <MockFrame>
      <TopBar title="Transmissão" />
      <div className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-white">Campanhas</div>
            <div className="text-[11px] text-gray-400">Envios com histórico e controle por transmissão</div>
          </div>
          <span className="text-[10px] px-3 py-1 rounded-full bg-primary text-black font-bold">Nova</span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
          <div className="space-y-3">
            <div className="rounded-2xl bg-surface-light/35 border border-white/5 p-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center text-primary">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">Promo da semana</div>
                  <div className="text-[11px] text-gray-300/70 truncate">Público: 312 contatos</div>
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-surface/40 border border-white/10 p-3">
                <div className="text-[10px] text-gray-400">Mensagem</div>
                <div className="mt-2 text-[11px] text-gray-200/80 leading-relaxed">
                  &ldquo;Oi! Últimos horários da semana com desconto. Quer reservar?&rdquo;
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-gray-300/70">
                <span>Agendado</span>
                <Pill>Hoje 18:30</Pill>
              </div>
            </div>

            <div className="rounded-2xl bg-surface-light/35 border border-white/5 p-3">
              <div className="flex items-start gap-2 text-[11px] text-gray-300/80 leading-relaxed">
                <Zap className="w-4 h-4 text-primary mt-[1px] flex-shrink-0" />
                Campanhas ficam salvas com público, mensagem e status do envio.
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-surface-light/35 border border-white/5 p-3">
            <div className="text-sm font-bold text-white">Progresso</div>
            <div className="text-[11px] text-gray-400 mt-0.5">Acompanhe o envio em tempo real</div>

            <div className="mt-3 space-y-2">
              {[
                { label: 'Enviados', value: '128', tone: 'on' as const },
                { label: 'Pendentes', value: '184', tone: 'neutral' as const },
                { label: 'Falhas', value: '0', tone: 'off' as const }
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="flex items-center justify-between rounded-xl bg-surface/40 border border-white/10 px-3 py-1.5"
                >
                  <span className="text-[11px] text-gray-200/80">{metric.label}</span>
                  <Pill tone={metric.tone}>{metric.value}</Pill>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <div className="h-2 rounded-full bg-white/5 overflow-hidden border border-white/5">
                <div className="h-full bg-primary/80 w-[40%]" />
              </div>
              <div className="mt-1.5 text-[11px] text-gray-300/70">40% concluído</div>
            </div>
          </div>
        </div>

      </div>
    </MockFrame>
  )
}

function AgendaMock() {
  return (
    <MockFrame>
      <div className="h-full flex flex-col">
        <TopBar title="Agenda" />
        <div className="grid grid-cols-[200px_1fr] flex-1 min-h-0">
        <div className="h-full flex flex-col overflow-hidden border-r border-white/5 bg-surface-light/25 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-white">Agendas</div>
            <span className="text-[10px] text-primary">4</span>
          </div>

          <div className="mt-3 flex-1 min-h-0 flex flex-col gap-2">
            {[
              { name: 'Clínica', color: 'bg-primary' },
              { name: 'Retornos', color: 'bg-blue-400' },
              { name: 'Equipe', color: 'bg-yellow-400' },
              { name: 'Reunião', color: 'bg-fuchsia-400' }
            ].map((a) => (
              <div
                key={a.name}
                className="flex-1 min-h-0 flex items-center justify-between rounded-xl bg-surface/40 border border-white/10 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('w-2.5 h-2.5 rounded-full', a.color)} />
                  <span className="text-[11px] text-white font-semibold truncate">{a.name}</span>
                </div>
                <span className="text-[10px] text-gray-300/70">ON</span>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-xl bg-surface/40 border border-white/10 p-3">
            <div className="text-[10px] text-gray-400">Horários disponíveis</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {['16:00', '17:00', '19:00'].map((h) => (
                <Pill key={h}>{h}</Pill>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 h-full min-h-0 flex flex-col">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-white">Agendamentos</div>
              <div className="text-[11px] text-gray-400">Organize o dia e evite conflitos</div>
            </div>
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">
              IA pode agendar
            </span>
          </div>

          <div className="mt-3 flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
            {[
              { time: '09:30', title: 'Avaliação', who: 'Mariana' },
              { time: '11:00', title: 'Retorno', who: 'Rafael' },
              { time: '14:00', title: 'Consulta', who: 'Camila' },
              { time: '19:00', title: 'Reunião', who: 'Equipe' }
            ].map((apt) => (
              <div
                key={`${apt.time}-${apt.who}`}
                className="flex-1 min-h-0 rounded-2xl bg-surface-light/35 border border-white/5 px-4 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] text-gray-300/70">{apt.time}</div>
                  <div className="text-[11px] text-primary">{apt.who}</div>
                </div>
                <div className="text-sm text-white font-semibold mt-1">{apt.title}</div>
              </div>
            ))}
          </div>

        </div>
        </div>
      </div>
    </MockFrame>
  )
}

function StatusChip({ children, tone }: { children: React.ReactNode; tone: 'novo' | 'em' | 'cliente' }) {
  return (
    <span
      className={cn(
        'text-[10px] px-2.5 py-1 rounded-full border font-semibold',
        tone === 'novo' && 'bg-primary/10 border-primary/20 text-primary',
        tone === 'em' && 'bg-blue-400/10 border-blue-400/20 text-blue-200',
        tone === 'cliente' && 'bg-green-400/10 border-green-400/20 text-green-200'
      )}
    >
      {children}
    </span>
  )
}

function CrmMock() {
  return (
    <MockFrame>
      <TopBar title="CRM / Leads" />
      <div className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-white">Leads</div>
            <div className="text-[11px] text-gray-400">Visão rápida do funil</div>
          </div>
          <span className="text-[10px] px-3 py-1 rounded-full bg-surface-light/40 border border-white/10 text-gray-200/80">
            Últimos 30d
          </span>
        </div>

        <div className="mt-4 rounded-2xl bg-surface-light/35 border border-white/5 overflow-hidden">
          <div className="grid grid-cols-[1.2fr_0.7fr_1fr] gap-3 px-4 py-3 border-b border-white/5 text-[10px] uppercase tracking-wide text-gray-400">
            <div>Contato</div>
            <div>Status</div>
            <div>Última mensagem</div>
          </div>

          <div className="divide-y divide-white/5">
            {[
              { name: 'Mariana Lima', status: 'em', msg: 'Pode ser quinta às 15:30.' },
              { name: 'Rafael Souza', status: 'novo', msg: 'Quero o Pro. Como começo?' },
              { name: 'Camila Torres', status: 'cliente', msg: 'Pode deixar agendado semanal.' }
            ].map((row) => (
              <div
                key={row.name}
                className="grid grid-cols-[1.2fr_0.7fr_1fr] gap-3 px-4 py-3 items-center"
              >
                <div className="min-w-0">
                  <div className="text-[11px] text-white font-semibold truncate">{row.name}</div>
                  <div className="text-[11px] text-gray-400 truncate">WhatsApp</div>
                </div>
                <div>
                  {row.status === 'novo' && <StatusChip tone="novo">Novo</StatusChip>}
                  {row.status === 'em' && <StatusChip tone="em">Em atendimento</StatusChip>}
                  {row.status === 'cliente' && <StatusChip tone="cliente">Cliente</StatusChip>}
                </div>
                <div className="text-[11px] text-gray-300/80 truncate">{row.msg}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 text-[11px] text-gray-300/70">
          <Zap className="w-4 h-4 text-primary" />
          A IA pode sugerir status, campos e próximos passos automaticamente.
        </div>
      </div>
    </MockFrame>
  )
}

export function ShowcaseV2({
  autoPlay = false,
  autoPlayIntervalMs = 6500
}: {
  autoPlay?: boolean
  autoPlayIntervalMs?: number
}) {
  const reducedMotion = usePrefersReducedMotion()
  const { ref, inView } = useInViewOnce<HTMLElement>({
    rootMargin: '0px 0px -20% 0px',
    threshold: 0.15
  })

  const [active, setActive] = useState<TabKey>('qr')
  const [isAutoPlayPaused, setIsAutoPlayPaused] = useState(false)

  const activeTab = useMemo(() => tabs.find((t) => t.key === active)!, [active])

  const shouldAutoPlay = Boolean(autoPlay && inView && !reducedMotion && !isAutoPlayPaused)

  const handleSelect = (key: TabKey, userInitiated: boolean) => {
    setActive(key)
    if (userInitiated) {
      setIsAutoPlayPaused(true)
      trackCustom('LandingV2_Tab_Change', { tab: key })
    }
  }

  useEffect(() => {
    if (!shouldAutoPlay) {
      return
    }

    // Extra guard: even if the hook state lags during hydration, never autoplay when reduced motion is requested.
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    const currentIndex = tabs.findIndex((t) => t.key === active)
    const nextKey = tabs[(currentIndex + 1) % tabs.length]?.key ?? 'qr'

    const id = window.setTimeout(() => {
      setActive(nextKey)
    }, Math.max(1200, autoPlayIntervalMs))

    return () => window.clearTimeout(id)
  }, [active, autoPlayIntervalMs, shouldAutoPlay])

  return (
    <section id="produto" className="py-24 relative scroll-mt-24 overflow-x-hidden" ref={ref}>
      <div className="container mx-auto px-4 relative z-10">
        <Reveal>
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface/50 border border-white/10 backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-gray-300/90">Veja por dentro</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mt-6">
              Recursos para atendimento,{' '}
              <InlineTermHint
                label="CRM"
                description="CRM organiza contatos, histórico e etapas do funil para o time vender com contexto."
              />{' '}
              e <span className="gradient-text">automação no WhatsApp</span>
            </h2>
            <p className="text-gray-300/80 mt-3">
              Um fluxo completo: conecta, treina, atende, envia arquivos, faz transmissões, agenda e qualifica. Tudo no
              mesmo lugar.
            </p>
          </div>
        </Reveal>

        <div className="mt-10">
          <Reveal delayMs={120}>
            <div
              role="tablist"
              aria-label="Showcase do produto"
              className="flex flex-wrap gap-2"
            >
              {tabs.map((tab) => (
                <TabButton
                  key={tab.key}
                  tab={tab}
                  active={active === tab.key}
                  onSelect={() => handleSelect(tab.key, true)}
                />
              ))}
            </div>
          </Reveal>

          {autoPlay && !reducedMotion && (
            <Reveal delayMs={160}>
              <div className="mt-4 w-full">
                <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden border border-white/5">
                  {shouldAutoPlay ? (
                    <div
                      key={active}
                      className="h-full origin-left bg-primary/80 animate-progress-bar"
                      style={
                        {
                          // Tailwind animation uses this CSS var as duration.
                          '--progress-duration': `${Math.max(1200, autoPlayIntervalMs)}ms`
                        } as React.CSSProperties
                      }
                    />
                  ) : (
                    <div className="h-full origin-left bg-primary/30 scale-x-0" />
                  )}
                </div>
                
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAutoPlayPaused((prev) => !prev)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-black transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    aria-pressed={isAutoPlayPaused}
                    aria-label={isAutoPlayPaused ? 'Retomar autoplay' : 'Pausar autoplay'}
                  >
                    {isAutoPlayPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </button>
                  <span className="text-[11px] text-gray-300">
                    {isAutoPlayPaused ? 'Auto-play pausado' : 'Auto-play em execução'}
                  </span>
                </div>

              </div>
            </Reveal>
          )}

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-[1fr_560px] gap-10 items-stretch">
            <Reveal delayMs={180}>
              <div className="h-full rounded-3xl bg-surface/45 border border-white/10 p-7 lg:h-[420px] lg:overflow-hidden">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center text-primary">
                    <activeTab.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-primary">Produto</div>
                    <div className="text-2xl font-bold text-white">{activeTab.title}</div>
                  </div>
                </div>

                <p className="text-gray-300/80 mt-4 leading-relaxed">{activeTab.description}</p>

                <ul className="mt-6 space-y-3">
                  {activeTab.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3">
                      <span className="w-7 h-7 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center text-primary flex-shrink-0 self-start -translate-y-[3px]">
                        <Check className="w-4 h-4" />
                      </span>
                      <span className="text-gray-200/90 leading-snug">{bullet}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8 p-4 rounded-2xl bg-surface-light/40 border border-white/5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Wand2 className="w-4 h-4 text-primary" />
                    {activeTab.tipTitle}
                  </div>
                  <p className="text-sm text-gray-300/75 mt-2">
                    {activeTab.tipText}
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delayMs={220} className="h-full lg:sticky lg:top-24">
              <div
                role="tabpanel"
                id={`showcase-panel-${activeTab.key}`}
                aria-labelledby={`showcase-tab-${activeTab.key}`}
                className="outline-none h-full lg:h-[420px] overflow-hidden"
              >
                <div key={activeTab.key} className="h-full animate-fade-in-up motion-reduce:animate-none overflow-hidden">
                  {activeTab.key === 'qr' && <QrMock />}
                  {activeTab.key === 'training' && <TrainingMock />}
                  {activeTab.key === 'conversations' && <ConversationsMock />}
                  {activeTab.key === 'files' && <FilesMock />}
                  {activeTab.key === 'broadcast' && <BroadcastMock />}
                  {activeTab.key === 'agenda' && <AgendaMock />}
                  {activeTab.key === 'crm' && <CrmMock />}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
