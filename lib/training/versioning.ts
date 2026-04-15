import type { Firestore } from 'firebase/firestore'
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot
} from 'firebase/firestore'
import {
  normalizeTrainingInstructions,
  type TrainingInstructions as SchemaTrainingInstructions
} from './schema'

export type AIModel = 'openai' | 'google' | 'x'
export type TrainingLanguage = 'pt-BR' | 'en'

export const TRAINING_CONTEXT_MAX_MESSAGES_DEFAULT = 20
export const TRAINING_CONTEXT_MAX_MESSAGES_MIN = 10
export const TRAINING_CONTEXT_MAX_MESSAGES_MAX = 100

export type TrainingFollowUpAutomaticConfig = {
  enabled: boolean
  allowClients: boolean
}

export type TrainingInstructions = Omit<SchemaTrainingInstructions, 'comportamentoNãoSabe'> & {
  comportamentoNãoSabe: SchemaTrainingInstructions['comportamentoNãoSabe'] | 'silencio'
}

export type TrainingSnapshot = {
  model: AIModel
  instructions: TrainingInstructions
  contextMaxMessages: number
}

export type TrainingVersionReason = 'manual' | 'autosave_checkpoint' | 'revert' | 'baseline'

export type TrainingVersionMeta = {
  revertedFromVersionId?: string
  client?: {
    userAgent?: string
  }
  [key: string]: unknown
}

export type TrainingVersionDoc = {
  id: string
  createdAtMs: number
  reason: TrainingVersionReason
  model: AIModel
  instructions: TrainingInstructions
  contextMaxMessages?: number
  snapshotKey: string
  meta?: TrainingVersionMeta
}

const INSTRUCTION_KEY_ORDER: (keyof TrainingInstructions)[] = [
  'language',
  'nomeEmpresa',
  'nomeIA',
  'seApresentarComoIA',
  'comportamentoNãoSabe',
  'mensagemEncaminharHumano',
  'permitirIATextoPersonalizadoAoEncaminharHumano',
  'tipoResposta',
  'usarEmojis',
  'usarAgendaAutomatica',
  'orientacoesFollowUp',
  'desligarMensagemForaContexto',
  'desligarIASeUltimasDuasMensagensNãoRecebidas',
  'desligarIASeHumanoRecente',
  'desligarIASeHumanoRecenteUsarDias',
  'desligarIASeHumanoRecenteUsarMensagens',
  'desligarIASeHumanoRecenteDias',
  'desligarIASeHumanoRecenteMensagens',
  'responderClientes',
  'autoClassificarLeadComoCliente',
  'permitirSugestoesCamposLeadsClientes',
  'aprovarAutomaticamenteSugestoesLeadsClientes',
  'instrucoesSugestoesLeadsClientes',
  'permitirIAEnviarArquivos',
  'permitirIAOuvirAudios',
  'permitirIALerImagensEPdfs',
  'responderGrupos',
  'esconderGrupos',
  'orientacoesGerais',
  'empresa',
  'descricaoServicosProdutosVendidos',
  'horarios',
  'outros',
  'followUpAutomatico'
]

function normalizeContextMaxMessages(value: unknown): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return TRAINING_CONTEXT_MAX_MESSAGES_DEFAULT
  }

  if (num < TRAINING_CONTEXT_MAX_MESSAGES_MIN) return TRAINING_CONTEXT_MAX_MESSAGES_MIN
  if (num > TRAINING_CONTEXT_MAX_MESSAGES_MAX) return TRAINING_CONTEXT_MAX_MESSAGES_MAX
  return num
}

export function buildSnapshotKey(
  model: AIModel,
  instructions: TrainingInstructions,
  contextMaxMessages: number = TRAINING_CONTEXT_MAX_MESSAGES_DEFAULT
): string {
  const normalizedInstructions = normalizeTrainingInstructions(instructions)
  const orderedInstructions: Record<string, unknown> = {}
  for (const key of INSTRUCTION_KEY_ORDER) {
    if (key === 'followUpAutomatico') {
      orderedInstructions[key] = normalizeFollowUpAutomaticForSnapshot((normalizedInstructions as any)[key])
      continue
    }
    if (key === 'comportamentoNãoSabe') {
      const comportamento =
        normalizedInstructions.comportamentoNãoSabe === 'silêncio'
          ? 'silencio'
          : normalizedInstructions.comportamentoNãoSabe
      orderedInstructions[key] = comportamento
      continue
    }
    orderedInstructions[key] = normalizedInstructions[key]
  }

  const normalizedContext = normalizeContextMaxMessages(contextMaxMessages)
  const payload: Record<string, unknown> = { v: 1, model }
  if (normalizedContext !== TRAINING_CONTEXT_MAX_MESSAGES_DEFAULT) {
    payload.contextMaxMessages = normalizedContext
  }
  payload.instructions = orderedInstructions
  return JSON.stringify(payload)
}

export function isSameSnapshot(aKey: string, bKey: string): boolean {
  return aKey === bKey
}

