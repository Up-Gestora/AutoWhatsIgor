'use client'

import Link from 'next/link'
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Sparkles,
  Wand2,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { EmbeddedWhatsappConnection } from '@/components/onboarding/embedded-whatsapp-connection'
import { auth } from '@/lib/firebase'
import { useI18n } from '@/lib/i18n/client'
import { emitOnboardingEventSafe } from '@/lib/onboarding/events'
import { isOnboardingGuidedTestEnabled, isOnboardingWizardEnabled } from '@/lib/onboarding/flags'
import { TRAINING_VERTICAL_TEMPLATES } from '@/lib/onboarding/templates'
import type {
  OnboardingDraftPayload,
  OnboardingGuidedTestChangeProposal,
  OnboardingPublishResult,
  OnboardingState,
  TrainingVerticalTemplateId
} from '@/lib/onboarding/types'
import {
  TRAINING_COMMERCIAL_DESCRIPTION_FIELD,
  normalizeTrainingInstructions,
  type TrainingLanguage
} from '@/lib/training/schema'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'

type DraftResponse = OnboardingDraftPayload & { success?: boolean }
type StateResponse = { success?: boolean; state?: OnboardingState }
type GuidedMessageResponse = {
  success?: boolean
  testSessionId: string
  assistantMessage: string
  assistantParts: string[]
  remainingCredits: number
  readiness: OnboardingDraftPayload['readiness']
}
type GuidedChangeResponse = { success?: boolean; proposal?: OnboardingGuidedTestChangeProposal }
type GuidedValidationResponse = {
  success?: boolean
  guidedValidation?: OnboardingDraftPayload['guidedValidation']
}
type PublishResponse = OnboardingPublishResult & { success?: boolean }
type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'
type SaveReason = 'autosave' | 'step' | 'template' | 'validation' | 'publish'
type DraftSnapshot = {
  currentStep: number
  selectedTemplateId: string | null
  training: Record<string, unknown>
}

class ApiRequestError extends Error {
  readonly status: number
  readonly payload: Record<string, unknown> | null

  constructor(message: string, status: number, payload: Record<string, unknown> | null) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.payload = payload
  }
}

type LocalePair = { pt: string; en: string }
type LocalizedScenario = { id: string; label: LocalePair; message: LocalePair }
type LocalizedTemplatePreset = {
  label: LocalePair
  description: LocalePair
  values: Record<TrainingLanguage, Record<string, string>>
  scenarios: LocalizedScenario[]
}
export type LocalizedTemplateView = {
  id: TrainingVerticalTemplateId
  label: string
  description: string
  values: Record<string, unknown>
  scenarios: Array<{ id: string; label: string; message: string }>
}
export type StepField = { key: string; label: string; textarea?: boolean }

const LANGUAGE_SENSITIVE_FIELDS = [
  'mensagemEncaminharHumano',
  'tipoResposta',
  'orientacoesGerais',
  'instrucoesSugestoesLeadsClientes'
] as const

const DEFAULT_LAB_SCENARIOS: LocalizedScenario[] = [
  {
    id: 'pricing',
    label: { pt: 'Preço', en: 'Pricing' },
    message: {
      pt: 'Oi, queria saber os preços e como funciona.',
      en: 'Hi, I would like to understand your pricing and how it works.'
    }
  },
  {
    id: 'hours',
    label: { pt: 'Horário', en: 'Hours' },
    message: {
      pt: 'Vocês atendem hoje? Qual é o horário disponível?',
      en: 'Are you open today? What time slots do you have available?'
    }
  },
  {
    id: 'qualification',
    label: { pt: 'Qualificação', en: 'Qualification' },
    message: {
      pt: 'Tenho interesse, mas queria entender qual serviço faz mais sentido para mim.',
      en: 'I am interested, but I want to understand which service makes the most sense for me.'
    }
  },
  {
    id: 'objection',
    label: { pt: 'Objeção', en: 'Objection' },
    message: {
      pt: 'Achei caro. Tem alguma opção melhor para começar?',
      en: 'It feels expensive. Is there a better way to get started?'
    }
  },
  {
    id: 'handoff',
    label: { pt: 'Humano', en: 'Human handoff' },
    message: {
      pt: 'Quero falar com uma pessoa agora.',
      en: 'I want to speak with a person right now.'
    }
  }
]

