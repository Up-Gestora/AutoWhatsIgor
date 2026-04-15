import {
  type LucideIcon,
  Brain,
  Calendar,
  CreditCard,
  Megaphone,
  MessageSquare,
  QrCode,
  Rocket,
  SlidersHorizontal,
  UserCheck,
  Users,
} from 'lucide-react'

export const TUTORIAL_TAGS = ['AI', 'Training', 'CRM', 'Billing', 'WhatsApp', 'Conversations', 'Calendar', 'Broadcasts'] as const
export type TutorialTag = (typeof TUTORIAL_TAGS)[number]

export type TutorialBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'steps'; startAt?: number; items: Array<{ title: string; description: string }> }
  | { type: 'links'; title?: string; links: Array<{ label: string; href: string; description?: string }> }
  | { type: 'callout'; variant: 'info' | 'tip' | 'warn'; title: string; text: string }
  | { type: 'image'; src: string; alt: string; caption?: string; size?: 'full' | 'half' }
  | {
      type: 'toggleCards'
      items: Array<{
        title: string
        statusKey?: string
        defaultState: 'on' | 'off' | 'choice'
        description: string
        note?: string
      }>
    }

export type TutorialSection = {
  id: string
  title: string
  blocks: TutorialBlock[]
}

export type TutorialTopic = {
  id: string
  title: string
  description: string
  tags: TutorialTag[]
  icon: LucideIcon
  estimatedMinutes: number
  primaryCta?: { label: string; href: string }
  sections: TutorialSection[]
}

const nextStepLinks = {
  conexoes: { label: 'Open Connections', href: '/en/dashboard/connections' },
  treinamento: { label: 'Open AI Training', href: '/en/dashboard/training' },
  leads: { label: 'Open Leads', href: '/en/dashboard/leads' },
  clientes: { label: 'Open Clients', href: '/en/dashboard/clients' },
  conversas: { label: 'Open Conversations', href: '/en/dashboard/conversations' },
  agenda: { label: 'Open Calendar', href: '/en/dashboard/calendar' },
  transmissao: { label: 'Open Broadcasts', href: '/en/dashboard/broadcasts' },
  billing: { label: 'Open Subscription and credits', href: '/en/dashboard/settings?tab=assinatura_creditos' },
} as const