function versionsCollection(db: Firestore, uid: string) {
  return collection(db, 'users', uid, 'settings', 'ai_training', 'versions')
}

function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object') {
    const asAny = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number }
    if (typeof asAny.toMillis === 'function') return asAny.toMillis()
    if (typeof asAny.seconds === 'number') {
      const nanos = typeof asAny.nanoseconds === 'number' ? asAny.nanoseconds : 0
      return asAny.seconds * 1000 + Math.floor(nanos / 1e6)
    }
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function parseVersionDoc(docSnap: QueryDocumentSnapshot<DocumentData>): TrainingVersionDoc | null {
  const data = docSnap.data() as Record<string, unknown>
  const model = data.model
  const reason = data.reason
  const snapshotKey = data.snapshotKey
  const instructions = data.instructions
  const hasContextMaxMessages = Object.prototype.hasOwnProperty.call(data, 'contextMaxMessages')
  const contextMaxMessages = hasContextMaxMessages ? normalizeContextMaxMessages((data as any).contextMaxMessages) : undefined

  const createdAtMs = toMillis(data.createdAtMs) ?? toMillis(data.createdAt) ?? null

  if (!createdAtMs) return null
  if (model !== 'openai' && model !== 'google' && model !== 'x') return null
  if (reason !== 'manual' && reason !== 'autosave_checkpoint' && reason !== 'revert' && reason !== 'baseline') return null
  if (typeof snapshotKey !== 'string' || !snapshotKey) return null
  if (!instructions || typeof instructions !== 'object' || Array.isArray(instructions)) return null

  return {
    id: docSnap.id,
    createdAtMs,
    reason,
    model,
    instructions: normalizeTrainingInstructions(instructions) as TrainingInstructions,
    contextMaxMessages,
    snapshotKey,
    meta: (data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta)) ? (data.meta as TrainingVersionMeta) : undefined
  }
}

function normalizeFollowUpAutomaticForSnapshot(value: unknown): TrainingFollowUpAutomaticConfig {
  const fallback: TrainingFollowUpAutomaticConfig = {
    enabled: false,
    allowClients: false
  }

  const input =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<TrainingFollowUpAutomaticConfig>)
      : {}

  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : fallback.enabled,
    allowClients: typeof input.allowClients === 'boolean' ? input.allowClients : fallback.allowClients
  }
}

export async function listTrainingVersions(db: Firestore, uid: string, limitCount = 50): Promise<TrainingVersionDoc[]> {
  const col = versionsCollection(db, uid)
  const q = query(col, orderBy('createdAtMs', 'desc'), limit(limitCount))
  const snap = await getDocs(q)

  const out: TrainingVersionDoc[] = []
  snap.forEach((docSnap) => {
    const parsed = parseVersionDoc(docSnap)
    if (parsed) {
      out.push(parsed)
    }
  })
  return out
}

export async function createTrainingVersion(
  db: Firestore,
  uid: string,
  snapshot: TrainingSnapshot,
  input: {
    reason: TrainingVersionReason
    meta?: TrainingVersionMeta
  }
): Promise<{ id: string; createdAtMs: number; snapshotKey: string }> {
  const createdAtMs = Date.now()
  const normalizedContext = normalizeContextMaxMessages(snapshot.contextMaxMessages)
  const normalizedInstructions = normalizeTrainingInstructions(snapshot.instructions) as TrainingInstructions
  const snapshotKey = buildSnapshotKey(snapshot.model, normalizedInstructions, normalizedContext)

  const payload: Record<string, unknown> = {
    createdAt: serverTimestamp(),
    createdAtMs,
    reason: input.reason,
    model: snapshot.model,
    instructions: normalizedInstructions,
    snapshotKey,
    ...(normalizedContext !== TRAINING_CONTEXT_MAX_MESSAGES_DEFAULT ? { contextMaxMessages: normalizedContext } : {})
  }

  if (input.meta && typeof input.meta === 'object') {
    payload.meta = input.meta
  }

  const ref = await addDoc(versionsCollection(db, uid), payload)
  return { id: ref.id, createdAtMs, snapshotKey }
}

export async function pruneTrainingVersions(db: Firestore, uid: string, keep = 50): Promise<number> {
  if (keep <= 0) {
    return 0
  }

  const col = versionsCollection(db, uid)
  const keepQuery = query(col, orderBy('createdAtMs', 'desc'), limit(keep))
  const keepSnap = await getDocs(keepQuery)

  if (keepSnap.size < keep) {
    return 0
  }

  const lastKept = keepSnap.docs[keepSnap.docs.length - 1]
  let deleted = 0

  while (true) {
    const restQuery = query(col, orderBy('createdAtMs', 'desc'), startAfter(lastKept), limit(500))
    const restSnap = await getDocs(restQuery)
    if (restSnap.empty) {
      break
    }

    const batch = writeBatch(db)
    restSnap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref)
      deleted += 1
    })
    await batch.commit()
  }

  return deleted
}