const LOCALIZED_TEMPLATE_PRESETS: Record<TrainingVerticalTemplateId, LocalizedTemplatePreset> = {
  clinica_estetica: {
    label: { pt: 'Clínica / Estética', en: 'Clinic / Aesthetics' },
    description: {
      pt: 'Captação de consultas e procedimentos estéticos.',
      en: 'Lead capture for consultations and aesthetic procedures.'
    },
    values: {
      'pt-BR': {
        empresa:
          'Somos uma clínica de estética em {{cidade}} focada em resultados naturais, atendimento humanizado e acompanhamento completo.',
        servicos:
          '- Avaliação estética personalizada\n- Limpeza de pele\n- Peelings\n- Botox e preenchimento\n- Protocolos corporais\n- Pós-procedimento orientado',
        horarios: 'Segunda a sexta: 08:00 às 19:00\nSábado: 08:00 às 13:00\nDomingo: fechado',
        valores:
          'Os valores variam por procedimento e avaliação. Sempre ofereça avaliação inicial para indicar o melhor protocolo.',
        orientacoesGerais:
          'Objetivo principal: converter interessados em agendar avaliação.\nResponda com mensagens curtas, linguagem acolhedora e foco em próximo passo.\nNão prometa resultado clínico garantido.\nSempre finalize com CTA para agendar avaliação.',
        orientacoesFollowUp:
          'No follow-up, retome o interesse no procedimento citado e pergunte se prefere avaliação presencial ou online.\nSe não responder ao primeiro retorno, espaçar contatos.',
        instrucoesSugestoesLeadsClientes:
          'Atualize status para em_processo quando houver interesse em agendar.\nSe não responder, sugerir próximo contato D+3, D+14 e depois +60 dias.\nRecusa explícita: status inativo e nextContactAt nulo.'
      },
      en: {
        empresa:
          'We are an aesthetics clinic in {{cidade}} focused on natural results, warm support, and end-to-end follow-up.',
        servicos:
          '- Personalized aesthetic assessment\n- Skin cleansing\n- Peels\n- Botox and fillers\n- Body treatment protocols\n- Guided post-procedure follow-up',
        horarios: 'Monday to Friday: 08:00 to 19:00\nSaturday: 08:00 to 13:00\nSunday: closed',
        valores:
          'Pricing varies by procedure and assessment. Always offer an initial consultation to recommend the best protocol.',
        orientacoesGerais:
          'Primary goal: convert interested leads into booked consultations.\nReply with short messages, warm language, and a clear next step.\nDo not promise guaranteed clinical results.\nAlways close with a CTA to book an assessment.',
        orientacoesFollowUp:
          'In follow-up messages, revisit the procedure mentioned and ask whether the lead prefers an in-person or online consultation.\nIf they do not reply to the first follow-up, increase the spacing between messages.',
        instrucoesSugestoesLeadsClientes:
          'Move the lead to in_progress when they show interest in booking.\nIf they stop replying, suggest next contact on D+3, D+14, and then +60 days.\nIf they explicitly refuse, mark them inactive and clear nextContactAt.'
      }
    },
    scenarios: [
      {
        id: 'pricing',
        label: { pt: 'Preço', en: 'Pricing' },
        message: {
          pt: 'Oi, queria saber quanto custa uma avaliação e como funciona.',
          en: 'Hi, I want to know how much an assessment costs and how the process works.'
        }
      },
      {
        id: 'hours',
        label: { pt: 'Horário', en: 'Hours' },
        message: {
          pt: 'Vocês têm horário hoje à tarde para avaliação?',
          en: 'Do you have any consultation slots available this afternoon?'
        }
      },
      {
        id: 'qualification',
        label: { pt: 'Qualificação', en: 'Qualification' },
        message: {
          pt: 'Quero melhorar flacidez, mas não sei qual procedimento é ideal.',
          en: 'I want to improve skin laxity, but I am not sure which treatment is best.'
        }
      },
      {
        id: 'objection',
        label: { pt: 'Objeção', en: 'Objection' },
        message: {
          pt: 'Achei caro. Existe algum protocolo de entrada mais acessível?',
          en: 'It feels expensive. Is there a more accessible starter option?'
        }
      },
      {
        id: 'handoff',
        label: { pt: 'Humano', en: 'Human handoff' },
        message: {
          pt: 'Antes de fechar, quero falar com uma pessoa da clínica.',
          en: 'Before moving forward, I want to speak with someone from the clinic.'
        }
      }
    ]
  },
  odontologia: {
    label: { pt: 'Odontologia', en: 'Dental' },
    description: {
      pt: 'Triagem de tratamento odontológico e agendamento de avaliação.',
      en: 'Treatment triage and consultation booking for dental care.'
    },
    values: {
      'pt-BR': {
        empresa:
          'Somos uma clínica odontológica em {{cidade}} com foco em atendimento consultivo, previsibilidade de tratamento e acompanhamento próximo.',
        servicos:
          '- Avaliação odontológica\n- Ortodontia\n- Implantes\n- Clareamento\n- Endodontia\n- Próteses',
        horarios: 'Segunda a sexta: 08:00 às 18:00\nSábado: 08:00 às 12:00\nDomingo: fechado',
        valores:
          'Valores dependem de avaliação clínica. Informe faixa apenas quando houver política definida no treinamento.',
        orientacoesGerais:
          'Priorize acolhimento e triagem rápida da necessidade do paciente.\nSempre conduza para avaliação inicial e explique que o plano depende do diagnóstico.',
        orientacoesFollowUp:
          'Retome o motivo da busca (dor, estética, alinhamento) e ofereça horários disponíveis de avaliação.\nEvite mensagens longas.',
        instrucoesSugestoesLeadsClientes:
          'Interesse em avaliação: em_processo.\nAguardando retorno: aguardando com próximo contato em 3 dias.\nSem resposta recorrente: ampliar intervalo e inativar após 6 tentativas.'
      },
      en: {
        empresa:
          'We are a dental clinic in {{cidade}} focused on consultative care, treatment clarity, and close follow-up.',
        servicos:
          '- Dental assessment\n- Orthodontics\n- Implants\n- Whitening\n- Root canal treatment\n- Prosthetics',
        horarios: 'Monday to Friday: 08:00 to 18:00\nSaturday: 08:00 to 12:00\nSunday: closed',
        valores:
          'Pricing depends on the clinical assessment. Share ranges only when a policy has been explicitly defined in training.',
        orientacoesGerais:
          'Prioritize empathy and quick patient triage.\nAlways guide the lead toward an initial consultation and explain that the treatment plan depends on the diagnosis.',
        orientacoesFollowUp:
          'Bring back the original need (pain, aesthetics, alignment) and offer available consultation times.\nAvoid long messages.',
        instrucoesSugestoesLeadsClientes:
          'Interest in an assessment: in_progress.\nWaiting for reply: waiting with next contact in 3 days.\nRepeated no response: increase the interval and mark inactive after 6 attempts.'
      }
    },
    scenarios: [
      {
        id: 'pricing',
        label: { pt: 'Preço', en: 'Pricing' },
        message: {
          pt: 'Oi, queria entender valores de avaliação e clareamento.',
          en: 'Hi, I want to understand the pricing for an assessment and whitening.'
        }
      },
      {
        id: 'hours',
        label: { pt: 'Horário', en: 'Hours' },
        message: {
          pt: 'Vocês atendem sábado de manhã?',
          en: 'Are you open on Saturday morning?'
        }
      },
      {
        id: 'qualification',
        label: { pt: 'Qualificação', en: 'Qualification' },
        message: {
          pt: 'Estou com dor e queria saber se meu caso precisa de avaliação urgente.',
          en: 'I am in pain and I want to know whether my case needs an urgent assessment.'
        }
      },
      {
        id: 'objection',
        label: { pt: 'Objeção', en: 'Objection' },
        message: {
          pt: 'Estou comparando clínicas. Por que eu deveria marcar aí?',
          en: 'I am comparing clinics. Why should I book with you?'
        }
      },
      {
        id: 'handoff',
        label: { pt: 'Humano', en: 'Human handoff' },
        message: {
          pt: 'Quero falar com alguém da clínica antes de agendar.',
          en: 'I want to speak with someone from the clinic before booking.'
        }
      }
    ]
  },
  imobiliaria: {
    label: { pt: 'Imobiliária', en: 'Real Estate' },
    description: {
      pt: 'Qualificação de compradores e locatários.',
      en: 'Qualification for buyers and renters.'
    },
    values: {
      'pt-BR': {
        empresa:
          'Somos uma imobiliária de {{cidade}} especializada em compra, venda e locação com atendimento consultivo para encontrar o imóvel ideal.',
        servicos:
          '- Compra e venda de imóveis\n- Locação residencial e comercial\n- Captação de proprietários\n- Simulação e apoio documental',
        horarios: 'Segunda a sexta: 09:00 às 18:30\nSábado: 09:00 às 13:00',
        valores:
          'Valores, taxas e condições variam por imóvel. Sempre confirme faixa de orçamento e tipo de imóvel desejado.',
        orientacoesGerais:
          'Qualifique rapidamente perfil, bairro, faixa de valor e objetivo (compra ou locação).\nConduza para envio de opções e visita.',
        orientacoesFollowUp:
          'No follow-up, apresente próximo passo concreto: receber opções, agendar visita ou confirmar documentação.',
        instrucoesSugestoesLeadsClientes:
          'Lead qualificado com faixa e objetivo: em_processo.\nSem resposta: D+3, D+14, +60 dias.\nRecusa explícita: inativo e sem próximo contato.'
      },
      en: {
        empresa:
          'We are a real estate agency in {{cidade}} specialized in buying, selling, and renting, with consultative guidance to find the ideal property.',
        servicos:
          '- Property sales\n- Residential and commercial rentals\n- Property owner acquisition\n- Financing simulation and document support',
        horarios: 'Monday to Friday: 09:00 to 18:30\nSaturday: 09:00 to 13:00',
        valores:
          'Prices, fees, and terms vary by property. Always confirm budget range and desired property type.',
        orientacoesGerais:
          'Quickly qualify the profile, preferred area, budget range, and objective (buy or rent).\nGuide the lead toward receiving options and booking a visit.',
        orientacoesFollowUp:
          'In follow-up, propose a concrete next step: receive listings, schedule a visit, or confirm documentation.',
        instrucoesSugestoesLeadsClientes:
          'Qualified lead with budget and objective: in_progress.\nNo response: D+3, D+14, and +60 days.\nExplicit refusal: inactive with no next contact.'
      }
    },
    scenarios: [
      {
        id: 'pricing',
        label: { pt: 'Preço', en: 'Pricing' },
        message: {
          pt: 'Quero entender a faixa de valores dos imóveis disponíveis.',
          en: 'I want to understand the price range of the available properties.'
        }
      },
      {
        id: 'hours',
        label: { pt: 'Horário', en: 'Visit timing' },
        message: {
          pt: 'Vocês conseguem agendar visita ainda hoje?',
          en: 'Can you schedule a property visit for today?'
        }
      },
      {
        id: 'qualification',
        label: { pt: 'Qualificação', en: 'Qualification' },
        message: {
          pt: 'Busco apartamento para alugar, 2 quartos, perto do centro.',
          en: 'I am looking for a two-bedroom apartment to rent near downtown.'
        }
      },
      {
        id: 'objection',
        label: { pt: 'Objeção', en: 'Objection' },
        message: {
          pt: 'Achei as opções acima do orçamento. Tem algo mais enxuto?',
          en: 'The options feel above my budget. Do you have something more affordable?'
        }
      },
      {
        id: 'handoff',
        label: { pt: 'Humano', en: 'Human handoff' },
        message: {
          pt: 'Quero falar com um corretor agora.',
          en: 'I want to speak with an agent right now.'
        }
      }
    ]
  },
  oficina_auto: {
    label: { pt: 'Oficina / Auto', en: 'Auto Repair' },
    description: {
      pt: 'Atendimento para revisão, diagnóstico e serviços automotivos.',
      en: 'Support for inspections, diagnostics, and auto services.'
    },
    values: {
      'pt-BR': {
        empresa:
          'Somos uma oficina automotiva em {{cidade}} focada em transparência no diagnóstico, agilidade e segurança do cliente.',
        servicos:
          '- Revisão preventiva\n- Diagnóstico elétrico\n- Freios e suspensão\n- Troca de óleo e filtros\n- Manutenção geral',
        horarios: 'Segunda a sexta: 08:00 às 18:00\nSábado: 08:00 às 12:00',
        valores:
          'Orçamento final depende do diagnóstico. Informe que avaliação técnica é feita antes da confirmação de valor.',
        orientacoesGerais:
          'Pergunte modelo/ano do veículo e sintoma principal.\nConduza para agendamento de avaliação técnica ou revisão.',
        orientacoesFollowUp:
          'Retome sintoma citado e ofereça horário para diagnóstico com prazo curto.',
        instrucoesSugestoesLeadsClientes:
          'Interesse em levar veículo: em_processo.\nSem resposta: aumentar intervalo entre contatos.\nRecusa: inativo.'
      },
      en: {
        empresa:
          'We are an auto repair shop in {{cidade}} focused on transparent diagnostics, speed, and customer safety.',
        servicos:
          '- Preventive inspection\n- Electrical diagnostics\n- Brakes and suspension\n- Oil and filter changes\n- General maintenance',
        horarios: 'Monday to Friday: 08:00 to 18:00\nSaturday: 08:00 to 12:00',
        valores:
          'Final pricing depends on the diagnosis. Explain that a technical inspection happens before the final quote is confirmed.',
        orientacoesGerais:
          'Ask for the vehicle make/year and the main symptom.\nGuide the lead toward booking a technical assessment or service appointment.',
        orientacoesFollowUp:
          'Bring back the symptom mentioned and offer a near-term slot for diagnostics.',
        instrucoesSugestoesLeadsClientes:
          'Interest in bringing the vehicle in: in_progress.\nNo response: increase the spacing between contacts.\nRefusal: inactive.'
      }
    },
    scenarios: [
      {
        id: 'pricing',
        label: { pt: 'Preço', en: 'Pricing' },
        message: {
          pt: 'Quanto custa uma revisão e como vocês passam orçamento?',
          en: 'How much does an inspection cost, and how do you handle quotes?'
        }
      },
      {
        id: 'hours',
        label: { pt: 'Horário', en: 'Hours' },
        message: {
          pt: 'Vocês conseguem me atender hoje no fim da tarde?',
          en: 'Can you fit me in later this afternoon?'
        }
      },
      {
        id: 'qualification',
        label: { pt: 'Qualificação', en: 'Qualification' },
        message: {
          pt: 'Meu carro está fazendo barulho na suspensão. Como funciona a avaliação?',
          en: 'My car is making noise in the suspension. How does the assessment work?'
        }
      },
      {
        id: 'objection',
        label: { pt: 'Objeção', en: 'Objection' },
        message: {
          pt: 'Só quero algo rápido e sem surpresa de preço. Dá para fazer assim?',
          en: 'I only want something quick and without pricing surprises. Can you handle it that way?'
        }
      },
      {
        id: 'handoff',
        label: { pt: 'Humano', en: 'Human handoff' },
        message: {
          pt: 'Quero falar com alguém da oficina antes de levar o carro.',
          en: 'I want to speak with someone from the shop before bringing the car in.'
        }
      }
    ]
  },
  advocacia: {
    label: { pt: 'Advocacia', en: 'Law Firm' },
    description: {
      pt: 'Triagem inicial e agendamento de consulta jurídica.',
      en: 'Initial triage and legal consultation booking.'
    },
    values: {
      'pt-BR': {
        empresa:
          'Somos um escritório de advocacia em {{cidade}} com atendimento consultivo e estratégico para pessoas e empresas.',
        servicos:
          '- Consultoria jurídica\n- Cível\n- Trabalhista\n- Empresarial\n- Contratos e pareceres',
        horarios: 'Segunda a sexta: 09:00 às 18:00',
        valores:
          'Honorários variam conforme complexidade do caso e escopo do atendimento. Sempre alinhar expectativa de consulta inicial.',
        orientacoesGerais:
          'Nunca prometa resultado jurídico.\nFaça triagem inicial objetiva e conduza para consulta com advogado responsável.',
        orientacoesFollowUp:
          'No follow-up, retome o tema jurídico informado e ofereça horários de consulta.',
        instrucoesSugestoesLeadsClientes:
          'Caso com interesse em consulta: em_processo.\nAguardando documentos: aguardando.\nSem resposta recorrente: espaçar e inativar quando apropriado.'
      },
      en: {
        empresa:
          'We are a law firm in {{cidade}} offering consultative and strategic support for individuals and companies.',
        servicos:
          '- Legal advisory\n- Civil law\n- Labor law\n- Corporate law\n- Contracts and legal opinions',
        horarios: 'Monday to Friday: 09:00 to 18:00',
        valores:
          'Fees depend on case complexity and engagement scope. Always align expectations around the initial consultation.',
        orientacoesGerais:
          'Never promise a legal outcome.\nRun an objective first triage and guide the lead toward a consultation with the responsible attorney.',
        orientacoesFollowUp:
          'In follow-up, bring back the legal topic mentioned and offer consultation times.',
        instrucoesSugestoesLeadsClientes:
          'Case with consultation interest: in_progress.\nWaiting for documents: waiting.\nRepeated no response: increase spacing and mark inactive when appropriate.'
      }
    },
    scenarios: [
      {
        id: 'pricing',
        label: { pt: 'Preço', en: 'Pricing' },
        message: {
          pt: 'Como funciona a consulta inicial e os honorários?',
          en: 'How does the initial consultation work, and how do your fees work?'
        }
      },
      {
        id: 'hours',
        label: { pt: 'Horário', en: 'Hours' },
        message: {
          pt: 'Vocês têm horário amanhã pela manhã para consulta?',
          en: 'Do you have a consultation slot tomorrow morning?'
        }
      },
      {
        id: 'qualification',
        label: { pt: 'Qualificação', en: 'Qualification' },
        message: {
          pt: 'Tenho uma dúvida trabalhista e quero entender se vale marcar consulta.',
          en: 'I have a labor-law issue and want to know whether it makes sense to book a consultation.'
        }
      },
      {
        id: 'objection',
        label: { pt: 'Objeção', en: 'Objection' },
        message: {
          pt: 'Ainda não sei se meu caso compensa. Como vocês avaliam isso?',
          en: 'I am still not sure whether my case is worth pursuing. How do you evaluate that?'
        }
      },
      {
        id: 'handoff',
        label: { pt: 'Humano', en: 'Human handoff' },
        message: {
          pt: 'Prefiro falar direto com um advogado.',
          en: 'I would rather speak directly with a lawyer.'
        }
      }
    ]
  }
}

