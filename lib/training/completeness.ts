export type TrainingCompletenessFieldKey =
  | 'nomeEmpresa'
  | 'nomeIA'
  | 'tipoResposta'
  | 'empresa'
  | 'descricaoServicosProdutosVendidos'
  | 'horarios'
  | 'orientacoesGerais'
  | 'orientacoesFollowUp'
  | 'instrucoesSugestoesLeadsClientes'

export type TrainingCompletenessFieldBreakdown = {
  key: TrainingCompletenessFieldKey
  weight: number
  minLength: number
  currentLength: number
  completeness: 0 | 0.5 | 1
  contribution: number
  status: 'empty' | 'partial' | 'complete'
}

export type TrainingCompletenessBreakdown = {
  score: number
  maxScore: number
  fields: Record<TrainingCompletenessFieldKey, TrainingCompletenessFieldBreakdown>
  missingOrPartial: TrainingCompletenessFieldKey[]
}

type Rule = {
  key: TrainingCompletenessFieldKey
  weight: number
  minLength: number
}

const RULES: Rule[] = [
  { key: 'nomeEmpresa', weight: 8, minLength: 3 },
  { key: 'nomeIA', weight: 4, minLength: 2 },
  { key: 'tipoResposta', weight: 6, minLength: 50 },
  { key: 'empresa', weight: 14, minLength: 120 },
  { key: 'descricaoServicosProdutosVendidos', weight: 26, minLength: 200 },
  { key: 'horarios', weight: 8, minLength: 20 },
  { key: 'orientacoesGerais', weight: 14, minLength: 180 },
  { key: 'orientacoesFollowUp', weight: 10, minLength: 80 },
  { key: 'instrucoesSugestoesLeadsClientes', weight: 10, minLength: 120 }
]

const EMPTY_TEXT = ''

export function computeTrainingCompleteness(training: unknown): TrainingCompletenessBreakdown {
  const source =
    training && typeof training === 'object' && !Array.isArray(training)
      ? (training as Record<string, unknown>)
      : {}

  let total = 0
  const fields = {} as Record<TrainingCompletenessFieldKey, TrainingCompletenessFieldBreakdown>

  for (const rule of RULES) {
    const value = typeof source[rule.key] === 'string' ? String(source[rule.key]).trim() : EMPTY_TEXT
    const length = value.length
    const completeness: 0 | 0.5 | 1 = length <= 0 ? 0 : length >= rule.minLength ? 1 : 0.5
    const contribution = roundScore(rule.weight * completeness)
    total += contribution

    fields[rule.key] = {
      key: rule.key,
      weight: rule.weight,
      minLength: rule.minLength,
      currentLength: length,
      completeness,
      contribution,
      status: completeness === 1 ? 'complete' : completeness === 0.5 ? 'partial' : 'empty'
    }
  }

  const score = roundScore(total)
  const missingOrPartial = RULES.map((rule) => rule.key).filter((key) => fields[key].completeness < 1)

  return {
    score,
    maxScore: 100,
    fields,
    missingOrPartial
  }
}

function roundScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  const clamped = Math.max(0, Math.min(100, value))
  return Math.round(clamped * 10) / 10
}