export const TUTORIAL_TOPICS: TutorialTopic[] = [
  {
    id: 'primeiros-passos',
    title: 'First steps',
    description: 'Connect your WhatsApp to start the operation.',
    tags: ['WhatsApp', 'Training', 'Billing'],
    icon: Rocket,
    estimatedMinutes: 7,
    primaryCta: nextStepLinks.conexoes,
    sections: [
      {
        id: 'conectar-whatsapp-gerar-qr',
        title: 'Generate the QR Code',
        blocks: [
          {
            type: 'steps',
            startAt: 1,
            items: [
              {
                title: 'Open WhatsApp on your cell phone',
                description: 'Use your service\'s main device and confirm that it has stable internet.',
              },
              {
                title: 'Click "Generate QR Code" on the dashboard',
                description: 'On the Connections screen, click the green button to create a new and valid QR.',
              },
              {
                title: 'Leave this screen open',
                description: 'Do not close the page before reading; the QR may expire and you would have to generate another one.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/conexoes-gerar-qrcode-v3.jpg',
            alt: 'Connections screen highlighting the Generate QR Code button.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.conexoes] },
        ],
      },
      {
        id: 'conectar-whatsapp-ler-qr',
        title: 'Read the QR Code on your cell phone',
        blocks: [
          {
            type: 'steps',
            startAt: 3,
            items: [
              {
                title: 'In WhatsApp, open "Connected devices"',
                description: 'In the app menu, go to Connected devices and tap Connect a device.',
              },
              {
                title: 'Point the camera at the QR on the screen',
                description: 'Center the entire code in the frame for immediate reading.',
              },
              {
                title: 'Wait for confirmation',
                description: 'In a few seconds, WhatsApp completes the pairing and releases the panel.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/conexoes-ler-qrcode-v3.jpg',
            alt: 'Connections screen displaying the QR Code for reading on your cell phone.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.conexoes] },
        ],
      },
      {
        id: 'conectar-whatsapp-confirmar',
        title: 'Confirm connection',
        blocks: [
          {
            type: 'steps',
            startAt: 4,
            items: [
              {
                title: 'Check status on dashboard',
                description: 'Confirm the successfully connected message to ensure the session was created.',
              },
              {
                title: 'Test a real conversation',
                description: 'Open Conversations and check if recent messages are loading normally.',
              },
              {
                title: 'If it fails, generate another QR',
                description: 'When the connection does not complete, go back to Connections and repeat the flow from the beginning.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/conexoes-conectado-v3.jpg',
            alt: 'Connections screen with successfully connected message.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.conexoes] },
        ],
      },
    ],
  },
  {
    id: 'toggles-ia',
    title: 'What each toggle does (AI)',
    description: 'See all the system\'s toggles, organized by area, to configure without missing anything.',
    tags: ['AI', 'Training', 'Conversations', 'Calendar'],
    icon: SlidersHorizontal,
    estimatedMinutes: 12,
    primaryCta: nextStepLinks.treinamento,
    sections: [
      {
        id: 'toggles-treinamento-comportamento',
        title: 'Training: model and behavior',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you will learn: how to choose the model and adjust the AI\'s approach to customer service.',
          },
          {
            type: 'toggleCards',
            items: [
              {
                title: 'OpenAI Model',
                statusKey: 'modeloOpenAI',
                defaultState: 'off',
                description:
                  'Selects the OpenAI provider to respond to customers. Use when you want to keep this model as the main one.',
              },
              {
                title: 'Google Model',
                statusKey: 'modeloGoogle',
                defaultState: 'on',
                description:
                  'Select the Google provider (Gemini) to respond to customers. Keeps the flow in the Google model.',
              },
              {
                title: 'Model X (Grok)',
                statusKey: 'modeloX',
                defaultState: 'off',
                description:
                  'Option reserved for a future provider. Today it is unavailable for normal operation.',
              },
              {
                title: 'Present yourself as AI',
                statusKey: 'seApresentarComoIA',
                defaultState: 'on',
                description:
                  'When active, the AI identifies itself as a virtual assistant at the beginning of the conversation. When deactivated, it responds without introducing itself.',
              },
              {
                title: 'Use emojis occasionally',
                statusKey: 'usarEmojis',
                defaultState: 'on',
                description:
                  'It makes the conversation more human and friendly. Keep it on for informal tone; turn it off for a more sober tone.',
              },
              {
                title: 'Turn off message out of context',
                statusKey: 'desligarMensagemForaContexto',
                defaultState: 'off',
                description:
                  'Avoid responses to messages that do not make sense for the service. Reduces errors in out-of-scope conversations.',
              },
              {
                title: 'When you don\'t know how to respond: Silence x Forward',
                statusKey: 'comportamentoNãoSabe',
                defaultState: 'choice',
                description:
                  'Defines the AI fallback: in Silence it does not respond; in Forward it sends a message and passes it on to human assistance.',
              },
              {
                title: 'Reply also groups',
                statusKey: 'responderGrupos',
                defaultState: 'off',
                description:
                  'Allows responses in WhatsApp groups. Use with caution to avoid automatic response outside of a commercial context.',
              },
            ],
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'toggles-treinamento-crm-midias',
        title: 'Training: CRM, calendar and media',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you will learn: which AI permissions impact CRM, files, audio and automatic scheduling.',
          },
          {
            type: 'toggleCards',
            items: [
              {
                title: 'Respond to customers',
                statusKey: 'responderClientes',
                defaultState: 'off',
                description:
                  'Controls whether the AI should also serve contacts that are already in the funnel as customers, and not just leads.',
              },
              {
                title: 'Automatically classify Leads as Customers',
                statusKey: 'autoClassificarLeadComoCliente',
                defaultState: 'off',
                description:
                  'When active, AI promotes leads to customers by identifying clear conversion signals.',
                note: 'If Reply to Customers is turned off, the AI may convert and then stop responding to that contact.',
              },
              {
                title: 'Allow field suggestions (Leads/Customers)',
                statusKey: 'permitirSugestoesCamposLeadsClientes',
                defaultState: 'off',
                description:
                  'The AI then suggests status, observations and next contact for you to review in the CRM before applying.',
                note: 'It can increase credit consumption in operations with a lot of traffic.',
              },
              {
                title: 'Automatically approve AI suggestions',
                statusKey: 'aprovarAutomaticamenteSugestoesLeadsClientes',
                defaultState: 'off',
                description:
                  'Automatically applies CRM suggestions without manual review, speeding up record updating.',
                note: 'It depends on whether the suggestions toggle is active.',
              },
              {
                title: 'Allow AI to send files and contacts',
                statusKey: 'permitirIAEnviarArquivos',
                defaultState: 'off',
                description:
                  'Authorizes automatic sending of library files and native contacts (vCard) during service.',
              },
              {
                title: 'Allow AI to listen and respond to audio',
                statusKey: 'permitirIAOuvirAudios',
                defaultState: 'off',
                description:
                  'Enables transcription and interpretation of received audio, with text response based on the content of the recording.',
                note: 'It can increase consumption for transcription and response generation.',
              },
              {
                title: 'Allow AI to read images and PDFs',
                statusKey: 'permitirIALerImagensEPdfs',
                defaultState: 'off',
                description:
                  'Enables AI to extract context from images and PDF documents to respond based on content sent by the customer.',
              },
              {
                title: 'Use automatic schedule function',
                statusKey: 'usarAgendaAutomatica',
                defaultState: 'off',
                description:
                  'Authorizes AI to consult calendars and automatically create appointments when the service requires an appointment.',
                note: 'Requires correctly configured agendas and times.',
              },
            ],
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'toggles-conversas',
        title: 'Conversations',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you will learn: where to control AI globally and also via individual chat.',
          },
          {
            type: 'toggleCards',
            items: [
              {
                title: 'Global AI',
                statusKey: 'conversasIaGlobal',
                defaultState: 'off',
                description:
                  'Turns AI on or off for the entire conversation operation. If you hang up, no conversation receives an automatic reply.',
              },
              {
                title: 'Conversational AI',
                statusKey: 'conversasIaPorChat',
                defaultState: 'choice',
                description:
                  'Each chat has its own toggle to activate or block the AI in that specific contact.',
              },
            ],
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.conversas] },
        ],
      },
      {
        id: 'toggles-agenda',
        title: 'Calendar',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you will learn: which toggles control display of calendars and release of days for scheduling.',
          },
          {
            type: 'toggleCards',
            items: [
              {
                title: 'Show calendar in the calendar view',
                statusKey: 'agendaVisibilidade',
                defaultState: 'choice',
                description:
                  'In the Calendar panel, each calendar has a checkbox to show or hide events on the calendar.',
              },
              {
                title: 'Day of the week enabled',
                statusKey: 'agendaDiaAtivo',
                defaultState: 'off',
                description:
                  'In the available times setting, you activate the days on which the AI can offer scheduling.',
              },
            ],
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.agenda] },
        ],
      },
    ],
  },
  {
    id: 'treinamento',
    title: 'AI training',
    description: 'A practical guide to filling out the company, services, schedules, prices and instructions without leaving gaps.',
    tags: ['Training', 'AI'],
    icon: Brain,
    estimatedMinutes: 15,
    primaryCta: nextStepLinks.treinamento,
    sections: [
      {
        id: 'treinamento-etapa-1-3',
        title: 'Initial Setup',
        blocks: [
          {
            type: 'steps',
            startAt: 1,
            items: [
              {
                title: 'Choosing the AI Model',
                description:
                  'Select the provider that will respond on WhatsApp and only keep one main model active.',
              },
              {
                title: 'Company Name',
                description:
                  'Fill in exactly how your business should be mentioned in conversations with customers.',
              },
              {
                title: 'Name of Artificial Intelligence',
                description:
                  'Define a simple name for the AI and use the same pattern throughout the service.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-pagina.jpg',
            alt: 'AI Training screen with instruction fields.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-4',
        title: 'AI behavior',
        blocks: [
          {
            type: 'steps',
            startAt: 4,
            items: [
              {
                title: 'Define whether the AI presents itself or not',
                description:
                  'Choose whether she should identify herself as a virtual assistant at the beginning of the conversation.',
              },
              {
                title: 'Adjust tone and style',
                description:
                  'Configure the use of emojis and language to maintain the same tone as your brand.',
              },
              {
                title: 'Set fallback for doubts',
                description:
                  'Choose between silence or forward to human when the AI cannot respond.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-toggle-1.jpg',
            alt: 'AI toggles for extra features such as files, audios, image reading and calendar.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-5',
        title: 'Forward message',
        blocks: [
          {
            type: 'steps',
            startAt: 5,
            items: [
              {
                title: 'Write the transfer message',
                description:
                  'Create a short and clear text to notify that the service will be transferred to someone.',
              },
              {
                title: 'Keep the context in the text',
                description:
                  'Include a continuity phrase so the customer doesn\'t feel like the flow has been interrupted.',
              },
              {
                title: 'Review before saving',
                description:
                  'Ensure that the text is in the right tone and without promises that the team cannot keep.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-toggle-2.png',
            alt: 'AI autonomy toggles in CRM for automatic response and classification.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-6',
        title: 'Group responses',
        blocks: [
          {
            type: 'steps',
            startAt: 6,
            items: [
              {
                title: 'Decide whether groups are in scope',
                description: 'Only activate if you really need to respond in WhatsApp groups.',
              },
              {
                title: 'Assess noise risk',
                description: 'In groups with parallel conversations, the AI can respond out of context if poorly configured.',
              },
              {
                title: 'Start Carefully',
                description: 'If enabled, monitor first calls before escalating to all groups.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-toggle-3.jpg',
            alt: 'Field for the number of historical context messages.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-7',
        title: 'Conversation history',
        blocks: [
          {
            type: 'steps',
            startAt: 7,
            items: [
              {
                title: 'Define how many messages become context',
                description:
                  'Adjust the history so the AI better understands the conversation before responding.',
              },
              {
                title: 'Use less context for simple operation',
                description:
                  'Objective flows work well with fewer messages and consume fewer credits.',
              },
              {
                title: 'Increase context for complex services',
                description:
                  'When there are many exceptions, more history reduces meaningless responses.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-toggle-4.jpg',
            alt: 'Toggle to allow or block AI responses in groups.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-8',
        title: 'Business Permissions and CRM',
        blocks: [
          {
            type: 'steps',
            startAt: 8,
            items: [
              {
                title: 'Respond to registered customers',
                description:
                  'Define whether the AI should also act for contacts who have already become customers.',
              },
              {
                title: 'Automatic conversion Lead -> Customer',
                description:
                  'Activate only if your conversion criteria are clear in the business process.',
              },
              {
                title: 'Field suggestions in CRM',
                description:
                  'Let AI recommend status, observations, and next contact to speed up updates.',
              },
              {
                title: 'Self-approval of suggestions',
                description:
                  'Only enable when you trust the suggestions and want fully automatic flow.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-toggle-5.png',
            alt: 'Field with standard message to forward conversation to human.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-9-12',
        title: 'Media and calendar',
        blocks: [
          {
            type: 'steps',
            startAt: 9,
            items: [
              {
                title: 'Sending Files and Contacts',
                description: 'Allow sending of files and contacts only when this is part of your service.',
              },
              {
                title: 'Audios',
                description: 'Enable AI to transcribe and respond to audio received from customers.',
              },
              {
                title: 'Reading Images and PDFs',
                description: 'Enable AI to interpret images and PDFs that provide important data for the answer.',
              },
              {
                title: 'Using the Calendar',
                description: 'Activate when you want the AI to check availability and make appointments automatically.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-toggle-6.png',
            alt: 'Ultimate AI personality and behavior toggles.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-13',
        title: 'General guidelines',
        blocks: [
          {
            type: 'steps',
            startAt: 13,
            items: [
              {
                title: 'Set mandatory rules',
                description:
                  'Write what AI can and cannot do during service.',
              },
              {
                title: 'Include limits and exceptions',
                description:
                  'Document sensitive situations, prohibited terms, and when to call a human.',
              },
              {
                title: 'Standardize the response format',
                description:
                  'Explain how to break down messages, highlight points, and maintain clarity for the customer.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-orientacoes-gerais.jpg',
            alt: 'Field of general guidance in AI training.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-14-20',
        title: 'Final training guidelines',
        blocks: [
          {
            type: 'steps',
            startAt: 14,
            items: [
              {
                title: 'Additional guidelines for follow-up (resuming conversations)',
                description:
                  'Describe the complete resumption flow: when to send the first reminder, how many attempts to make, what interval between contacts and the purpose of each message. Also define when to stop the follow-up so as not to appear insistent and when to refer for human assistance.',
              },
              {
                title: 'AI Response Type',
                description:
                  'Define exactly how AI should converse: formal or informal, direct or consultative, technical or simplified, with or without emojis. Include message size rules, limit of questions at a time and guidance to never invent information outside of what has been configured.',
              },
              {
                title: 'Company Description',
                description:
                  'Fill out a complete summary of the company: what it does, who it sells to, differentiators, region served, important policies and limitations. The more real context you include, the less chance the AI will respond generically or with incorrect information.',
              },
              {
                title: 'Description of Sold Services/Products',
                description:
                  'Describe the catalog and pricing policy in one place: services/products offered, differences between options, price ranges or fixed prices, payment methods, conditions and important scheduling notes. This gives the AI enough context to recommend the right option without inventing pricing.',
              },
              {
                title: 'Service Hours',
                description:
                  'Provide the actual days and times of service, including breaks and exceptions. If you use a calendar, detail rules such as minimum notice and unavailable times to avoid invalid promises.',
              },
              {
                title: 'Other Important Information',
                description:
                  'Include any relevant information that did not fit in the previous fields: deadlines, guarantees, cancellation policy, regions served, necessary documents and critical observations of your process.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-orientacoes-finais.jpg',
            alt: 'Final guidelines completed in AI training.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.treinamento] },
        ],
      },
    ],
  },
  {
    id: 'leads',
    title: 'Leads (CRM)',
    description: 'How to read the list, filter, review AI suggestions and follow up safely.',
    tags: ['CRM', 'AI'],
    icon: Users,
    estimatedMinutes: 12,
    primaryCta: nextStepLinks.leads,
    sections: [
      {
        id: 'tabela',
        title: 'How to read the Leads table',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you\'ll learn: Which columns matter and how to interpret statuses and dates.',
          },
          {
            type: 'bullets',
            items: [
              'Status indicates the stage of the service (New, Inactive, Waiting, In Process, Customer).',
              'Last Contact shows the last recorded interaction.',
              'Next Contact is your follow-up reminder (and it may be due).',
              'Observations help maintain context of the service.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/leads-parte-1.jpg',
            alt: 'Leads list screen with columns, status and actions.',
            caption: 'Part 1: overview of the Leads list and day-to-day actions.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.leads] },
        ],
      },
      {
        id: 'filtros',
        title: 'Filters that matter',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you\'ll learn: How to quickly find those who need action now.',
          },
          {
            type: 'bullets',
            items: [
              'Filter by Status to focus on "New", "Waiting" and "In Process".',
              'Filter by Next contact: "Today" and "Overdue" to recover conversions.',
              'Use manual date filters to audit by period.',
              'Search for WhatsApp or words in the comments.',
            ],
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.leads] },
        ],
      },
      {
        id: 'sugestoes',
        title: 'IA suggestions (review and application)',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you will learn: what the suggestions are and how to review them before applying.',
          },
          {
            type: 'bullets',
            items: [
              'Suggestions can include status, observations and next contact.',
              'By default, review carefully: the AI suggests and you decide.',
              'With auto-approval enabled in training, changes can be applied automatically.',
              'Use this to standardize service and not let follow-ups expire.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/leads-parte-2.jpg',
            alt: 'AI Suggestions tab on the Leads screen.',
            caption:
              'Part 2: AI suggestions to approve manually or automate according to your operation.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.leads] },
        ],
      },
      {
        id: 'logs',
        title: 'AI suggestion logs',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you will learn: How to track the history of changes made manually or by AI.',
          },
          {
            type: 'bullets',
            items: [
              'Open the "Logs" tab to see the complete history of changes.',
              'Use the filters to find a specific lead, event, or date range.',
              'Check the AI reason for each change to audit the process.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/leads-parte-3.jpg',
            alt: 'AI suggestion logs tab with history and filters.',
            caption: 'Part 3: history of changes and reason for each AI movement.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.leads] },
        ],
      },
      {
        id: 'followup',
        title: 'Follow-up with AI',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you will learn: how to generate a draft with AI, review and send it via WhatsApp.',
          },
          {
            type: 'bullets',
            items: [
              'Click the "glow" (AI) icon next to the lead.',
              'Edit the text to stay true to your tone and what you agreed with the client.',
              'Send and track the response in the Conversations tab.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/follow-up-com-ia.png',
            alt: 'Follow-up window with AI to generate suggestions, review messages and approve sending.',
            caption: 'The AI generates a follow-up suggestion; Review the text and send it when it is in line with your service.',
            size: 'half',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.leads, nextStepLinks.conversas] },
        ],
      },
    ],
  },
  {
    id: 'clientes',
    title: 'Customers (CRM)',
    description: 'Organize customers, understand status and use follow-up/suggestions to increase recurrence.',
    tags: ['CRM', 'AI'],
    icon: UserCheck,
    estimatedMinutes: 12,
    primaryCta: nextStepLinks.clientes,
    sections: [
      {
        id: 'status',
        title: 'Status (Active, Inactive, VIP, Lead)',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you\'ll learn: When to use each status to segment and prioritize.',
          },
          {
            type: 'bullets',
            items: [
              'Active: client undergoing normal follow-up.',
              'VIP: top priority (high ticket, recurring, etc.).',
              'Inactive: no contact/purchases for a while; great for reactivation campaigns.',
              'Lead: if you need to "return" a customer to the lead funnel.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/clientes-status-vip-ativo-inativo-lead.jpg',
            alt: 'List of Customers with status and filters.',
            caption: 'Use status + filters to focus on who brings the most return.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.clientes] },
        ],
      },
      {
        id: 'valor',
        title: 'Total value and follow-up',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you\'ll learn: How to use total value and dates to identify opportunities.',
          },
          {
            type: 'bullets',
            items: [
              'Sort by "Total Value" to identify your best customers.',
              'Use "Next Contact" to maintain relationships and avoid churn.',
              'Record important observations (preferences, restrictions, etc.).',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/valor-total.png',
            alt: 'Fields for total value, last contact, next contact and observations in the customer list.',
            caption: 'Use these fields to prioritize higher-value customers and organize follow-ups.',
            size: 'half',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.clientes] },
        ],
      },
      {
        id: 'ia',
        title: 'AI Suggestions + Follow-up',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you will learn: use AI to accelerate follow-up and standardize CRM with human review.',
          },
          {
            type: 'bullets',
            items: [
              'AI Suggestions: Review and apply status/notes/next contact, or enable self-approval in training.',
              'IA follow-up: generate message, edit and send.',
              'If you enable "Reply customers" in training, the AI can answer customers automatically.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/follow-up-com-ia.png',
            alt: 'Follow-up window with AI to generate suggestions, review messages and approve sending.',
            caption: 'In customer CRM, use AI-powered Follow-up to generate drafts, review, and send faster.',
            size: 'half',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.clientes, nextStepLinks.treinamento] },
        ],
      },
    ],
  },
  {
    id: 'assinaturas-créditos',
    title: 'Subscription and Credit',
    description: 'Understand plan, balance and AI unlocking in a single, direct flow.',
    tags: ['Billing', 'AI'],
    icon: CreditCard,
    estimatedMinutes: 10,
    primaryCta: nextStepLinks.billing,
    sections: [
      {
        id: 'assinatura-credito-passo-a-passo',
        title: 'Subscription and credit: complete step by step',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you will learn: how to subscribe, maintain credit balance and avoid AI blocks due to lack of consumption.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Select and keep an active plan',
                description:
                  'Choose the plan (monthly, annual or Enterprise) to free up service resources and credit purchases.',
              },
              {
                title: 'Track status and renewal',
                description:
                  'Check the next renewal date and avoid pending issues so as not to interrupt AI operation.',
              },
              {
                title: 'Monitor balance and top up credits',
                description:
                  'Check your current balance and top up before zeroing out to maintain automatic responses without pause.',
              },
              {
                title: 'Unlock quickly if you run out of balance',
                description:
                  'If the AI stops due to zero credit, reload and update the Subscription and credits screen to resume service.',
              },
            ],
          },
          {
            type: 'bullets',
            items: [
              'Subscription controls access to the plan and available features.',
              'Credits are consumed according to the use of AI in conversations.',
              'Without a balance, the AI may stop responding until recharged.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/assinatura-e-credito.png',
            alt: 'Subscription and credits screen with plan selection, balance and top-up buttons.',
            caption: 'Select the plan, track renewal and maintain credits so the AI doesn\'t stop.',
          },
          {
            type: 'callout',
            variant: 'warn',
            title: 'Attention',
            text: 'If there is a block due to lack of credits, top up the balance and click "Update" to reestablish the operation.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.billing] },
        ],
      },
    ],
  },
  {
    id: 'agenda',
    title: 'Calendar',
    description: 'Organize schedules, confirm appointments and maintain conflict-free operations.',
    tags: ['Calendar', 'CRM', 'WhatsApp'],
    icon: Calendar,
    estimatedMinutes: 9,
    primaryCta: nextStepLinks.agenda,
    sections: [
      {
        id: 'agenda-passo-a-passo',
        title: 'Calendar: complete step by step',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you will learn: organize appointments, avoid scheduling conflicts and keep follow-up up to date in a single flow.',
          },
          {
            type: 'steps',
            items: [
              { title: 'Open the Calendar module', description: 'In the side menu, go to Calendar to view active schedules and agendas.' },
              { title: 'Choose the viewing grid', description: 'Use Day, Week or Month to better see your routine and availability.' },
              { title: 'Create and review events', description: 'Fill in contact, date, time, service and essential notes before saving.' },
              { title: 'Update markdowns instantly', description: 'When there is a change, adjust immediately to avoid conflict and delay.' },
            ],
          },
          {
            type: 'callout',
            variant: 'tip',
            title: 'Recommended pattern',
            text: 'Confirm at the same time: service, time and contact name before saving the appointment.',
          },
          {
            type: 'bullets',
            items: [
              'At the beginning of the day, review the closest times to reduce absences.',
              'Use short, to-the-point observations to maintain context between agents.',
              'At the end of the day, mark who attended and who needs further contact.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/agenda2.png',
            alt: 'Agenda screen with monthly grid, new event button and view selection.',
            caption: 'Use the Day/Week/Month grid to organize appointments and create new events without conflict.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.agenda, nextStepLinks.clientes] },
        ],
      },
    ],
  },
  {
    id: 'transmissao',
    title: 'Broadcasts',
    description: 'Create bulk campaigns with segmentation and tracking to generate more responses.',
    tags: ['Broadcasts', 'CRM', 'WhatsApp'],
    icon: Megaphone,
    estimatedMinutes: 11,
    primaryCta: nextStepLinks.transmissao,
    sections: [
      {
        id: 'transmissao-passo-a-passo',
        title: 'Broadcasts: complete walkthrough',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you will learn: build a list, send campaigns safely and track results in a single flow.',
          },
          {
            type: 'steps',
            items: [
              { title: 'Open the Broadcast module', description: 'Go to Broadcast in the menu to start a new shot.' },
              { title: 'Name campaign and select audience', description: 'Use a clear name and choose only the right targeting.' },
              { title: 'Write an objective message', description: 'Use short language, direct CTA and a single next step.' },
              { title: 'Review and fire safely', description: 'Check variables, shipping time and total volume before sending.' },
            ],
          },
          {
            type: 'callout',
            variant: 'warn',
            title: 'Avoid blockages',
            text: 'Do not shoot at high volume without warming up. Start smaller and track responses and denials.',
          },
          {
            type: 'bullets',
            items: [
              'Separate lists by objective so as not to mix cold and hot audiences.',
              'Keep track of which transmissions have completed and which need adjustment in the history.',
              'Leads that responded should return to the CRM with the next contact defined.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/transmissao.jpg',
            alt: 'Transmission screen with lists, message, file upload and sending history.',
            caption: 'Create the list, write the message, attach a file if necessary and start transmission.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.transmissao, nextStepLinks.clientes] },
        ],
      },
    ],
  },
  {
    id: 'conexoes-conversas',
    title: 'Connections and Conversations',
    description: 'Common QR errors, reconnection, and how to use AI controls in conversations (if available).',
    tags: ['WhatsApp', 'Conversations', 'AI'],
    icon: MessageSquare,
    estimatedMinutes: 10,
    primaryCta: nextStepLinks.conexoes,
    sections: [
      {
        id: 'qr',
        title: 'Connections via QR (common mistakes)',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you will learn: how to unlock the connection when the QR does not appear or the session drops.',
          },
          {
            type: 'bullets',
            items: [
              'If the QR takes time, click "Try again".',
              'Avoid switching networks on your cell phone during the connection.',
              'If you disconnect, generate a new QR and reconnect.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/conexoes-ler-qrcode-v3.jpg',
            alt: 'Step of scanning the QR Code on the Connections screen.',
            caption: 'If the QR does not appear, click "Generate QR Code" again. If it still fails, refresh the page and try again.',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.conexoes] },
        ],
      },
      {
        id: 'ia-global',
        title: 'Global AI in Conversations',
        blocks: [
          {
            type: 'paragraph',
            text: 'What you will learn: where to turn on/off AI for customer service (when the functionality is visible on your dashboard).',
          },
          {
            type: 'callout',
            variant: 'info',
            title: 'Notice',
            text: 'If you run out of credits, the AI may automatically disable. Maintain balance for continuous operation.',
          },
          {
            type: 'image',
            src: '/tutorials/conversas-ia-global-2.png',
            alt: 'Conversation Screen with global AI control.',
            caption: 'Use global AI with well-rounded training to avoid wrong answers.',
            size: 'half',
          },
          { type: 'links', title: 'open step-by-step', links: [nextStepLinks.conversas, nextStepLinks.billing] },
        ],
      },
    ],
  },
]
