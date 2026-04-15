export type UpdateType = 'feature' | 'improvement'

export type LocalizedText<T> = {
  pt: T
  en: T
}

export type UpdateEntry = {
  version: string
  date: LocalizedText<string>
  title: LocalizedText<string>
  description: LocalizedText<string>
  type: UpdateType
  changes: LocalizedText<string[]>
}

export const UPDATES: UpdateEntry[] = [
  {
    version: 'v2.9.0',
    date: { pt: '12 de março de 2026', en: 'March 12, 2026' },
    title: {
      pt: 'Operação bilíngue, follow-up inteligente e onboarding guiado',
      en: 'Bilingual Operations, Smarter Follow-Ups, and Guided Onboarding'
    },
    description: {
      pt: 'Release focada em internacionalização, operação assistida e aquisição: o produto ganhou rotas bilíngues, novos controles para conversas e CRM com IA, além de onboarding guiado e presença pública em inglês.',
      en: 'Release focused on internationalization, assisted operations, and acquisition: the product now ships with bilingual routes, richer conversation and AI CRM controls, plus guided onboarding and a public English presence.'
    },
    type: 'feature',
    changes: {
      pt: [
        'Produto bilíngue com rotas localizadas, dashboard em inglês e mini-site público em PT/EN com updates, guias e páginas institucionais.',
        'Conversas com envio de anexos, respostas rápidas, etiquetas, controle manual de não lido e subcontas com permissões e atribuição por chat.',
        'IA e CRM com copiloto de treinamento, sugestões configuráveis, follow-up automático por próximo contato, delivery guard e bloqueios para evitar envios indevidos.',
        'Onboarding guiado V2, melhorias de signup e atribuição, mais SEO público e imagens sociais estáticas para compartilhamento.'
      ],
      en: [
        'Bilingual product with localized routes, an English dashboard, and a PT/EN public mini-site with updates, guides, and institutional pages.',
        'Conversations now support attachments, quick replies, labels, manual unread controls, and subaccounts with permissions and chat assignment.',
        'AI and CRM gained a training copilot, configurable suggestions, automatic next-contact follow-ups, delivery guard, and stronger protections against unsafe sends.',
        'Guided onboarding V2, improved signup and attribution flows, stronger public SEO, and static social share images for distribution.'
      ]
    }
  },
  {
    version: 'v2.8.0',
    date: { pt: '22 de fevereiro de 2026', en: 'February 22, 2026' },
    title: {
      pt: 'Transmissão robusta, CRM manual e IA multimídia',
      en: 'Robust Broadcasts, Manual CRM, and Multimodal AI'
    },
    description: {
      pt: 'Evolução ampla do produto para operação real: transmissão completa, CRM manual, IA com mais contexto e melhorias administrativas.',
      en: 'A major product evolution for day-to-day operations: complete broadcast tooling, manual CRM flows, richer AI context, and stronger admin controls.'
    },
    type: 'feature',
    changes: {
      pt: [
        'Transmissão completa com listas, importação em massa e histórico por campanha.',
        'Pausar, retomar e cancelar com tela de detalhes e retomada segura.',
        'IA com leitura de imagem/PDF e envio de arquivos/contatos quando habilitado.'
      ],
      en: [
        'Full broadcast module with lists, bulk import, and campaign history.',
        'Pause, resume, and cancel controls with detailed execution view.',
        'AI image/PDF understanding plus file/contact sending when enabled.'
      ]
    }
  },
  {
    version: 'v2.7.0',
    date: { pt: '08 de fevereiro de 2026', en: 'February 8, 2026' },
    title: {
      pt: 'Agenda com IA, áudios beta e integrações',
      en: 'AI Scheduling, Audio Beta, and Integrations'
    },
    description: {
      pt: 'Foco em automação de rotina com agenda reativada, IA criando agendamentos e transcrição de áudio em beta.',
      en: 'Focused on operational automation: scheduling is back, AI can create appointments, and audio transcription is now in beta.'
    },
    type: 'feature',
    changes: {
      pt: [
        'Agenda reativada com visões dia/semana/mês e múltiplas agendas.',
        'IA com ferramentas para listar agenda, checar disponibilidade e criar evento.',
        'Transcrição de áudio com fila dedicada, limites e fallback.'
      ],
      en: [
        'Scheduling module reactivated with day/week/month views and multiple calendars.',
        'AI tools to list calendars, check availability, and create appointments.',
        'Audio transcription with dedicated queue, limits, and fallback behavior.'
      ]
    }
  },
  {
    version: 'v2.6.0',
    date: { pt: '06 de fevereiro de 2026', en: 'February 6, 2026' },
    title: {
      pt: 'Landing V2, tutoriais e arquivos beta',
      en: 'Landing V2, Tutorials, and Files Beta'
    },
    description: {
      pt: 'Atualização orientada a crescimento: nova landing, hub de tutoriais, módulo de arquivos e melhorias de estabilidade.',
      en: 'Growth-oriented release: new landing page, tutorial hub, files module, and backend stability improvements.'
    },
    type: 'feature',
    changes: {
      pt: [
        'Landing V2 com SEO melhorado e bloco de depoimentos.',
        'Módulo de tutoriais com quickstart, filtros e guias visuais.',
        'Módulo de arquivos com upload e uso pela IA.'
      ],
      en: [
        'Landing V2 with SEO upgrades and testimonials section.',
        'Tutorial hub with quickstart, filters, and visual guides.',
        'Files module with upload and AI consumption support.'
      ]
    }
  },
  {
    version: 'v2.5.0',
    date: { pt: '05 de fevereiro de 2026', en: 'February 5, 2026' },
    title: {
      pt: 'Créditos e IA no CRM',
      en: 'Credits and AI in CRM'
    },
    description: {
      pt: 'Nova camada de controle de custo e uso da IA com painel financeiro, créditos e automações no CRM.',
      en: 'New AI cost and usage control layer with financial dashboard, credits system, and CRM automations.'
    },
    type: 'feature',
    changes: {
      pt: [
        'Painel financeiro com consumo de tokens e custo por período.',
        'Sistema de créditos pré-pago com bloqueio automático da IA no saldo zero.',
        'Sugestões de IA em leads/clientes com revisão ou autoaprovação.'
      ],
      en: [
        'Financial panel with token usage and cost by period.',
        'Prepaid credits system with automatic AI block at zero balance.',
        'AI suggestions for leads/clients with review or auto-approval.'
      ]
    }
  },
  {
    version: 'v2.0.0',
    date: { pt: '28 de janeiro de 2026', en: 'January 28, 2026' },
    title: {
      pt: 'V2: backend novo e IA configurável',
      en: 'V2: New Backend and Configurable AI'
    },
    description: {
      pt: 'Nova base com Backend B, migração de dados e controles de IA por contexto.',
      en: 'New platform foundation with Backend B, migrated data, and richer AI context controls.'
    },
    type: 'feature',
    changes: {
      pt: [
        'Backend B com sessão, auto-restore e pipeline com fila.',
        'Conversas, leads e clientes migrados para novas rotas.',
        'Controles de IA por chat, global e por contexto.'
      ],
      en: [
        'Backend B with session auto-restore and queue-based pipeline.',
        'Conversations, leads, and clients migrated to new routes.',
        'AI controls by chat, global mode, and context type.'
      ]
    }
  },
  {
    version: 'v1.7.0',
    date: { pt: '20 de janeiro de 2026', en: 'January 20, 2026' },
    title: {
      pt: 'Estabilidade de backend, admin e pixel Meta',
      en: 'Backend Stability, Admin, and Meta Pixel'
    },
    description: {
      pt: 'Pacote robusto de resiliência para WhatsApp, melhorias admin e rastreamento de aquisição.',
      en: 'Robust resilience package for WhatsApp sessions, admin improvements, and acquisition tracking.'
    },
    type: 'feature',
    changes: {
      pt: [
        'Auto-restauração de sessões com retries e watchdog.',
        'Melhorias do painel admin com novas páginas e fluxos.',
        'Meta Pixel com PageView e eventos de funil.'
      ],
      en: [
        'Session auto-restore with retries and watchdog diagnostics.',
        'Admin panel improvements with new pages and flows.',
        'Meta Pixel pageview and funnel event tracking.'
      ]
    }
  },
  {
    version: 'v1.6.1',
    date: { pt: '17 de janeiro de 2026', en: 'January 17, 2026' },
    title: {
      pt: 'Sessões persistentes no Railway',
      en: 'Persistent Sessions on Railway'
    },
    description: {
      pt: 'Ajustes para manter o WhatsApp conectado em reinícios e deploys.',
      en: 'Adjustments to keep WhatsApp connected across restarts and deploys.'
    },
    type: 'improvement',
    changes: {
      pt: [
        'Persistência de sessão em volume no Railway.',
        'Auto-restauração ao abrir o painel.',
        'Encerramento seguro no deploy sem apagar dados persistidos.'
      ],
      en: [
        'Session persistence on Railway volume storage.',
        'Auto-restore on dashboard open.',
        'Safe deploy shutdown without deleting persisted data.'
      ]
    }
  },
  {
    version: 'v1.6.0',
    date: { pt: '17 de janeiro de 2026', en: 'January 17, 2026' },
    title: {
      pt: 'Admin por usuário e conversas centralizadas',
      en: 'Per-User Admin and Centralized Conversations'
    },
    description: {
      pt: 'Atualização de gestão administrativa por cliente e modularização das conversas.',
      en: 'Admin management by client account and conversation module reuse.'
    },
    type: 'feature',
    changes: {
      pt: [
        'Painel admin com seleção de usuário e abas dedicadas.',
        'Admin com edição de leads/clientes e transferência entre listas.',
        'Aba de conversas reutilizando o mesmo painel de chat.'
      ],
      en: [
        'Admin panel with per-user selection and dedicated tabs.',
        'Lead/client editing plus transfer between lists.',
        'Conversations tab reusing the same chat panel.'
      ]
    }
  },
  {
    version: 'v1.5.0',
    date: { pt: '15 de janeiro de 2026', en: 'January 15, 2026' },
    title: {
      pt: 'Gestão avançada de leads e estabilidade',
      en: 'Advanced Lead Management and Stability'
    },
    description: {
      pt: 'Atualização com foco em funil comercial, IA e resiliência de sessão.',
      en: 'Release focused on commercial pipeline control, AI behavior, and session resilience.'
    },
    type: 'feature',
    changes: {
      pt: [
        'Filtros de leads e transferência automática para clientes por status.',
        'Cooldown inteligente para evitar repetição da IA.',
        'Correção de sessões corrompidas e limpeza automática.'
      ],
      en: [
        'Lead filters and automatic transfer to clients by status.',
        'Smart cooldown to avoid repetitive AI replies.',
        'Corrupted-session fixes and automatic cleanup.'
      ]
    }
  },
  {
    version: 'v1.4.0',
    date: { pt: '12 de janeiro de 2026', en: 'January 12, 2026' },
    title: {
      pt: 'Painel administrativo e configurações',
      en: 'Administrative Panel and Settings'
    },
    description: {
      pt: 'Implementação completa do admin com financeiro e configuração de sistema via Firestore.',
      en: 'Full admin rollout with finance tab and dynamic system settings through Firestore.'
    },
    type: 'feature',
    changes: {
      pt: [
        'Navegação admin independente com novas rotas.',
        'Seção de gestão financeira no dashboard.',
        'Controle dinâmico de debug da IA via Firestore.'
      ],
      en: [
        'Independent admin navigation with dedicated routes.',
        'Financial management section in dashboard.',
        'Dynamic AI debug controls via Firestore.'
      ]
    }
  },
  {
    version: 'v1.3.0',
    date: { pt: '11 de janeiro de 2026', en: 'January 11, 2026' },
    title: {
      pt: 'Integração Gemini e agenda inteligente',
      en: 'Gemini Integration and Smart Scheduling'
    },
    description: {
      pt: 'Entrada do Gemini e sistema de agenda com suporte de IA.',
      en: 'Gemini integration and scheduling system with AI tooling.'
    },
    type: 'feature',
    changes: {
      pt: [
        'Integração oficial com Gemini.',
        'Ferramentas de agenda automática com IA.',
        'Refatoração do SessionManager para performance.'
      ],
      en: [
        'Official Gemini integration.',
        'Automatic scheduling tools for AI workflows.',
        'SessionManager refactor for better performance.'
      ]
    }
  },
  {
    version: 'v1.2.0',
    date: { pt: '09 de janeiro de 2026', en: 'January 9, 2026' },
    title: {
      pt: 'Leads e agenda drag-and-drop',
      en: 'Leads and Drag-and-Drop Scheduling'
    },
    description: {
      pt: 'Novas ferramentas para leads e uma agenda mais fluida para operação.',
      en: 'New lead tools and a smoother scheduling experience.'
    },
    type: 'feature',
    changes: {
      pt: [
        'Identificação e gestão automática de leads no dashboard.',
        'Agenda com arrastar e soltar.',
        'Configurações avançadas de comportamento da IA.'
      ],
      en: [
        'Automatic lead identification and management in dashboard.',
        'Drag-and-drop scheduling interactions.',
        'Advanced AI behavior settings.'
      ]
    }
  },
  {
    version: 'v1.1.0',
    date: { pt: '08 de janeiro de 2026', en: 'January 8, 2026' },
    title: {
      pt: 'Resposta automática com OpenAI e UX',
      en: 'OpenAI Auto-Replies and UX Improvements'
    },
    description: {
      pt: 'Implementação da lógica de resposta automática e ganhos relevantes de experiência.',
      en: 'Core automatic reply logic delivered with significant user experience improvements.'
    },
    type: 'improvement',
    changes: {
      pt: [
        'Motor de resposta automática integrado com OpenAI.',
        'Nova página de treinamento da IA.',
        'Melhorias de performance e estabilidade de sessão.'
      ],
      en: [
        'Automatic reply engine integrated with OpenAI.',
        'New AI training page.',
        'Performance and session stability improvements.'
      ]
    }
  },
  {
    version: 'v1.0.0',
    date: { pt: '07 de janeiro de 2026', en: 'January 7, 2026' },
    title: {
      pt: 'Lançamento e sessões persistentes',
      en: 'Launch and Persistent Sessions'
    },
    description: {
      pt: 'Versão inicial focada em conexão estável e histórico de mensagens.',
      en: 'Initial release focused on stable connection and message history.'
    },
    type: 'feature',
    changes: {
      pt: [
        'Sessões persistentes via Socket.io.',
        'Histórico completo de mensagens e interações.',
        'Base inicial para integração com Firebase.'
      ],
      en: [
        'Persistent sessions through Socket.io.',
        'Full history of messages and interactions.',
        'Foundation for Firebase integration.'
      ]
    }
  }
]
