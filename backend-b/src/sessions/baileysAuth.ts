import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
  SignalDataSet,
  SignalKeyStore
} from '@whiskeysockets/baileys'
import type { AuthStatePayload, AuthStateStore } from '../auth'
import { loadBaileys } from './baileysModule'

type BufferJson = {
  replacer: (key: string, value: unknown) => unknown
  reviver: (key: string, value: unknown) => unknown
}

type StoredAuthState = {
  creds: AuthenticationCreds
  keys: Record<string, Record<string, unknown>>
}

export async function buildBaileysAuthState(
  sessionId: string,
  store: AuthStateStore
): Promise<{ state: AuthenticationState; saveState: () => Promise<void> }> {
  const baileys = await loadBaileys()
  const { BufferJSON, initAuthCreds } = baileys
  const stored = await store.get(sessionId)
  const restored = stored ? reviveState(stored, BufferJSON) : null
  const state: StoredAuthState = restored ?? { creds: initAuthCreds(), keys: {} }

  if (!state.creds) {
    state.creds = initAuthCreds()
  }
  if (!state.keys) {
    state.keys = {}
  }

  const keyStore: SignalKeyStore = {
    get: async (type, ids) => {
      const bucket = (state.keys[type] ?? {}) as Record<string, SignalDataTypeMap[typeof type]>
      const out: Record<string, SignalDataTypeMap[typeof type]> = {}
      for (const id of ids) {
        const value = bucket[id]
        if (value) {
          out[id] = value
        }
      }
      return out
    },
    set: async (data: SignalDataSet) => {
      for (const [rawType, entries] of Object.entries(data)) {
        if (!entries) {
          continue
        }
        const type = rawType as keyof SignalDataTypeMap
        const bucket = (state.keys[type] ?? {}) as Record<string, SignalDataTypeMap[typeof type]>
        for (const [id, value] of Object.entries(entries)) {
          if (!value) {
            delete bucket[id]
          } else {
            bucket[id] = value as SignalDataTypeMap[typeof type]
          }
        }
        state.keys[type] = bucket as Record<string, unknown>
      }

      await saveState()
    }
  }

  const saveState = async () => {
    const payload = toPayload(state, BufferJSON)
    await store.set(sessionId, payload)
  }

  return {
    state: {
      creds: state.creds,
      keys: keyStore
    },
    saveState
  }
}

function reviveState(payload: AuthStatePayload, bufferJson: BufferJson): StoredAuthState | null {
  try {
    return JSON.parse(JSON.stringify(payload), bufferJson.reviver) as StoredAuthState
  } catch {
    return null
  }
}

function toPayload(state: StoredAuthState, bufferJson: BufferJson): AuthStatePayload {
  return JSON.parse(JSON.stringify(state, bufferJson.replacer)) as AuthStatePayload
}