function localizePair(copy: LocalePair, isEn: boolean) {
  return isEn ? copy.en : copy.pt
}

export function getStepLabels(tr: (pt: string, en: string) => string) {
  return [
    tr('Contexto', 'Context'),
    tr('Comportamento', 'Behavior'),
    tr('Laboratório', 'Lab'),
    tr('Conexão', 'Connection'),
    tr('Publicar', 'Publish')
  ] as const
}

export function getPrimaryFields(tr: (pt: string, en: string) => string): StepField[] {
  return [
    { key: 'nomeEmpresa', label: tr('Nome da empresa', 'Company name') },
    { key: 'empresa', label: tr('Contexto da empresa', 'Company context'), textarea: true },
    {
      key: TRAINING_COMMERCIAL_DESCRIPTION_FIELD,
      label: tr('Descrição dos serviços/produtos vendidos', 'Description of sold services/products'),
      textarea: true
    },
    { key: 'horarios', label: tr('Horários', 'Business hours'), textarea: true },
    { key: 'tipoResposta', label: tr('Tom da IA', 'AI tone'), textarea: true }
  ]
}

export function getBehaviorFields(tr: (pt: string, en: string) => string): StepField[] {
  return [
    { key: 'orientacoesGerais', label: tr('Objetivo e comportamento principal', 'Main goal and behavior'), textarea: true },
    { key: 'orientacoesFollowUp', label: tr('Follow-up', 'Follow-up'), textarea: true },
    { key: 'mensagemEncaminharHumano', label: tr('Mensagem de encaminhamento humano', 'Human handoff message'), textarea: true }
  ]
}

export function getReadinessHintLabel(
  field: 'empresa' | 'descricaoServicosProdutosVendidos' | 'orientacoesGerais',
  tr: (pt: string, en: string) => string
) {
  switch (field) {
    case 'empresa':
      return tr('Preencha o contexto da empresa para a IA entender o negócio.', 'Fill in the company context so the AI understands the business.')
    case 'descricaoServicosProdutosVendidos':
      return tr(
        'Descreva os serviços/produtos e a política comercial antes de testar.',
        'Describe your sold services/products and pricing policy before testing.'
      )
    case 'orientacoesGerais':
      return tr('Defina uma orientação geral para o comportamento da IA.', 'Define a general guidance for the AI behavior.')
    default:
      return field
  }
}

export function getLocalizedTemplateView(
  templateId: TrainingVerticalTemplateId | '',
  isEn: boolean
): LocalizedTemplateView | null {
  if (!templateId) return null
  const preset = LOCALIZED_TEMPLATE_PRESETS[templateId]
  if (!preset) return null
  const language: TrainingLanguage = isEn ? 'en' : 'pt-BR'
  return {
    id: templateId,
    label: localizePair(preset.label, isEn),
    description: localizePair(preset.description, isEn),
    values: normalizeTrainingInstructions(preset.values[language]),
    scenarios: preset.scenarios.map((scenario) => ({
      id: scenario.id,
      label: localizePair(scenario.label, isEn),
      message: localizePair(scenario.message, isEn)
    }))
  }
}

