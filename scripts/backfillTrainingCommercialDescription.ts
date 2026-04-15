import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app'
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore'
import type { ServiceAccount } from 'firebase-admin'
import { normalizeTrainingInstructions, type TrainingInstructions } from '../lib/training/schema'

type CliArgs = {
  apply: boolean
  uid: string | null
  limit: number | null
}

type Stats = {
  usersScanned: number
  trainingDocsScanned: number
  trainingDocsChanged: number
  versionDocsScanned: number
  versionDocsChanged: number
  writesPrepared: number
  writesApplied: number
  samples: string[]
}

const SNAPSHOT_CONTEXT_DEFAULT = 20
const SNAPSHOT_CONTEXT_MIN = 10
const SNAPSHOT_CONTEXT_MAX = 100
const SNAPSHOT_INSTRUCTION_KEY_ORDER: Array<keyof TrainingInstructions> = [
  'language',
  'nomeEmpresa',
  'nomeIA',
  'seApresentarComoIA',
  'comportamentoNãoSabe',
  'mensagemEncaminharHumano',
  'tipoResposta',
  'usarEmojis',
  'usarAgendaAutomatica',
  'orientacoesFollowUp',
  'desligarMensagemForaContexto',
  'desligarIASeUltimasDuasMensagensNãoRecebidas',
  'desligarIASeHumanoRecente',
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

async function main() {
  loadEnvFile(path.resolve(process.cwd(), '.env.local'))
  const args = parseArgs(process.argv.slice(2))
  const db = getFirestore(ensureAdminApp())
  const stats: Stats = {
    usersScanned: 0,
    trainingDocsScanned: 0,
    trainingDocsChanged: 0,
    versionDocsScanned: 0,
    versionDocsChanged: 0,
    writesPrepared: 0,
    writesApplied: 0,
    samples: []
  }

  const userRefs = await resolveUserRefs(db, args)
  for (const userRef of userRefs) {
    stats.usersScanned += 1
    const trainingRef = userRef.collection('settings').doc('ai_training')
    const trainingSnap = await trainingRef.get()

    if (!trainingSnap.exists) {
      continue
    }

    stats.trainingDocsScanned += 1
    const trainingData = toRecord(trainingSnap.data())
    if (!trainingData) {
      continue
    }
    const rawInstructions = toRecord(trainingData.instructions)

    if (rawInstructions) {
      const normalizedInstructions = normalizeTrainingInstructions(rawInstructions)
      if (!stableEqual(rawInstructions, normalizedInstructions)) {
        stats.trainingDocsChanged += 1
        stats.writesPrepared += 1
        rememberSample(stats, trainingRef.path)
        if (args.apply) {
          await trainingRef.update({
            instructions: normalizedInstructions,
            updatedAt: FieldValue.serverTimestamp()
          })
          stats.writesApplied += 1
        }
      }
    }

    const versionsSnap = await trainingRef.collection('versions').get()
    for (const versionDoc of versionsSnap.docs) {
      stats.versionDocsScanned += 1
      const versionData = toRecord(versionDoc.data())
      if (!versionData) {
        continue
      }
      const rawVersionInstructions = toRecord(versionData.instructions)
      if (!rawVersionInstructions) {
        continue
      }

      const normalizedInstructions = normalizeTrainingInstructions(rawVersionInstructions)
      const nextSnapshotKey = buildSnapshotKey(
        typeof versionData.model === 'string' ? versionData.model : 'openai',
        normalizedInstructions,
        versionData.contextMaxMessages
      )

      const shouldUpdate =
        !stableEqual(rawVersionInstructions, normalizedInstructions) ||
        versionData.snapshotKey !== nextSnapshotKey

      if (!shouldUpdate) {
        continue
      }

      stats.versionDocsChanged += 1
      stats.writesPrepared += 1
      rememberSample(stats, versionDoc.ref.path)
      if (args.apply) {
        await versionDoc.ref.update({
          instructions: normalizedInstructions,
          snapshotKey: nextSnapshotKey
        })
        stats.writesApplied += 1
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        apply: args.apply,
        uid: args.uid,
        limit: args.limit,
        ...stats
      },
      null,
      2
    )
  )
}

async function resolveUserRefs(db: Firestore, args: CliArgs) {
  if (args.uid) {
    return [db.collection('users').doc(args.uid)]
  }

  const usersSnap = await db.collection('users').select().get()
  return args.limit ? usersSnap.docs.slice(0, args.limit).map((doc) => doc.ref) : usersSnap.docs.map((doc) => doc.ref)
}

function parseArgs(argv: string[]): CliArgs {
  let apply = false
  let uid: string | null = null
  let limit: number | null = null

  const nextValue = (index: number) => {
    const value = argv[index + 1]
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? ''
    if (!arg.trim()) {
      continue
    }

    if (arg === '--apply') {
      apply = true
      continue
    }
    if (arg === '--dry-run') {
      apply = false
      continue
    }

    if (arg.startsWith('--uid=')) {
      uid = normalizeArgString(arg.slice('--uid='.length))
      continue
    }
    if (arg === '--uid') {
      uid = normalizeArgString(nextValue(index))
      index += 1
      continue
    }

    if (arg.startsWith('--limit=')) {
      limit = normalizePositiveInt(arg.slice('--limit='.length))
      continue
    }
    if (arg === '--limit') {
      limit = normalizePositiveInt(nextValue(index))
      index += 1
      continue
    }
  }

  return { apply, uid, limit }
}

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return
  }

  const content = readFileSync(filePath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    if (!key || process.env[key] !== undefined) {
      continue
    }

    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function ensureAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0]!
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim()
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is required')
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>
  const serviceAccount: ServiceAccount = {
    projectId: getString(parsed.projectId) ?? getString(parsed.project_id) ?? '',
    clientEmail: getString(parsed.clientEmail) ?? getString(parsed.client_email) ?? '',
    privateKey: (getString(parsed.privateKey) ?? getString(parsed.private_key) ?? '').replace(
      /\\n/g,
      '\n'
    )
  }

  if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error('invalid_FIREBASE_SERVICE_ACCOUNT')
  }

  return initializeApp({
    credential: cert(serviceAccount)
  })
}

