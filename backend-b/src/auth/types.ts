export type AuthStatePayload = Record<string, unknown>

export interface AuthStateStore {
  get(sessionId: string): Promise<AuthStatePayload | null>
  set(sessionId: string, state: AuthStatePayload): Promise<void>
  delete(sessionId: string): Promise<void>
}