export function getDefaultScenarios(isEn: boolean) {
  return DEFAULT_LAB_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    label: localizePair(scenario.label, isEn),
    message: localizePair(scenario.message, isEn)
  }))
}

export function localizeDraftDefaults(
  training: Record<string, unknown>,
  targetLanguage: TrainingLanguage
): Record<string, unknown> {
  const current = normalizeTrainingInstructions(training)
  const sourceDefaults = normalizeTrainingInstructions({
    language: targetLanguage === 'en' ? 'pt-BR' : 'en'
  })
  const targetDefaults = normalizeTrainingInstructions({ language: targetLanguage })
  const next: Record<string, unknown> = { ...current, language: targetLanguage }

  for (const field of LANGUAGE_SENSITIVE_FIELDS) {
    const currentValue = typeof current[field] === 'string' ? current[field] : ''
    if (!currentValue.trim() || currentValue === sourceDefaults[field]) {
      next[field] = targetDefaults[field]
    }
  }

  return next
}

export function translateOnboardingError(errorCode: string, tr: (pt: string, en: string) => string) {
  const code = errorCode.trim()
  if (!code) return tr('Falha inesperada no onboarding.', 'Unexpected onboarding failure.')
  if (code.startsWith('request_failed_')) {
    return tr('Falha de comunicação com o servidor de onboarding.', 'Failed to communicate with the onboarding server.')
  }

  const messages: Record<string, string> = {
    auth_unavailable: tr('Sua sessão expirou. Entre novamente para continuar.', 'Your session expired. Sign in again to continue.'),
    backend_url_missing: tr('A URL do backend não está configurada.', 'The backend URL is not configured.'),
    backend_admin_key_missing: tr('A chave administrativa do backend não está configurada.', 'The backend admin key is not configured.'),
    draft_not_ready: tr(
      'Complete empresa, descrição comercial e orientação geral antes de testar a IA.',
      'Complete company context, commercial description, and general guidance before testing the AI.'
    ),
    guided_test_unavailable: tr('O laboratório guiado está indisponível no momento.', 'The guided lab is currently unavailable.'),
    guided_test_session_required: tr('Inicie uma sessão de teste antes de enviar mensagens.', 'Start a test session before sending messages.'),
    guided_test_session_not_found: tr('A sessão de teste não foi encontrada. Reinicie o laboratório.', 'The test session was not found. Restart the lab.'),
    userMessage_required: tr('Digite uma mensagem para testar a IA.', 'Enter a message to test the AI.'),
    requestText_required: tr('Descreva a mudança que você quer no comportamento da IA.', 'Describe the behavior change you want from the AI.'),
    proposal_not_generated: tr('Não foi possível gerar a proposta de mudança.', 'Could not generate the change proposal.'),
    proposal_patch_required: tr('A proposta retornou sem alterações aplicáveis.', 'The proposal returned without any applicable changes.'),
    draft_version_conflict: tr('Seu rascunho mudou em outra aba. Recarregue a página para continuar.', 'Your draft changed in another tab. Reload the page to continue.'),
    training_copilot_unavailable: tr('O copiloto de treinamento está indisponível no momento.', 'The training copilot is currently unavailable.'),
    ai_config_store_unavailable: tr('A publicação da IA está indisponível no momento.', 'AI publishing is currently unavailable.'),
    unauthorized: tr('Sua sessão não foi autorizada. Entre novamente.', 'Your session is not authorized. Sign in again.'),
    not_found: tr('O recurso solicitado não foi encontrado.', 'The requested resource was not found.'),
    onboarding_draft_get_failed: tr('Falha ao carregar o rascunho do onboarding.', 'Failed to load the onboarding draft.'),
    onboarding_draft_update_failed: tr('Falha ao salvar o rascunho do onboarding.', 'Failed to save the onboarding draft.'),
    onboarding_guided_test_session_failed: tr('Falha ao iniciar o laboratório guiado.', 'Failed to start the guided lab.'),
    onboarding_guided_test_message_failed: tr('Falha ao enviar a mensagem no laboratório.', 'Failed to send the message in the lab.'),
    onboarding_guided_test_change_request_failed: tr('Falha ao solicitar a mudança de comportamento.', 'Failed to request the behavior change.'),
    onboarding_guided_test_change_apply_failed: tr('Falha ao aplicar a mudança no rascunho.', 'Failed to apply the change to the draft.'),
    onboarding_publish_failed: tr('Falha ao publicar o onboarding.', 'Failed to publish the onboarding.')
  }

  return messages[code] ?? code
}

function normalizeWhatsAppPreviewText(value: string): string {
  let result = value.replace(/\r\n/g, '\n')
  let previous = ''
  while (result !== previous) {
    previous = result
    result = result
      .replace(/\*\*\*([^*\n][^*\n]*?)\*\*\*/g, '*$1*')
      .replace(/\*\*([^*\n][^*\n]*?)\*\*/g, '*$1*')
  }
  return result.trim()
}

function renderWhatsAppPreviewLine(line: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /\*([^*\n][^*\n]*?)\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index))
    }
    nodes.push(
      <strong key={`${match.index}-${match[1]}`} className="font-semibold text-white">
        {match[1]}
      </strong>
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : [line]
}

export function WhatsAppPreviewText(props: { text: string }) {
  const normalized = normalizeWhatsAppPreviewText(props.text)
  const lines = normalized.split('\n')

  return (
    <span className="break-words leading-relaxed">
      {lines.map((line, index) => (
        <Fragment key={`${line}-${index}`}>
          {renderWhatsAppPreviewLine(line)}
          {index < lines.length - 1 ? <br /> : null}
        </Fragment>
      ))}
    </span>
  )
}

