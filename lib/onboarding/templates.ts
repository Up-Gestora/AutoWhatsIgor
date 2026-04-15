import type { TrainingVerticalTemplate } from './types'

export const TRAINING_VERTICAL_TEMPLATES: TrainingVerticalTemplate[] = [
  {
    id: 'clinica_estetica',
    label: 'Clínica / Estética',
    description: 'Captação de consultas e procedimentos estéticos.',
    values: {
      empresa:
        'Somos uma clínica de estética em {{cidade}} focada em resultados naturais, atendimento humanizado e acompanhamento completo.',
      descricaoServicosProdutosVendidos:
        'Serviços/produtos:\n- Avaliação estética personalizada\n- Limpeza de pele\n- Peelings\n- Botox e preenchimento\n- Protocolos corporais\n- Pós-procedimento orientado\n\nValores e preços:\nOs valores variam por procedimento e avaliação. Sempre ofereça avaliação inicial para indicar o melhor protocolo.',
      horarios: 'Segunda a sexta: 08:00 às 19:00\nSábado: 08:00 às 13:00\nDomingo: fechado',
      orientacoesGerais:
        'Objetivo principal: converter interessados em agendar avaliação.\nResponda com mensagens curtas, linguagem acolhedora e foco em próximo passo.\nNão prometa resultado clínico garantido.\nSempre finalize com CTA para agendar avaliação.',
      orientacoesFollowUp:
        'No follow-up, retome o interesse no procedimento citado e pergunte se prefere avaliação presencial ou online.\nSe não responder ao primeiro retorno, espaçar contatos.',
      instrucoesSugestoesLeadsClientes:
        'Atualize status para em_processo quando houver interesse em agendar.\nSe não responder, sugerir próximo contato D+3, D+14 e depois +60 dias.\nRecusa explícita: status inativo e nextContactAt nulo.'
    }
  },
  {
    id: 'odontologia',
    label: 'Odontologia',
    description: 'Triagem de tratamento odontológico e agendamento de avaliação.',
    values: {
      empresa:
        'Somos uma clínica odontológica em {{cidade}} com foco em atendimento consultivo, previsibilidade de tratamento e acompanhamento próximo.',
      descricaoServicosProdutosVendidos:
        'Serviços/produtos:\n- Avaliação odontológica\n- Ortodontia\n- Implantes\n- Clareamento\n- Endodontia\n- Próteses\n\nValores e preços:\nValores dependem de avaliação clínica. Informe faixa apenas quando houver política definida no treinamento.',
      horarios: 'Segunda a sexta: 08:00 às 18:00\nSábado: 08:00 às 12:00\nDomingo: fechado',
      orientacoesGerais:
        'Priorize acolhimento e triagem rápida da necessidade do paciente.\nSempre conduza para avaliação inicial e explique que o plano depende do diagnóstico.',
      orientacoesFollowUp:
        'Retome o motivo da busca (dor, estética, alinhamento) e ofereça horários disponíveis de avaliação.\nEvite mensagens longas.',
      instrucoesSugestoesLeadsClientes:
        'Interesse em avaliação: em_processo.\nAguardando retorno: aguardando com próximo contato em 3 dias.\nSem resposta recorrente: ampliar intervalo e inativar após 6 tentativas.'
    }
  },
  {
    id: 'imobiliaria',
    label: 'Imobiliária',
    description: 'Qualificação de compradores e locatários.',
    values: {
      empresa:
        'Somos uma imobiliária de {{cidade}} especializada em compra, venda e locação com atendimento consultivo para encontrar o imóvel ideal.',
      descricaoServicosProdutosVendidos:
        'Serviços/produtos:\n- Compra e venda de imóveis\n- Locação residencial e comercial\n- Captação de proprietários\n- Simulação e apoio documental\n\nValores e preços:\nValores, taxas e condições variam por imóvel. Sempre confirme faixa de orçamento e tipo de imóvel desejado.',
      horarios: 'Segunda a sexta: 09:00 às 18:30\nSábado: 09:00 às 13:00',
      orientacoesGerais:
        'Qualifique rapidamente perfil, bairro, faixa de valor e objetivo (compra ou locação).\nConduza para envio de opções e visita.',
      orientacoesFollowUp:
        'No follow-up, apresente próximo passo concreto: receber opções, agendar visita ou confirmar documentação.',
      instrucoesSugestoesLeadsClientes:
        'Lead qualificado com faixa e objetivo: em_processo.\nSem resposta: D+3, D+14, +60 dias.\nRecusa explícita: inativo e sem próximo contato.'
    }
  },
  {
    id: 'oficina_auto',
    label: 'Oficina / Auto',
    description: 'Atendimento para revisão, diagnóstico e serviços automotivos.',
    values: {
      empresa:
        'Somos uma oficina automotiva em {{cidade}} focada em transparência no diagnóstico, agilidade e segurança do cliente.',
      descricaoServicosProdutosVendidos:
        'Serviços/produtos:\n- Revisão preventiva\n- Diagnóstico elétrico\n- Freios e suspensão\n- Troca de óleo e filtros\n- Manutenção geral\n\nValores e preços:\nOrçamento final depende do diagnóstico. Informe que avaliação técnica é feita antes da confirmação de valor.',
      horarios: 'Segunda a sexta: 08:00 às 18:00\nSábado: 08:00 às 12:00',
      orientacoesGerais:
        'Pergunte modelo/ano do veículo e sintoma principal.\nConduza para agendamento de avaliação técnica ou revisão.',
      orientacoesFollowUp:
        'Retome sintoma citado e ofereça horário para diagnóstico com prazo curto.',
      instrucoesSugestoesLeadsClientes:
        'Interesse em levar veículo: em_processo.\nSem resposta: aumentar intervalo entre contatos.\nRecusa: inativo.'
    }
  },
  {
    id: 'advocacia',
    label: 'Advocacia',
    description: 'Triagem inicial e agendamento de consulta jurídica.',
    values: {
      empresa:
        'Somos um escritório de advocacia em {{cidade}} com atendimento consultivo e estratégico para pessoas e empresas.',
      descricaoServicosProdutosVendidos:
        'Serviços/produtos:\n- Consultoria jurídica\n- Cível\n- Trabalhista\n- Empresarial\n- Contratos e pareceres\n\nValores e preços:\nHonorários variam conforme complexidade do caso e escopo do atendimento. Sempre alinhar expectativa de consulta inicial.',
      horarios: 'Segunda a sexta: 09:00 às 18:00',
      orientacoesGerais:
        'Nunca prometa resultado jurídico.\nFaça triagem inicial objetiva e conduza para consulta com advogado responsável.',
      orientacoesFollowUp:
        'No follow-up, retome o tema jurídico informado e ofereça horários de consulta.',
      instrucoesSugestoesLeadsClientes:
        'Caso com interesse em consulta: em_processo.\nAguardando documentos: aguardando.\nSem resposta recorrente: espaçar e inativar quando apropriado.'
    }
  }
]

export function getTrainingVerticalTemplate(id: string | null | undefined): TrainingVerticalTemplate | null {
  const safeId = typeof id === 'string' ? id.trim() : ''
  if (!safeId) {
    return null
  }
  return TRAINING_VERTICAL_TEMPLATES.find((template) => template.id === safeId) ?? null
}
