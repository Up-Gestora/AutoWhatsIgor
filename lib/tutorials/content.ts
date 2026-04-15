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

export const TUTORIAL_TAGS = ['IA', 'Treinamento', 'CRM', 'Billing', 'WhatsApp', 'Conversas', 'Agenda', 'Transmissão'] as const
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
  conexoes: { label: 'Abrir Conexões', href: '/dashboard/conexoes' },
  treinamento: { label: 'Abrir Treinamento IA', href: '/dashboard/treinamento' },
  leads: { label: 'Abrir Leads', href: '/dashboard/leads' },
  clientes: { label: 'Abrir Clientes', href: '/dashboard/clientes' },
  conversas: { label: 'Abrir Conversas', href: '/dashboard/conversas' },
  agenda: { label: 'Abrir Agenda', href: '/dashboard/agenda' },
  transmissao: { label: 'Abrir Transmissão', href: '/dashboard/transmissao' },
  billing: { label: 'Abrir Assinatura e créditos', href: '/dashboard/configuracoes?tab=assinatura_creditos' },
} as const

export const TUTORIAL_TOPICS: TutorialTopic[] = [
  {
    id: 'primeiros-passos',
    title: 'Primeiros passos',
    description: 'Conecte seu WhatsApp para iniciar a operação.',
    tags: ['WhatsApp', 'Treinamento', 'Billing'],
    icon: Rocket,
    estimatedMinutes: 7,
    primaryCta: nextStepLinks.conexoes,
    sections: [
      {
        id: 'conectar-whatsapp-gerar-qr',
        title: 'Gerar o QR Code',
        blocks: [
          {
            type: 'steps',
            startAt: 1,
            items: [
              {
                title: 'Abra o WhatsApp no celular',
                description: 'Use o aparelho principal do seu atendimento e confirme que ele está com internet estável.',
              },
              {
                title: 'Clique em "Gerar QR Code" no painel',
                description: 'Na tela de Conexões, clique no botão verde para criar um QR novo e válido.',
              },
              {
                title: 'Deixe essa tela aberta',
                description: 'Não feche a página antes da leitura; o QR pode expirar e você teria que gerar outro.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/conexoes-gerar-qrcode-v3.jpg',
            alt: 'Tela de Conexões com destaque no botão Gerar QR Code.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.conexoes] },
        ],
      },
      {
        id: 'conectar-whatsapp-ler-qr',
        title: 'Ler o QR Code no celular',
        blocks: [
          {
            type: 'steps',
            startAt: 3,
            items: [
              {
                title: 'No WhatsApp, abra "Aparelhos conectados"',
                description: 'No menu do app, entre em Aparelhos conectados e toque em Conectar um aparelho.',
              },
              {
                title: 'Aponte a câmera para o QR da tela',
                description: 'Centralize o código inteiro no enquadramento para a leitura ser imediata.',
              },
              {
                title: 'Aguarde a confirmação',
                description: 'Em alguns segundos o WhatsApp conclui o pareamento e libera o painel.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/conexoes-ler-qrcode-v3.jpg',
            alt: 'Tela de Conexões exibindo o QR Code para leitura no celular.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.conexoes] },
        ],
      },
      {
        id: 'conectar-whatsapp-confirmar',
        title: 'Confirmar conexão',
        blocks: [
          {
            type: 'steps',
            startAt: 4,
            items: [
              {
                title: 'Verifique o status no painel',
                description: 'Confirme a mensagem de conectado com sucesso para garantir que a sessão foi criada.',
              },
              {
                title: 'Teste uma conversa real',
                description: 'Abra Conversas e valide se as mensagens recentes estão carregando normalmente.',
              },
              {
                title: 'Se falhar, gere outro QR',
                description: 'Quando a conexão não completar, volte para Conexões e repita o fluxo desde o início.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/conexoes-conectado-v3.jpg',
            alt: 'Tela de Conexões com mensagem de conectado com sucesso.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.conexoes] },
        ],
      },
    ],
  },
  {
    id: 'toggles-ia',
    title: 'O que cada toggle faz (IA)',
    description: 'Veja todos os toggles do sistema, organizados por área, para configurar sem perder nada.',
    tags: ['IA', 'Treinamento', 'Conversas', 'Agenda'],
    icon: SlidersHorizontal,
    estimatedMinutes: 12,
    primaryCta: nextStepLinks.treinamento,
    sections: [
      {
        id: 'toggles-treinamento-comportamento',
        title: 'Treinamento: modelo e comportamento',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: como escolher o modelo e ajustar a postura da IA no atendimento.',
          },
          {
            type: 'toggleCards',
            items: [
              {
                title: 'Modelo OpenAI',
                statusKey: 'modeloOpenAI',
                defaultState: 'off',
                description:
                  'Seleciona o provedor OpenAI para responder os clientes. Use quando quiser manter esse modelo como principal.',
              },
              {
                title: 'Modelo Google',
                statusKey: 'modeloGoogle',
                defaultState: 'on',
                description:
                  'Seleciona o provedor Google (Gemini) para responder os clientes. Mantém o fluxo no modelo Google.',
              },
              {
                title: 'Modelo X (Grok)',
                statusKey: 'modeloX',
                defaultState: 'off',
                description:
                  'Opção reservada para um provedor futuro. Hoje fica indisponível para operação normal.',
              },
              {
                title: 'Se apresentar como IA',
                statusKey: 'seApresentarComoIA',
                defaultState: 'on',
                description:
                  'Quando ativo, a IA se identifica como assistente virtual no início da conversa. Quando desativado, responde sem se apresentar.',
              },
              {
                title: 'Usar emojis ocasionalmente',
                statusKey: 'usarEmojis',
                defaultState: 'on',
                description:
                  'Deixa a conversa mais humana e amigável. Mantenha ligado para tom informal; desligue para um tom mais sóbrio.',
              },
              {
                title: 'Desligar mensagem fora de contexto',
                statusKey: 'desligarMensagemForaContexto',
                defaultState: 'off',
                description:
                  'Evita respostas em mensagens que não fazem sentido para o atendimento. Reduz erro em conversas fora do escopo.',
              },
              {
                title: 'Quando não souber responder: Silêncio x Encaminhar',
                statusKey: 'comportamentoNãoSabe',
                defaultState: 'choice',
                description:
                  'Define o fallback da IA: em Silêncio ela não responde; em Encaminhar ela envia mensagem e passa para atendimento humano.',
              },
              {
                title: 'Responder também grupos',
                statusKey: 'responderGrupos',
                defaultState: 'off',
                description:
                  'Permite resposta em grupos de WhatsApp. Use com cuidado para evitar resposta automática fora do contexto comercial.',
              },
            ],
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'toggles-treinamento-crm-midias',
        title: 'Treinamento: CRM, agenda e mídias',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: quais permissões da IA impactam CRM, arquivos, áudios e agendamento automático.',
          },
          {
            type: 'toggleCards',
            items: [
              {
                title: 'Responder clientes',
                statusKey: 'responderClientes',
                defaultState: 'off',
                description:
                  'Controla se a IA também deve atender contatos que já estão no funil como clientes, e não apenas leads.',
              },
              {
                title: 'Classificar Leads como Clientes automaticamente',
                statusKey: 'autoClassificarLeadComoCliente',
                defaultState: 'off',
                description:
                  'Quando ativo, a IA promove lead para cliente ao identificar sinais claros de conversão.',
                note: 'Se Responder clientes estiver desligado, a IA pode converter e depois parar de responder esse contato.',
              },
              {
                title: 'Permitir sugestões de campos (Leads/Clientes)',
                statusKey: 'permitirSugestoesCamposLeadsClientes',
                defaultState: 'off',
                description:
                  'A IA passa a sugerir status, observações e próximo contato para você revisar no CRM antes de aplicar.',
                note: 'Pode aumentar consumo de créditos em operações com muito tráfego.',
              },
              {
                title: 'Aprovar automaticamente sugestões da IA',
                statusKey: 'aprovarAutomaticamenteSugestoesLeadsClientes',
                defaultState: 'off',
                description:
                  'Aplica automaticamente as sugestões de CRM sem revisão manual, acelerando atualização dos registros.',
                note: 'Depende do toggle de sugestões estar ativo.',
              },
              {
                title: 'Permitir que a IA envie arquivos e contatos',
                statusKey: 'permitirIAEnviarArquivos',
                defaultState: 'off',
                description:
                  'Autoriza envio automático de arquivos da biblioteca e contatos nativos (vCard) durante o atendimento.',
              },
              {
                title: 'Permitir que a IA ouça e responda áudios',
                statusKey: 'permitirIAOuvirAudios',
                defaultState: 'off',
                description:
                  'Habilita transcrição e interpretação de áudios recebidos, com resposta em texto baseada no conteúdo da gravação.',
                note: 'Pode elevar consumo por transcrição e geração de resposta.',
              },
              {
                title: 'Permitir que a IA leia imagens e PDFs',
                statusKey: 'permitirIALerImagensEPdfs',
                defaultState: 'off',
                description:
                  'Permite que a IA extraia contexto de imagens e documentos PDF para responder com base no conteúdo enviado pelo cliente.',
              },
              {
                title: 'Usar função de agenda automática',
                statusKey: 'usarAgendaAutomatica',
                defaultState: 'off',
                description:
                  'Autoriza a IA a consultar agendas e criar agendamentos automaticamente quando o serviço exigir marcação.',
                note: 'Requer agendas e horários corretamente configurados.',
              },
            ],
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'toggles-conversas',
        title: 'Conversas',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: onde controlar a IA de forma global e também por chat individual.',
          },
          {
            type: 'toggleCards',
            items: [
              {
                title: 'IA Global',
                statusKey: 'conversasIaGlobal',
                defaultState: 'off',
                description:
                  'Liga ou desliga a IA para a operação inteira de conversas. Se desligar, nenhuma conversa recebe resposta automática.',
              },
              {
                title: 'IA por conversa',
                statusKey: 'conversasIaPorChat',
                defaultState: 'choice',
                description:
                  'Cada chat tem um toggle próprio para ativar ou bloquear a IA naquele contato específico.',
              },
            ],
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.conversas] },
        ],
      },
      {
        id: 'toggles-agenda',
        title: 'Agenda',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: quais toggles controlam exibição de agendas e liberação de dias para agendamento.',
          },
          {
            type: 'toggleCards',
            items: [
              {
                title: 'Exibir agenda no calendário',
                statusKey: 'agendaVisibilidade',
                defaultState: 'choice',
                description:
                  'No painel da Agenda, cada agenda tem um checkbox para mostrar ou ocultar eventos no calendário.',
              },
              {
                title: 'Dia da semana habilitado',
                statusKey: 'agendaDiaAtivo',
                defaultState: 'off',
                description:
                  'Na configuração de horários disponíveis, você ativa os dias em que a IA pode oferecer agendamento.',
              },
            ],
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.agenda] },
        ],
      },
    ],
  },
  {
    id: 'treinamento',
    title: 'Treinamento da IA',
    description: 'Um guia prático para preencher empresa, serviços, horários, valores e instruções sem deixar lacunas.',
    tags: ['Treinamento', 'IA'],
    icon: Brain,
    estimatedMinutes: 15,
    primaryCta: nextStepLinks.treinamento,
    sections: [
      {
        id: 'treinamento-etapa-1-3',
        title: 'Configuração inicial',
        blocks: [
          {
            type: 'steps',
            startAt: 1,
            items: [
              {
                title: 'Escolha do Modelo de IA',
                description:
                  'Selecione o provedor que vai responder no WhatsApp e mantenha apenas um modelo principal ativo.',
              },
              {
                title: 'Nome da Empresa',
                description:
                  'Preencha exatamente como seu negócio deve ser citado nas conversas com clientes.',
              },
              {
                title: 'Nome da Inteligência Artificial',
                description:
                  'Defina um nome simples para a IA e use o mesmo padrão em todo o atendimento.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-pagina.jpg',
            alt: 'Tela de Treinamento IA com campos de instruções.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-4',
        title: 'Comportamento da IA',
        blocks: [
          {
            type: 'steps',
            startAt: 4,
            items: [
              {
                title: 'Defina se a IA se apresenta ou não',
                description:
                  'Escolha se ela deve se identificar como assistente virtual no início da conversa.',
              },
              {
                title: 'Ajuste tom e estilo',
                description:
                  'Configure uso de emojis e linguagem para manter o mesmo tom da sua marca.',
              },
              {
                title: 'Defina fallback para dúvidas',
                description:
                  'Escolha entre silêncio ou encaminhar para humano quando a IA não souber responder.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-toggle-1.jpg',
            alt: 'Toggles da IA para recursos extras como arquivos, áudios, leitura de imagem e agenda.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-5',
        title: 'Mensagem de encaminhamento',
        blocks: [
          {
            type: 'steps',
            startAt: 5,
            items: [
              {
                title: 'Escreva a mensagem de transferência',
                description:
                  'Crie um texto curto e claro para avisar que o atendimento vai passar para uma pessoa.',
              },
              {
                title: 'Mantenha o contexto no texto',
                description:
                  'Inclua uma frase de continuidade para o cliente não sentir que o fluxo foi interrompido.',
              },
              {
                title: 'Revise antes de salvar',
                description:
                  'Garanta que o texto esteja no tom certo e sem promessas que o time não possa cumprir.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-toggle-2.png',
            alt: 'Toggles de autonomia da IA no CRM para resposta e classificação automática.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-6',
        title: 'Respostas em grupos',
        blocks: [
          {
            type: 'steps',
            startAt: 6,
            items: [
              {
                title: 'Decida se grupos entram no escopo',
                description: 'Ative apenas se você realmente precisa responder em grupos de WhatsApp.',
              },
              {
                title: 'Avalie risco de ruido',
                description: 'Em grupos com conversa paralela, a IA pode responder fora de contexto se mal configurada.',
              },
              {
                title: 'Comece com cuidado',
                description: 'Se ativar, monitore os primeiros atendimentos antes de escalar para todos os grupos.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-toggle-3.jpg',
            alt: 'Campo de quantidade de mensagens de contexto do histórico.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-7',
        title: 'Histórico de conversa',
        blocks: [
          {
            type: 'steps',
            startAt: 7,
            items: [
              {
                title: 'Defina quantas mensagens viram contexto',
                description:
                  'Ajuste o histórico para a IA entender melhor a conversa antes de responder.',
              },
              {
                title: 'Use menos contexto para operação simples',
                description:
                  'Fluxos objetivos funcionam bem com menos mensagens e consomem menos créditos.',
              },
              {
                title: 'Aumente contexto para atendimentos complexos',
                description:
                  'Quando há muitas exceções, mais histórico reduz respostas sem sentido.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-toggle-4.jpg',
            alt: 'Toggle para permitir ou bloquear respostas da IA em grupos.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-8',
        title: 'Permissões comerciais e CRM',
        blocks: [
          {
            type: 'steps',
            startAt: 8,
            items: [
              {
                title: 'Responder clientes cadastrados',
                description:
                  'Defina se a IA também deve atuar para contatos que já viraram clientes.',
              },
              {
                title: 'Conversão automática Lead -> Cliente',
                description:
                  'Ative somente se seus critérios de conversão estiverem claros no processo comercial.',
              },
              {
                title: 'Sugestões de campos no CRM',
                description:
                  'Permita que a IA recomende status, observações e próximo contato para acelerar atualização.',
              },
              {
                title: 'Autoaprovação das sugestões',
                description:
                  'Habilite apenas quando você confiar nas sugestões e quiser fluxo totalmente automático.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-toggle-5.png',
            alt: 'Campo com mensagem padrão para encaminhar conversa para humano.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-9-12',
        title: 'Mídias e agenda',
        blocks: [
          {
            type: 'steps',
            startAt: 9,
            items: [
              {
                title: 'Envio de Arquivos e Contatos',
                description: 'Permita envio de arquivos e contatos somente quando isso fizer parte do seu atendimento.',
              },
              {
                title: 'Áudios',
                description: 'Ative para a IA transcrever e responder áudios recebidos dos clientes.',
              },
              {
                title: 'Leitura de Imagens e PDFs',
                description: 'Ative para a IA interpretar imagens e PDFs que tragam dados importantes para a resposta.',
              },
              {
                title: 'Uso da Agenda',
                description: 'Ative quando você quiser que a IA consulte disponibilidade e faça agendamentos automaticamente.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-toggle-6.png',
            alt: 'Toggles finais de personalidade e comportamento da IA.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-13',
        title: 'Orientações gerais',
        blocks: [
          {
            type: 'steps',
            startAt: 13,
            items: [
              {
                title: 'Defina regras obrigatórias',
                description:
                  'Escreva o que a IA pode e não pode fazer durante o atendimento.',
              },
              {
                title: 'Inclua limites e exceções',
                description:
                  'Documente situações sensíveis, termos proibidos e quando deve chamar um humano.',
              },
              {
                title: 'Padronize o formato de resposta',
                description:
                  'Explique como quebrar mensagens, destacar pontos e manter clareza para o cliente.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-orientacoes-gerais.jpg',
            alt: 'Campo de orientações gerais no treinamento da IA.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.treinamento] },
        ],
      },
      {
        id: 'treinamento-etapa-14-20',
        title: 'Orientações finais do treinamento',
        blocks: [
          {
            type: 'steps',
            startAt: 14,
            items: [
              {
                title: 'Orientações adicionais para follow-up (retomar conversas)',
                description:
                  'Descreva o fluxo completo de retomada: quando enviar o primeiro lembrete, quantas tentativas fazer, qual intervalo entre contatos e qual objetivo de cada mensagem. Defina também quando parar o follow-up para não parecer insistente e quando encaminhar para atendimento humano.',
              },
              {
                title: 'Tipo de Resposta da IA',
                description:
                  'Defina exatamente como a IA deve conversar: formal ou informal, direta ou consultiva, técnica ou simplificada, com ou sem emojis. Inclua regras de tamanho da mensagem, limite de perguntas por vez e orientação para nunca inventar informações fora do que foi configurado.',
              },
              {
                title: 'Descrição da Empresa',
                description:
                  'Preencha um resumo completo da empresa: o que faz, para quem vende, diferenciais, região atendida, políticas importantes e limitações. Quanto mais contexto real você incluir, menor a chance de a IA responder de forma genérica ou com informação incorreta.',
              },
              {
                title: 'Serviços Vendidos',
                description:
                  'Liste todos os serviços e produtos com nome e descrição clara. Se houver variações, explique as diferenças de cada opção para a IA indicar o serviço certo em cada situação.',
              },
              {
                title: 'Horários de Atendimento',
                description:
                  'Informe os dias e horários reais de atendimento, incluindo pausas e exceções. Se usa agenda, detalhe regras como antecedência mínima e horários indisponíveis para evitar promessas inválidas.',
              },
              {
                title: 'Valores e Preços',
                description:
                  'Cadastre os preços atualizados de cada serviço ou produto, formas de pagamento e condições especiais. Isso evita orçamento incorreto e melhora a confiança do cliente na resposta da IA.',
              },
              {
                title: 'Outras Informações Importantes',
                description:
                  'Inclua qualquer informação relevante que não coube nos campos anteriores: prazos, garantias, política de cancelamento, regiões atendidas, documentos necessários e observações críticas do seu processo.',
              },
            ],
          },
          {
            type: 'image',
            src: '/tutorials/treinamento-orientacoes-finais.jpg',
            alt: 'Orientações finais preenchidas no treinamento da IA.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.treinamento] },
        ],
      },
    ],
  },
  {
    id: 'leads',
    title: 'Leads (CRM)',
    description: 'Como ler a lista, filtrar, revisar sugestões da IA e fazer follow-up com segurança.',
    tags: ['CRM', 'IA'],
    icon: Users,
    estimatedMinutes: 12,
    primaryCta: nextStepLinks.leads,
    sections: [
      {
        id: 'tabela',
        title: 'Como ler a tabela de Leads',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: quais colunas importam e como interpretar status e datas.',
          },
          {
            type: 'bullets',
            items: [
              'Status indica o estágio do atendimento (Novo, Inativo, Aguardando, Em processo, Cliente).',
              'Último contato mostra a última interação registrada.',
              'Próximo contato é seu lembrete de follow-up (e pode ficar vencido).',
              'Observações ajudam a manter contexto do atendimento.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/leads-parte-1.jpg',
            alt: 'Tela da lista de Leads com colunas, status e ações.',
            caption: 'Parte 1: visão geral da lista de Leads e ações do dia a dia.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.leads] },
        ],
      },
      {
        id: 'filtros',
        title: 'Filtros que importam',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: como achar rápido quem precisa de ação agora.',
          },
          {
            type: 'bullets',
            items: [
              'Filtre por Status para focar em "Novo", "Aguardando" e "Em processo".',
              'Filtre por Próximo contato: "Hoje" e "Vencidos" para recuperar conversões.',
              'Use filtros de data manual para auditoria por período.',
              'Busque por WhatsApp ou palavras nas observações.',
            ],
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.leads] },
        ],
      },
      {
        id: 'sugestoes',
        title: 'Sugestões IA (revisão e aplicação)',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: o que são as sugestões e como revisar antes de aplicar.',
          },
          {
            type: 'bullets',
            items: [
              'Sugestões podem incluir status, observações e próximo contato.',
              'Por padrão, revise com cuidado: a IA sugere e você decide.',
              'Com autoaprovação ativada no treinamento, as alterações podem ser aplicadas automaticamente.',
              'Use isso para padronizar atendimento e não deixar follow-ups vencerem.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/leads-parte-2.jpg',
            alt: 'Aba de Sugestões IA na tela de Leads.',
            caption:
              'Parte 2: sugestões da IA para aprovar manualmente ou automatizar conforme sua operação.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.leads] },
        ],
      },
      {
        id: 'logs',
        title: 'Logs de sugestões da IA',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: como acompanhar o histórico de alterações feitas manualmente ou pela IA.',
          },
          {
            type: 'bullets',
            items: [
              'Abra a aba "Logs" para ver o histórico completo das mudanças.',
              'Use os filtros para encontrar um lead, evento ou período específico.',
              'Confira o motivo da IA em cada alteração para auditoria do processo.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/leads-parte-3.jpg',
            alt: 'Aba de Logs de sugestões IA com histórico e filtros.',
            caption: 'Parte 3: histórico de alterações e motivo de cada movimento da IA.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.leads] },
        ],
      },
      {
        id: 'followup',
        title: 'Follow-up com IA',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: como gerar um rascunho com IA, revisar e enviar pelo WhatsApp.',
          },
          {
            type: 'bullets',
            items: [
              'Clique no ícone de "brilho" (IA) ao lado do lead.',
              'Edite o texto para ficar fiel ao seu tom e ao combinado com o cliente.',
              'Envie e acompanhe a resposta na aba de Conversas.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/follow-up-com-ia.png',
            alt: 'Janela de Follow-up com IA para gerar sugestão, revisar mensagem e aprovar envio.',
            caption: 'A IA gera uma sugestão de follow-up; revise o texto e envie quando estiver alinhado com seu atendimento.',
            size: 'half',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.leads, nextStepLinks.conversas] },
        ],
      },
    ],
  },
  {
    id: 'clientes',
    title: 'Clientes (CRM)',
    description: 'Organize clientes, entenda status e use follow-up/sugestões para aumentar recorrência.',
    tags: ['CRM', 'IA'],
    icon: UserCheck,
    estimatedMinutes: 12,
    primaryCta: nextStepLinks.clientes,
    sections: [
      {
        id: 'status',
        title: 'Status (Ativo, Inativo, VIP, Lead)',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: quando usar cada status para segmentar e priorizar.',
          },
          {
            type: 'bullets',
            items: [
              'Ativo: cliente em acompanhamento normal.',
              'VIP: prioridade máxima (ticket alto, recorrente, etc).',
              'Inativo: sem contato/compras há um tempo; ótimo para campanhas de reativação.',
              'Lead: se precisar "voltar" um cliente para o funil de lead.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/clientes-status-vip-ativo-inativo-lead.jpg',
            alt: 'Lista de Clientes com status e filtros.',
            caption: 'Use status + filtros para focar em quem traz mais retorno.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.clientes] },
        ],
      },
      {
        id: 'valor',
        title: 'Valor total e acompanhamento',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: como usar o valor total e datas para identificar oportunidades.',
          },
          {
            type: 'bullets',
            items: [
              'Ordene por "Valor total" para identificar seus melhores clientes.',
              'Use "Próximo contato" para manter relacionamento e evitar churn.',
              'Registre observações importantes (preferências, restrições, etc).',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/valor-total.png',
            alt: 'Campos de valor total, último contato, próximo contato e observações na lista de clientes.',
            caption: 'Use esses campos para priorizar clientes de maior valor e organizar acompanhamentos.',
            size: 'half',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.clientes] },
        ],
      },
      {
        id: 'ia',
        title: 'Sugestões IA + Follow-up',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: usar IA para acelerar follow-up e padronizar CRM com revisão humana.',
          },
          {
            type: 'bullets',
            items: [
              'Sugestões IA: revise e aplique status/observações/próximo contato, ou ative autoaprovação no treinamento.',
              'Follow-up IA: gere mensagem, edite e envie.',
              'Se ativar "Responder clientes" no treinamento, a IA pode atender clientes automaticamente.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/follow-up-com-ia.png',
            alt: 'Janela de Follow-up com IA para gerar sugestão, revisar mensagem e aprovar envio.',
            caption: 'No CRM de clientes, use o Follow-up com IA para gerar rascunhos, revisar e enviar com mais rapidez.',
            size: 'half',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.clientes, nextStepLinks.treinamento] },
        ],
      },
    ],
  },
  {
    id: 'assinaturas-créditos',
    title: 'Assinatura e Crédito',
    description: 'Entenda plano, saldo e desbloqueio da IA em um fluxo único e direto.',
    tags: ['Billing', 'IA'],
    icon: CreditCard,
    estimatedMinutes: 10,
    primaryCta: nextStepLinks.billing,
    sections: [
      {
        id: 'assinatura-credito-passo-a-passo',
        title: 'Assinatura e crédito: passo a passo completo',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: como assinar, manter saldo de créditos e evitar bloqueios da IA por falta de consumo.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Selecione e mantenha um plano ativo',
                description:
                  'Escolha o plano (mensal, anual ou Enterprise) para liberar os recursos de atendimento e compras de crédito.',
              },
              {
                title: 'Acompanhe status e renovação',
                description:
                  'Verifique a data da próxima renovação e evite pendências para não interromper a operação da IA.',
              },
              {
                title: 'Monitore saldo e recarregue créditos',
                description:
                  'Consulte o saldo atual e faça recarga antes de zerar para manter respostas automáticas sem pausa.',
              },
              {
                title: 'Desbloqueie rápidamente se faltar saldo',
                description:
                  'Se a IA parar por crédito zerado, recarregue e atualize a tela de Assinatura e créditos para retomar o atendimento.',
              },
            ],
          },
          {
            type: 'bullets',
            items: [
              'Assinatura controla acesso ao plano e aos recursos disponíveis.',
              'Créditos são consumidos conforme uso da IA nas conversas.',
              'Sem saldo, a IA pode parar de responder até nova recarga.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/assinatura-e-credito.png',
            alt: 'Tela de assinatura e créditos com seleção de plano, saldo e botões de recarga.',
            caption: 'Selecione o plano, acompanhe renovação e mantenha créditos para a IA não parar.',
          },
          {
            type: 'callout',
            variant: 'warn',
            title: 'Atenção',
            text: 'Se houver bloqueio por falta de créditos, recarregue saldo e clique em "Atualizar" para restabelecer a operação.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.billing] },
        ],
      },
    ],
  },
  {
    id: 'agenda',
    title: 'Agenda',
    description: 'Organize horários, confirme compromissos e mantenha a operação sem conflitos.',
    tags: ['Agenda', 'CRM', 'WhatsApp'],
    icon: Calendar,
    estimatedMinutes: 9,
    primaryCta: nextStepLinks.agenda,
    sections: [
      {
        id: 'agenda-passo-a-passo',
        title: 'Agenda: passo a passo completo',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: organizar atendimentos, evitar conflito de horários e manter follow-up em dia em um fluxo único.',
          },
          {
            type: 'steps',
            items: [
              { title: 'Abra o módulo Agenda', description: 'No menu lateral, entre em Agenda para visualizar horários e agendas ativas.' },
              { title: 'Escolha a grade de visualização', description: 'Use Dia, Semana ou Mês para enxergar melhor sua rotina e disponibilidade.' },
              { title: 'Crie e revise eventos', description: 'Preencha contato, data, hora, serviço e observações essenciais antes de salvar.' },
              { title: 'Atualize remarcações na hora', description: 'Quando houver mudança, ajuste imediatamente para evitar conflito e atraso.' },
            ],
          },
          {
            type: 'callout',
            variant: 'tip',
            title: 'Padrão recomendado',
            text: 'Confirme no mesmo momento: serviço, horário e nome do contato antes de salvar o agendamento.',
          },
          {
            type: 'bullets',
            items: [
              'No início do dia, revise os horários mais próximos para reduzir faltas.',
              'Use observações curtas e objetivas para manter contexto entre atendentes.',
              'No fim do dia, marque quem compareceu e quem precisa de novo contato.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/agenda2.png',
            alt: 'Tela da Agenda com grade mensal, botão de novo evento e seleção de visualização.',
            caption: 'Use a grade Dia/Semana/Mês para organizar atendimentos e criar novos eventos sem conflito.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.agenda, nextStepLinks.clientes] },
        ],
      },
    ],
  },
  {
    id: 'transmissao',
    title: 'Transmissão',
    description: 'Crie campanhas em massa com segmentação e acompanhamento para gerar mais respostas.',
    tags: ['Transmissão', 'CRM', 'WhatsApp'],
    icon: Megaphone,
    estimatedMinutes: 11,
    primaryCta: nextStepLinks.transmissao,
    sections: [
      {
        id: 'transmissao-passo-a-passo',
        title: 'Transmissão: passo a passo completo',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: montar lista, enviar campanha com segurança e acompanhar resultados em um fluxo único.',
          },
          {
            type: 'steps',
            items: [
              { title: 'Abra o módulo Transmissão', description: 'Acesse Transmissão no menu para iniciar um disparo novo.' },
              { title: 'Nomeie campanha e selecione público', description: 'Use um nome claro e escolha apenas a segmentação correta.' },
              { title: 'Escreva uma mensagem objetiva', description: 'Use linguagem curta, CTA direto e um único próximo passo.' },
              { title: 'Revise e dispare com segurança', description: 'Cheque variáveis, horário de envio e volume total antes de enviar.' },
            ],
          },
          {
            type: 'callout',
            variant: 'warn',
            title: 'Evite bloqueios',
            text: 'Não dispare volume alto sem aquecimento. Comece menor e acompanhe respostas e recusas.',
          },
          {
            type: 'bullets',
            items: [
              'Separe listas por objetivo para não misturar público frio e quente.',
              'Acompanhe no histórico quais transmissões concluíram e quais precisam de ajuste.',
              'Leads que responderam devem voltar para o CRM com próximo contato definido.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/transmissao.jpg',
            alt: 'Tela de transmissão com listas, mensagem, upload de arquivo e histórico de envios.',
            caption: 'Monte a lista, escreva a mensagem, anexe arquivo se necessário e inicie a transmissão.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.transmissao, nextStepLinks.clientes] },
        ],
      },
    ],
  },
  {
    id: 'conexoes-conversas',
    title: 'Conexões e Conversas',
    description: 'Erros comuns no QR, reconexão e como usar controles de IA nas conversas (se disponíveis).',
    tags: ['WhatsApp', 'Conversas', 'IA'],
    icon: MessageSquare,
    estimatedMinutes: 10,
    primaryCta: nextStepLinks.conexoes,
    sections: [
      {
        id: 'qr',
        title: 'Conexões via QR (erros comuns)',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: como destravar a conexão quando o QR não aparece ou a sessão cai.',
          },
          {
            type: 'bullets',
            items: [
              'Se o QR demorar, clique em "Tentar novamente".',
              'Evite ficar alternando redes no celular durante a conexão.',
              'Se desconectar, gere um novo QR e reconecte.',
            ],
          },
          {
            type: 'image',
            src: '/tutorials/conexoes-ler-qrcode-v3.jpg',
            alt: 'Etapa de escaneamento do QR Code na tela de Conexões.',
            caption: 'Se o QR não aparecer, clique em "Gerar QR Code" novamente. Se ainda falhar, atualize a página e tente de novo.',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.conexoes] },
        ],
      },
      {
        id: 'ia-global',
        title: 'IA Global em Conversas',
        blocks: [
          {
            type: 'paragraph',
            text: 'O que você vai aprender: onde ligar/desligar IA para atendimento (quando a funcionalidade estiver visível no seu painel).',
          },
          {
            type: 'callout',
            variant: 'info',
            title: 'Nota',
            text: 'Se você ficar sem créditos, a IA pode ser desativada automaticamente. Mantenha saldo para operação contínua.',
          },
          {
            type: 'image',
            src: '/tutorials/conversas-ia-global-2.png',
            alt: 'Tela de Conversas com controle de IA global.',
            caption: 'Use IA global com treinamento bem preenchido para evitar respostas erradas.',
            size: 'half',
          },
          { type: 'links', title: 'realizar o passo a passo', links: [nextStepLinks.conversas, nextStepLinks.billing] },
        ],
      },
    ],
  },
]