export function HiddenOnboardingFlow() {
  const { user } = useAuth()
  const { locale, toRoute } = useI18n()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const targetLanguage: TrainingLanguage = isEn ? 'en' : 'pt-BR'
  const stepLabels = getStepLabels(tr)
  const primaryFields = getPrimaryFields(tr)
  const behaviorFields = getBehaviorFields(tr)
  const wizardEnabled = isOnboardingWizardEnabled()
  const guidedEnabled = isOnboardingGuidedTestEnabled()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draftPayload, setDraftPayload] = useState<OnboardingDraftPayload | null>(null)
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null)
  const [draftTraining, setDraftTraining] = useState<Record<string, unknown>>({})
  const [selectedTemplateId, setSelectedTemplateId] = useState<TrainingVerticalTemplateId | ''>('')
  const [activeStep, setActiveStep] = useState(1)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [guidedInput, setGuidedInput] = useState('')
  const [guidedBusy, setGuidedBusy] = useState(false)
  const [sessionBusy, setSessionBusy] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [changeOpen, setChangeOpen] = useState(false)
  const [changeText, setChangeText] = useState('')
  const [changeBusy, setChangeBusy] = useState(false)
  const [proposal, setProposal] = useState<OnboardingGuidedTestChangeProposal | null>(null)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [enableAiOnPublish, setEnableAiOnPublish] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<OnboardingPublishResult | null>(null)

  const hydratingRef = useRef(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef('')

  const formatCurrency = useCallback(
    (value: number) =>
      new Intl.NumberFormat(isEn ? 'en-US' : 'pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(value),
    [isEn]
  )

  const fetchWithAuth = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!auth?.currentUser) throw new Error('auth_unavailable')
    const token = await auth.currentUser.getIdToken()
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${token}`
      },
      cache: 'no-store'
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(payload?.error ? String(payload.error) : `request_failed_${response.status}`)
    }
    return payload as T
  }, [])

  const hydrate = useCallback((payload: OnboardingDraftPayload) => {
    hydratingRef.current = true
    setDraftPayload(payload)
    setDraftTraining(payload.draft.training ?? {})
    setSelectedTemplateId((payload.selectedTemplateId ?? '') as TrainingVerticalTemplateId | '')
    setActiveStep(payload.currentStep)
    lastSavedRef.current = JSON.stringify({
      selectedTemplateId: payload.selectedTemplateId ?? '',
      training: payload.draft.training ?? {}
    })
    setTimeout(() => {
      hydratingRef.current = false
    }, 0)
  }, [])

  const loadContext = useCallback(async () => {
    if (!user?.uid) return
    setLoading(true)
    setError(null)
    try {
      const [draft, onboarding] = await Promise.all([
        fetchWithAuth<DraftResponse>('/api/onboarding/draft'),
        fetchWithAuth<StateResponse>('/api/onboarding/state')
      ])
      hydrate(draft)
      setOnboardingState(onboarding.state ?? null)
      setEnableAiOnPublish(onboarding.state?.milestones.whatsapp_connected.reached === true)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? translateOnboardingError(loadError.message, tr)
          : tr('Erro ao carregar onboarding', 'Failed to load onboarding')
      )
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, hydrate, tr, user?.uid])

  useEffect(() => {
    if (wizardEnabled) void loadContext()
  }, [loadContext, wizardEnabled])

  const persistDraft = useCallback(
    async (opts?: { step?: number; force?: boolean; templateId?: string | null }) => {
      if (!draftPayload) return
      const snapshot = JSON.stringify({
        selectedTemplateId: opts?.templateId ?? selectedTemplateId,
        training: draftTraining
      })
      if (!opts?.force && snapshot === lastSavedRef.current) return
      setSaveStatus('saving')
      try {
        const payload = await fetchWithAuth<DraftResponse>('/api/onboarding/draft', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: draftPayload.draft.version,
            currentStep: opts?.step ?? activeStep,
            selectedTemplateId: (opts?.templateId ?? selectedTemplateId) || null,
            trainingPatch: draftTraining
          })
        })
      setDraftPayload(payload)
      setActiveStep(payload.currentStep)
      lastSavedRef.current = snapshot
      setSaveStatus('saved')
    } catch (saveError) {
      setSaveStatus('error')
      setError(
        saveError instanceof Error
          ? translateOnboardingError(saveError.message, tr)
          : tr('Falha ao salvar rascunho', 'Failed to save draft')
      )
    }
  },
    [activeStep, draftPayload, draftTraining, fetchWithAuth, selectedTemplateId, tr]
  )

  useEffect(() => {
    if (!draftPayload || hydratingRef.current) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => void persistDraft(), 700)
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [draftPayload, draftTraining, persistDraft, selectedTemplateId])

  useEffect(() => {
    if (!draftPayload) return
    setDraftTraining((current) => {
      const localized = localizeDraftDefaults(current, targetLanguage)
      return JSON.stringify(localized) === JSON.stringify(current) ? current : localized
    })
  }, [draftPayload, targetLanguage])

  const moveToStep = useCallback(async (step: number) => {
    setActiveStep(step)
    await persistDraft({ step, force: true })
  }, [persistDraft])

  const selectedTemplate = getLocalizedTemplateView(selectedTemplateId, isEn)
  const templateOptions = TRAINING_VERTICAL_TEMPLATES.map((template) => ({
    id: template.id,
    label: getLocalizedTemplateView(template.id, isEn)?.label ?? template.label
  }))
  const currentSession = draftPayload?.guidedTestSession ?? null
  const lastUserMessage = [...(currentSession?.transcript ?? [])].reverse().find((entry) => entry.role === 'user')?.text ?? ''
  const creditsBlocked = (draftPayload?.credits?.balanceBrl ?? 0) <= 0
  const trainingScore = draftPayload?.readiness.score ?? onboardingState?.trainingScore ?? 0
  const whatsappConnected = onboardingState?.milestones.whatsapp_connected.reached === true
  const readinessHints = (draftPayload?.readiness.hints ?? []).map((hint) => ({
    ...hint,
    label: getReadinessHintLabel(hint.field, tr)
  }))
  const scenarios = selectedTemplate?.scenarios ?? getDefaultScenarios(isEn)

  const applyTemplate = useCallback(async () => {
    if (!selectedTemplate) return
    setDraftTraining((current) => ({
      ...current,
      nomeEmpresa: current.nomeEmpresa || selectedTemplate.label,
      language: targetLanguage,
      empresa: selectedTemplate.values.empresa,
      [TRAINING_COMMERCIAL_DESCRIPTION_FIELD]:
        selectedTemplate.values.descricaoServicosProdutosVendidos,
      horarios: selectedTemplate.values.horarios,
      orientacoesGerais: selectedTemplate.values.orientacoesGerais,
      orientacoesFollowUp: selectedTemplate.values.orientacoesFollowUp,
      instrucoesSugestoesLeadsClientes: selectedTemplate.values.instrucoesSugestoesLeadsClientes
    }))
    await persistDraft({ force: true, templateId: selectedTemplateId })
  }, [persistDraft, selectedTemplate, selectedTemplateId, targetLanguage])

  const openSession = useCallback(async (action: 'restart' | 'clear' = 'restart') => {
    setSessionBusy(true)
    try {
      const payload = await fetchWithAuth<DraftResponse>('/api/onboarding/guided-test/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action })
      })
      hydrate(payload)
      setProposal(null)
    } catch (sessionError) {
      setError(
        sessionError instanceof Error
          ? translateOnboardingError(sessionError.message, tr)
          : tr('Falha ao iniciar laboratório', 'Failed to start lab')
      )
    } finally {
      setSessionBusy(false)
    }
  }, [fetchWithAuth, hydrate, tr])

  const sendMessage = useCallback(async (message: string) => {
    const safeMessage = message.trim()
    if (!safeMessage) return
    setGuidedBusy(true)
    try {
      let sessionId = currentSession?.id ?? null
      if (!sessionId) {
        const created = await fetchWithAuth<DraftResponse>('/api/onboarding/guided-test/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'restart' })
        })
        hydrate(created)
        sessionId = created.guidedTestSession?.id ?? null
      }
      const result = await fetchWithAuth<GuidedMessageResponse>('/api/onboarding/guided-test/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          testSessionId: sessionId,
          draftSnapshot: { version: draftPayload?.draft.version, training: draftTraining },
          userMessage: safeMessage
        })
      })
      setDraftPayload((current) => {
        const activeSession = current?.guidedTestSession
        return current && activeSession
          ? {
              ...current,
              readiness: result.readiness,
              credits: current.credits ? { ...current.credits, balanceBrl: result.remainingCredits } : current.credits,
              guidedTestSession: {
                ...activeSession,
                transcript: [
                  ...activeSession.transcript,
                  { role: 'user', text: safeMessage },
                  ...result.assistantParts.map((text) => ({ role: 'assistant' as const, text }))
                ],
                updatedAtMs: Date.now()
              }
            }
            : current
      })
      setGuidedInput('')
      setProposal(null)
    } catch (messageError) {
      setError(
        messageError instanceof Error
          ? translateOnboardingError(messageError.message, tr)
          : tr('Falha no laboratório', 'Lab failed')
      )
    } finally {
      setGuidedBusy(false)
    }
  }, [currentSession, draftPayload?.draft.version, draftTraining, fetchWithAuth, hydrate, tr])

  const requestChange = useCallback(async () => {
    if (!changeText.trim()) return
    setChangeBusy(true)
    try {
      const result = await fetchWithAuth<GuidedChangeResponse>('/api/onboarding/guided-test/change-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          testSessionId: currentSession?.id ?? null,
          requestText: changeText,
          draftSnapshot: { version: draftPayload?.draft.version, training: draftTraining },
          transcript: currentSession?.transcript ?? []
        })
      })
      setProposal(result.proposal ?? null)
      setChangeText('')
      setChangeOpen(false)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? translateOnboardingError(requestError.message, tr)
          : tr('Falha ao solicitar mudança', 'Failed to request change')
      )
    } finally {
      setChangeBusy(false)
    }
  }, [changeText, currentSession?.id, currentSession?.transcript, draftPayload?.draft.version, draftTraining, fetchWithAuth, tr])

  const applyProposal = useCallback(async () => {
    if (!proposal || !draftPayload) return
    setChangeBusy(true)
    try {
      const payload = await fetchWithAuth<DraftResponse>('/api/onboarding/guided-test/change-apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: draftPayload.draft.version,
          proposal
        })
      })
      hydrate(payload)
      setProposal(null)
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? translateOnboardingError(applyError.message, tr)
          : tr('Falha ao aplicar mudança', 'Failed to apply change')
      )
    } finally {
      setChangeBusy(false)
    }
  }, [draftPayload, fetchWithAuth, hydrate, proposal, tr])

  const publish = useCallback(async () => {
    if (!draftPayload || !confirmPublish) return
    setPublishing(true)
    try {
      const result = await fetchWithAuth<PublishResponse>('/api/onboarding/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: draftPayload.draft.version,
          enableAi: enableAiOnPublish
        })
      })
      setPublishResult(result)
      await loadContext()
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? translateOnboardingError(publishError.message, tr)
          : tr('Falha ao publicar onboarding', 'Failed to publish onboarding')
      )
    } finally {
      setPublishing(false)
    }
  }, [confirmPublish, draftPayload, enableAiOnPublish, fetchWithAuth, loadContext, tr])

  const handleConnected = useCallback(async () => {
    await emitOnboardingEventSafe({ eventName: 'onboarding_connect_completed', sessionId: user?.uid })
    await loadContext()
  }, [loadContext, user?.uid])

  if (!wizardEnabled) {
    return <div className="rounded-2xl border border-surface-lighter bg-surface-light p-6 text-sm text-gray-300">{tr('Onboarding oculto desativado.', 'Hidden onboarding is disabled.')}</div>
  }
  if (loading || !draftPayload) {
    return <div className="flex items-center gap-2 text-gray-300"><Loader2 className="h-4 w-4 animate-spin" />{tr('Carregando onboarding...', 'Loading onboarding...')}</div>
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div className="overflow-hidden rounded-[32px] border border-surface-lighter bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.16),transparent_38%),linear-gradient(135deg,rgba(17,24,39,0.96),rgba(12,18,29,0.98))] p-7">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary"><Sparkles className="h-3.5 w-3.5" />{tr('Onboarding oculto', 'Hidden onboarding')}</div>
            <h1 className="mt-4 text-3xl font-semibold text-white">{tr('Configure, teste e publique sua IA em um único fluxo', 'Configure, test, and publish your AI in one flow')}</h1>
            <p className="mt-2 text-sm text-gray-300">{tr('A ideia aqui é sair do cadastro com uma IA convincente, testada em um chat fictício e pronta para publicar.', 'The idea here is to leave signup with a convincing AI, tested in a fictitious chat and ready to publish.')}</p>
          </div>
          <div className="min-w-[240px] rounded-[24px] border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-400">{tr('Autosave', 'Autosave')}</p>
            <p className="mt-2 text-sm text-white">{saveStatus === 'saving' ? tr('Salvando...', 'Saving...') : saveStatus === 'saved' ? tr('Rascunho salvo', 'Draft saved') : saveStatus === 'error' ? tr('Falha ao salvar', 'Save failed') : tr('Pronto', 'Ready')}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-lighter"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(activeStep / stepLabels.length) * 100}%` }} /></div>
            <p className="mt-2 text-xs text-gray-400">{tr('Score atual', 'Current score')}: {trainingScore.toFixed(1)} · {tr('Etapa', 'Step')} {activeStep}/5</p>
          </div>
        </div>
      </div>
      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-surface-lighter bg-surface-light p-4">
          {stepLabels.map((label, index) => {
            const step = index + 1
            const current = activeStep === step
            const done = activeStep > step
            return (
              <button key={label} type="button" onClick={() => setActiveStep(step)} className={cn('mb-2 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition', current ? 'bg-primary/10 text-white ring-1 ring-primary/30' : 'text-gray-300 hover:bg-surface')}>
                {done ? <CheckCircle2 className="h-4 w-4 text-primary" /> : current ? <Circle className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-gray-500" />}
                <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-gray-400">{tr('Passo', 'Step')} {step}</p></div>
                <ChevronRight className="ml-auto h-4 w-4 text-gray-500" />
              </button>
            )
          })}
        </aside>
        <section className="space-y-6">
          {activeStep === 1 ? <StepContext tr={tr} selectedTemplateId={selectedTemplateId} selectedTemplate={selectedTemplate} templateOptions={templateOptions} primaryFields={primaryFields} setSelectedTemplateId={setSelectedTemplateId} applyTemplate={applyTemplate} draftTraining={draftTraining} setDraftTraining={setDraftTraining} onContinue={() => void moveToStep(2)} persistNow={() => void persistDraft({ force: true })} /> : null}
          {activeStep === 2 ? <StepBehavior tr={tr} behaviorFields={behaviorFields} draftTraining={draftTraining} setDraftTraining={setDraftTraining} showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced} onBack={() => setActiveStep(1)} onContinue={() => void moveToStep(3)} /> : null}
          {activeStep === 3 ? <StepLab tr={tr} formatCurrency={formatCurrency} readinessHints={readinessHints} draftPayload={draftPayload} draftTraining={draftTraining} setDraftTraining={setDraftTraining} currentSession={currentSession} lastUserMessage={lastUserMessage} scenarios={scenarios} guidedEnabled={guidedEnabled} guidedInput={guidedInput} setGuidedInput={setGuidedInput} guidedBusy={guidedBusy} sessionBusy={sessionBusy} creditsBlocked={creditsBlocked} proposal={proposal} changeOpen={changeOpen} setChangeOpen={setChangeOpen} changeText={changeText} setChangeText={setChangeText} changeBusy={changeBusy} openSession={() => void openSession('restart')} clearSession={() => void openSession('clear')} sendMessage={sendMessage} requestChange={() => void requestChange()} applyProposal={() => void applyProposal()} onContinue={() => void moveToStep(4)} /> : null}
          {activeStep === 4 ? <div className="space-y-6"><EmbeddedWhatsappConnection sessionId={user?.uid ?? ''} isConnected={whatsappConnected} onConnected={() => void handleConnected()} tr={tr} /><div className="flex gap-3"><Button variant="outline" onClick={() => setActiveStep(3)}>{tr('Voltar ao laboratório', 'Back to lab')}</Button><Button onClick={() => void moveToStep(5)}>{whatsappConnected ? tr('Ir para publicar', 'Go to publish') : tr('Continuar sem conectar agora', 'Continue without connecting')}</Button></div></div> : null}
          {activeStep === 5 ? <StepPublish tr={tr} toRoute={toRoute} draftTraining={draftTraining} selectedTemplateLabel={selectedTemplate?.label ?? tr('Sem template', 'No template')} trainingScore={trainingScore} whatsappConnected={whatsappConnected} confirmPublish={confirmPublish} setConfirmPublish={setConfirmPublish} enableAiOnPublish={enableAiOnPublish} setEnableAiOnPublish={setEnableAiOnPublish} publishing={publishing} publishResult={publishResult} onBack={() => setActiveStep(4)} onPublish={() => void publish()} /> : null}
        </section>
      </div>
    </div>
  )
}