function buildSnapshotKey(
  model: string,
  instructions: TrainingInstructions,
  contextMaxMessages: unknown
): string {
  const normalizedInstructions = normalizeTrainingInstructions(instructions)
  const orderedInstructions: Record<string, unknown> = {}

  for (const key of SNAPSHOT_INSTRUCTION_KEY_ORDER) {
    if (key === 'followUpAutomatico') {
      const followUp = toRecord(normalizedInstructions.followUpAutomatico)
      orderedInstructions[key] = {
        enabled: typeof followUp?.enabled === 'boolean' ? followUp.enabled : false,
        allowClients: typeof followUp?.allowClients === 'boolean' ? followUp.allowClients : false
      }
      continue
    }

    if (key === 'comportamentoNãoSabe') {
      orderedInstructions[key] =
        normalizedInstructions.comportamentoNãoSabe === 'silêncio'
          ? 'silencio'
          : normalizedInstructions.comportamentoNãoSabe
      continue
    }

    orderedInstructions[key] = normalizedInstructions[key]
  }

  const payload: Record<string, unknown> = {
    v: 1,
    model
  }

  const normalizedContext = normalizeContextMaxMessages(contextMaxMessages)
  if (normalizedContext !== SNAPSHOT_CONTEXT_DEFAULT) {
    payload.contextMaxMessages = normalizedContext
  }
  payload.instructions = orderedInstructions
  return JSON.stringify(payload)
}

function normalizeContextMaxMessages(value: unknown) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    return SNAPSHOT_CONTEXT_DEFAULT
  }
  if (numeric < SNAPSHOT_CONTEXT_MIN) {
    return SNAPSHOT_CONTEXT_MIN
  }
  if (numeric > SNAPSHOT_CONTEXT_MAX) {
    return SNAPSHOT_CONTEXT_MAX
  }
  return numeric
}

function stableEqual(left: unknown, right: unknown) {
  return stableSerialize(left) === stableSerialize(right)
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function rememberSample(stats: Stats, pathValue: string) {
  if (stats.samples.length < 20) {
    stats.samples.push(pathValue)
  }
}

function normalizeArgString(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizePositiveInt(value: string | null | undefined) {
  const normalized = normalizeArgString(value)
  if (!normalized || !/^\d+$/.test(normalized)) {
    return null
  }
  const numeric = Number(normalized)
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : null
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