function StepContext(props: {
  tr: (pt: string, en: string) => string
  selectedTemplateId: TrainingVerticalTemplateId | ''
  selectedTemplate: LocalizedTemplateView | null
  templateOptions: Array<{ id: TrainingVerticalTemplateId; label: string }>
  primaryFields: StepField[]
  setSelectedTemplateId: (value: TrainingVerticalTemplateId | '') => void
  applyTemplate: () => Promise<void>
  draftTraining: Record<string, unknown>
  setDraftTraining: Dispatch<SetStateAction<Record<string, unknown>>>
  onContinue: () => void
  persistNow: () => void
}) {
  return (
    <div className="rounded-[28px] border border-surface-lighter bg-surface-light p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-white">{props.tr('Contexto da empresa', 'Company context')}</h2>
        <p className="mt-1 text-sm text-gray-400">{props.tr('Escolha um template para acelerar e depois ajuste os blocos essenciais.', 'Choose a template to accelerate the setup, then refine the essential blocks.')}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-surface-lighter bg-surface p-4">
          <label className="mb-2 block text-sm text-gray-300">{props.tr('Template inicial', 'Starting template')}</label>
          <select className="w-full rounded-xl border border-surface-lighter bg-surface-light px-3 py-2 text-sm text-white" value={props.selectedTemplateId} onChange={(event) => props.setSelectedTemplateId(event.target.value as TrainingVerticalTemplateId | '')}>
            <option value="">{props.tr('Selecione um nicho', 'Select a business type')}</option>
            {props.templateOptions.map((template) => (
              <option key={template.id} value={template.id}>{template.label}</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gray-400">{props.selectedTemplate?.description ?? props.tr('Escolha um nicho para aplicar um ponto de partida.', 'Choose a business type to apply a starting point.')}</p>
          <Button className="mt-4 w-full" variant="outline" onClick={() => void props.applyTemplate()} disabled={!props.selectedTemplateId}>
            {props.tr('Aplicar template', 'Apply template')}
          </Button>
        </div>
        <div className="rounded-2xl border border-surface-lighter bg-surface p-4">
          <p className="text-sm text-white">{props.tr('Pronto para testar sem dois números', 'Ready to test without two numbers')}</p>
          <p className="mt-2 text-sm text-gray-400">{props.tr('O laboratório da etapa 3 usa a IA real com esse rascunho. Quanto melhor este contexto estiver, melhor o teste vai ficar.', 'The lab in step 3 uses the real AI with this draft. The better this context is, the better the test will be.')}</p>
        </div>
      </div>
      <div className="mt-6 grid gap-4">
        {props.primaryFields.map((field) => (
          <div key={field.key}>
            <label className="mb-2 block text-sm font-medium text-gray-200">{field.label}</label>
            {field.textarea ? (
              <Textarea rows={field.key === 'empresa' ? 4 : 3} value={String(props.draftTraining[field.key] ?? '')} onChange={(event) => props.setDraftTraining((current) => ({ ...current, [field.key]: event.target.value }))} />
            ) : (
              <Input value={String(props.draftTraining[field.key] ?? '')} onChange={(event) => props.setDraftTraining((current) => ({ ...current, [field.key]: event.target.value }))} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={props.onContinue}>{props.tr('Continuar para comportamento', 'Continue to behavior')}</Button>
        <Button variant="ghost" onClick={props.persistNow}>{props.tr('Salvar agora', 'Save now')}</Button>
      </div>
    </div>
  )
}

function StepBehavior(props: {
  tr: (pt: string, en: string) => string
  behaviorFields: StepField[]
  draftTraining: Record<string, unknown>
  setDraftTraining: Dispatch<SetStateAction<Record<string, unknown>>>
  showAdvanced: boolean
  setShowAdvanced: Dispatch<SetStateAction<boolean>>
  onBack: () => void
  onContinue: () => void
}) {
  return (
    <div className="rounded-[28px] border border-surface-lighter bg-surface-light p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-white">{props.tr('Comportamento essencial', 'Essential behavior')}</h2>
        <p className="mt-1 text-sm text-gray-400">{props.tr('Revise só o que mais mexe na primeira resposta. O resto pode ficar recolhido por enquanto.', 'Review only what most affects the first reply. Everything else can stay collapsed for now.')}</p>
      </div>
      <div className="grid gap-4">
        {props.behaviorFields.map((field) => (
          <div key={field.key}>
            <label className="mb-2 block text-sm font-medium text-gray-200">{field.label}</label>
            <Textarea rows={field.key === 'orientacoesGerais' ? 6 : 4} value={String(props.draftTraining[field.key] ?? '')} onChange={(event) => props.setDraftTraining((current) => ({ ...current, [field.key]: event.target.value }))} />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <ToggleRow label={props.tr('A IA deve se apresentar como IA', 'The AI should identify itself as AI')} checked={Boolean(props.draftTraining.seApresentarComoIA ?? true)} onCheckedChange={(checked) => props.setDraftTraining((current) => ({ ...current, seApresentarComoIA: checked }))} />
        <ToggleRow label={props.tr('Usar emojis', 'Use emojis')} checked={Boolean(props.draftTraining.usarEmojis ?? true)} onCheckedChange={(checked) => props.setDraftTraining((current) => ({ ...current, usarEmojis: checked }))} />
        <ToggleRow label={props.tr('Quando não souber, encaminhar', 'Hand off when it does not know')} checked={String(props.draftTraining.comportamentoNaoSabe ?? 'encaminhar') === 'encaminhar'} onCheckedChange={(checked) => props.setDraftTraining((current) => ({ ...current, comportamentoNaoSabe: checked ? 'encaminhar' : 'silencio' }))} />
      </div>
      <button type="button" onClick={() => props.setShowAdvanced((current) => !current)} className="mt-6 text-sm font-medium text-primary">
        {props.showAdvanced ? props.tr('Esconder ajustes avançados', 'Hide advanced settings') : props.tr('Abrir ajustes avançados', 'Open advanced settings')}
      </button>
      {props.showAdvanced ? (
        <div className="mt-4 grid gap-4 rounded-2xl border border-surface-lighter bg-surface p-4 md:grid-cols-2">
          <ToggleRow label={props.tr('Permitir IA enviar arquivos', 'Allow AI to send files')} checked={Boolean(props.draftTraining.permitirIAEnviarArquivos)} onCheckedChange={(checked) => props.setDraftTraining((current) => ({ ...current, permitirIAEnviarArquivos: checked }))} />
          <ToggleRow label={props.tr('Permitir IA ouvir áudios', 'Allow AI to listen to audio')} checked={Boolean(props.draftTraining.permitirIAOuvirAudios)} onCheckedChange={(checked) => props.setDraftTraining((current) => ({ ...current, permitirIAOuvirAudios: checked }))} />
          <ToggleRow label={props.tr('Permitir IA ler imagens/PDFs', 'Allow AI to read images/PDFs')} checked={Boolean(props.draftTraining.permitirIALerImagensEPdfs)} onCheckedChange={(checked) => props.setDraftTraining((current) => ({ ...current, permitirIALerImagensEPdfs: checked }))} />
          <ToggleRow label={props.tr('Permitir sugestões no CRM', 'Allow CRM suggestions')} checked={Boolean(props.draftTraining.permitirSugestoesCamposLeadsClientes)} onCheckedChange={(checked) => props.setDraftTraining((current) => ({ ...current, permitirSugestoesCamposLeadsClientes: checked }))} />
        </div>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="outline" onClick={props.onBack}>{props.tr('Voltar', 'Back')}</Button>
        <Button onClick={props.onContinue}>{props.tr('Ir para o laboratório', 'Go to the lab')}</Button>
      </div>
    </div>
  )
}

function StepLab(props: {
  tr: (pt: string, en: string) => string
  formatCurrency: (value: number) => string
  readinessHints: Array<{ field: 'empresa' | 'descricaoServicosProdutosVendidos' | 'orientacoesGerais'; label: string; missing: boolean }>
  draftPayload: OnboardingDraftPayload
  draftTraining: Record<string, unknown>
  setDraftTraining: Dispatch<SetStateAction<Record<string, unknown>>>
  currentSession: OnboardingDraftPayload['guidedTestSession']
  lastUserMessage: string
  scenarios: Array<{ id: string; label: string; message: string }>
  guidedEnabled: boolean
  guidedInput: string
  setGuidedInput: Dispatch<SetStateAction<string>>
  guidedBusy: boolean
  sessionBusy: boolean
  creditsBlocked: boolean
  proposal: OnboardingGuidedTestChangeProposal | null
  changeOpen: boolean
  setChangeOpen: Dispatch<SetStateAction<boolean>>
  changeText: string
  setChangeText: Dispatch<SetStateAction<string>>
  changeBusy: boolean
  openSession: () => void
  clearSession: () => void
  sendMessage: (message: string) => Promise<void>
  requestChange: () => void
  applyProposal: () => void
  onContinue: () => void
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="rounded-[28px] border border-surface-lighter bg-surface-light p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-white">{props.tr('Laboratório de IA', 'AI Lab')}</h2>
            <p className="mt-1 text-sm text-gray-400">{props.tr('Chat fictício com IA real. Nada é enviado ao WhatsApp daqui.', 'Fictitious chat with the real AI. Nothing is sent to WhatsApp from here.')}</p>
          </div>
          <div className="rounded-2xl border border-surface-lighter bg-surface px-3 py-2 text-right text-xs text-gray-300">
            <p>{props.tr('Saldo', 'Balance')}</p>
            <p className="mt-1 text-sm font-semibold text-white">{props.formatCurrency(props.draftPayload.credits?.balanceBrl ?? 0)}</p>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-surface-lighter bg-surface p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-400">{props.tr('Prontidão', 'Readiness')}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{props.draftPayload.readiness.score.toFixed(1)}</p>
          <div className="mt-4 space-y-2">
            {props.readinessHints.map((hint) => (
              <div key={hint.field} className={cn('flex items-start gap-2 rounded-xl px-3 py-2 text-sm', hint.missing ? 'bg-amber-500/10 text-amber-200' : 'bg-emerald-500/10 text-emerald-200')}>
                {hint.missing ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{hint.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-6 space-y-4">
          <MiniField label={props.tr('Empresa', 'Company')} value={String(props.draftTraining.empresa ?? '')} onChange={(value) => props.setDraftTraining((current) => ({ ...current, empresa: value }))} />
          <MiniField
            label={props.tr('Descrição comercial', 'Commercial description')}
            value={String(props.draftTraining.descricaoServicosProdutosVendidos ?? '')}
            onChange={(value) =>
              props.setDraftTraining((current) => ({
                ...current,
                descricaoServicosProdutosVendidos: value
              }))
            }
          />
          <MiniField label={props.tr('Orientação geral', 'General guidance')} value={String(props.draftTraining.orientacoesGerais ?? '')} onChange={(value) => props.setDraftTraining((current) => ({ ...current, orientacoesGerais: value }))} />
        </div>
      </div>

      <div className="rounded-[28px] border border-surface-lighter bg-surface-light p-6">
        <div className="flex flex-wrap items-center gap-2">
          {props.scenarios.map((scenario) => (
            <button key={scenario.id} type="button" className="rounded-full border border-surface-lighter px-3 py-1.5 text-xs text-gray-200 transition hover:border-primary/40 hover:text-white" onClick={() => void props.sendMessage(scenario.message)}>
              {scenario.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={props.openSession} disabled={props.sessionBusy}><RotateCcw className="mr-2 h-4 w-4" />{props.tr('Reiniciar chat', 'Restart chat')}</Button>
          <Button variant="outline" onClick={props.clearSession} disabled={!props.currentSession || props.sessionBusy}><RefreshCcw className="mr-2 h-4 w-4" />{props.tr('Limpar conversa', 'Clear conversation')}</Button>
          <Button variant="ghost" onClick={() => (props.lastUserMessage ? void props.sendMessage(props.lastUserMessage) : undefined)} disabled={!props.lastUserMessage || props.guidedBusy}>{props.tr('Reenviar última mensagem', 'Resend last message')}</Button>
          <Button variant="ghost" onClick={() => props.setChangeOpen((current) => !current)} disabled={!props.currentSession}><Wand2 className="mr-2 h-4 w-4" />{props.tr('Solicitar mudança', 'Request change')}</Button>
        </div>

        {props.creditsBlocked ? (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            {props.tr('Seu saldo acabou. Recarregue créditos para continuar testando a IA.', 'Your balance is empty. Recharge credits to keep testing the AI.')}
          </div>
        ) : null}

        <div className="mt-4 min-h-[360px] rounded-[24px] border border-surface-lighter bg-surface p-4">
          <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-gray-400">
            <span>{props.tr('Chat fictício de teste', 'Fictitious test chat')}</span>
            <span>{props.currentSession ? `#${props.currentSession.id.slice(0, 8)}` : props.tr('Sem sessão', 'No session')}</span>
          </div>
          <div className="space-y-3">
            {(props.currentSession?.transcript ?? []).length > 0 ? (
              props.currentSession?.transcript.map((entry, index) => (
                <div
                  key={`${entry.role}-${index}`}
                  className={cn(
                    'max-w-[88%] rounded-2xl px-4 py-3 text-sm',
                    entry.role === 'assistant'
                      ? 'bg-primary/10 text-white'
                      : 'ml-auto bg-surface-lighter text-gray-100'
                  )}
                >
                  {entry.role === 'assistant' ? (
                    <WhatsAppPreviewText text={entry.text} />
                  ) : (
                    <span className="break-words whitespace-pre-wrap leading-relaxed">{entry.text}</span>
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-surface-lighter p-6 text-sm text-gray-400">
                {props.tr('Comece por um cenário sugerido ou escreva uma mensagem livre para ver a IA responder aqui.', 'Start with a suggested scenario or write a free-form message to see the AI answer here.')}
              </div>
            )}
          </div>
        </div>

        {props.changeOpen ? (
          <div className="mt-4 rounded-2xl border border-surface-lighter bg-surface p-4">
            <label className="mb-2 block text-sm font-medium text-gray-200">{props.tr('O que você quer mudar no comportamento da IA?', 'What do you want to change in the AI behavior?')}</label>
            <Textarea rows={4} value={props.changeText} onChange={(event) => props.setChangeText(event.target.value)} />
            <div className="mt-3 flex gap-3">
              <Button onClick={props.requestChange} disabled={props.changeBusy || !props.changeText.trim()}>{props.changeBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{props.tr('Gerar proposta', 'Generate proposal')}</Button>
              <Button variant="ghost" onClick={() => props.setChangeOpen(false)}>{props.tr('Cancelar', 'Cancel')}</Button>
            </div>
          </div>
        ) : null}

        {props.proposal ? (
          <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-semibold text-white">{props.proposal.summary}</p>
            {props.proposal.rationale ? <p className="mt-2 text-sm text-gray-300">{props.proposal.rationale}</p> : null}
            <div className="mt-4 space-y-2">
              {props.proposal.preview.map((item) => (
                <div key={item.field} className="rounded-xl border border-surface-lighter bg-surface px-3 py-2 text-sm text-gray-200">
                  <p className="font-medium text-white">{item.field}</p>
                  <p className="mt-1 text-xs text-gray-400">{props.tr('Antes', 'Before')}: {String(item.before ?? '-')}</p>
                  <p className="mt-1 text-xs text-gray-300">{props.tr('Depois', 'After')}: {String(item.after ?? '-')}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-3">
              <Button onClick={props.applyProposal} disabled={props.changeBusy}>{props.changeBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{props.tr('Aplicar no rascunho', 'Apply to draft')}</Button>
              <Button variant="ghost" onClick={() => props.setChangeOpen(false)}>{props.tr('Fechar', 'Close')}</Button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-surface-lighter bg-surface p-4">
          <Textarea rows={3} value={props.guidedInput} onChange={(event) => props.setGuidedInput(event.target.value)} placeholder={props.tr('Digite como se fosse um cliente real...', 'Type as if you were a real customer...')} />
          <div className="mt-3 flex flex-wrap gap-3">
            <Button onClick={() => void props.sendMessage(props.guidedInput)} disabled={props.guidedBusy || props.creditsBlocked || !props.guidedEnabled || !props.guidedInput.trim() || !props.draftPayload.readiness.ready}>{props.guidedBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{props.tr('Enviar para a IA', 'Send to AI')}</Button>
            <Button variant="outline" onClick={props.onContinue}>{props.tr('Continuar para conexão', 'Continue to connection')}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StepPublish(props: {
  tr: (pt: string, en: string) => string
  toRoute: ReturnType<typeof useI18n>['toRoute']
  draftTraining: Record<string, unknown>
  selectedTemplateLabel: string
  trainingScore: number
  whatsappConnected: boolean
  confirmPublish: boolean
  setConfirmPublish: Dispatch<SetStateAction<boolean>>
  enableAiOnPublish: boolean
  setEnableAiOnPublish: Dispatch<SetStateAction<boolean>>
  publishing: boolean
  publishResult: OnboardingPublishResult | null
  onBack: () => void
  onPublish: () => void
}) {
  return (
    <div className="rounded-[28px] border border-surface-lighter bg-surface-light p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-white">{props.tr('Revisão final e publicação', 'Final review and publish')}</h2>
        <p className="mt-1 text-sm text-gray-400">{props.tr('Este é o momento de copiar o rascunho para a configuração real da IA.', 'This is the moment to copy the draft into the real AI configuration.')}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label={props.tr('Template', 'Template')} value={props.selectedTemplateLabel} />
        <SummaryCard label={props.tr('Prontidão', 'Readiness')} value={props.trainingScore.toFixed(1)} />
        <SummaryCard label={props.tr('WhatsApp', 'WhatsApp')} value={props.whatsappConnected ? props.tr('Conectado', 'Connected') : props.tr('Conexão pendente', 'Connection pending')} />
      </div>
      <div className="mt-6 rounded-2xl border border-surface-lighter bg-surface p-4">
        <p className="text-sm font-medium text-white">{props.tr('O que será publicado', 'What will be published')}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <SummaryText label={props.tr('Empresa', 'Company')} value={String(props.draftTraining.empresa ?? '-')} />
          <SummaryText
            label={props.tr('Descrição comercial', 'Commercial description')}
            value={String(props.draftTraining.descricaoServicosProdutosVendidos ?? '-')}
          />
          <SummaryText label={props.tr('Horários', 'Business hours')} value={String(props.draftTraining.horarios ?? '-')} />
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <ToggleRow label={props.tr('Ativar IA assim que publicar', 'Enable AI immediately after publishing')} checked={props.enableAiOnPublish} onCheckedChange={props.setEnableAiOnPublish} />
        <ToggleRow label={props.tr('Confirmo que revisei o rascunho final', 'I confirm that I reviewed the final draft')} checked={props.confirmPublish} onCheckedChange={props.setConfirmPublish} />
      </div>
      {props.publishResult ? (
        <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <p className="font-semibold">{props.tr('Publicação concluída.', 'Publishing completed.')}</p>
          <p className="mt-1">
            {props.publishResult.status === 'pending_connection'
              ? props.tr('O treinamento já foi publicado, mas a ativação final depende de conectar o WhatsApp.', 'The training is already published, but final activation depends on connecting WhatsApp.')
              : props.publishResult.status === 'activated'
                ? props.tr('A IA já foi publicada e ativada.', 'The AI has already been published and activated.')
                : props.tr('A IA foi publicada. Você pode ativá-la depois.', 'The AI has been published. You can activate it later.')}
          </p>
        </div>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="outline" onClick={props.onBack}>{props.tr('Voltar', 'Back')}</Button>
        <Button onClick={props.onPublish} disabled={props.publishing || !props.confirmPublish}>{props.publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{props.tr('Publicar onboarding', 'Publish onboarding')}</Button>
        <Link href={props.toRoute('conversations')} className="inline-flex items-center rounded-lg border border-surface-lighter px-4 py-2 text-sm text-gray-200">{props.tr('Ir para Conversas', 'Go to Conversations')}</Link>
      </div>
    </div>
  )
}

function ToggleRow(props: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-surface-lighter bg-surface p-4">
      <span className="text-sm text-white">{props.label}</span>
      <Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />
    </div>
  )
}

function MiniField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-200">{props.label}</label>
      <Textarea rows={4} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </div>
  )
}

function SummaryCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-surface-lighter bg-surface p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-400">{props.label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{props.value}</p>
    </div>
  )
}

function SummaryText(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-surface-lighter bg-surface-light p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-400">{props.label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-100">{props.value}</p>
    </div>
  )
}
