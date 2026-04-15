import type { Server as HttpServer } from 'http'
import QRCode from 'qrcode'
import { Server, type Socket } from 'socket.io'
import type { AppEnv } from './config/env'
import type { SessionEventBus, SessionManager, SessionStatusSnapshot, SessionStatusStore } from './sessions'

type SocketServerDeps = {
  httpServer: HttpServer
  env: AppEnv
  sessionManager: SessionManager
  eventBus: SessionEventBus
  statusStore?: SessionStatusStore
}

type CachedQr = {
  dataUrl: string
  generatedAt: number
}

type SocketWithUser = Socket & { data: { userId?: string } }

export function createSocketServer(deps: SocketServerDeps) {
  const allowedOrigins = parseAllowedOrigins(deps.env.ALLOWED_ORIGINS)
  const io = new Server(deps.httpServer, {
    cors: {
      origin: allowedOrigins ?? true,
      credentials: true
    },
    transports: ['websocket'],
    allowEIO3: true,
    pingInterval: 25000,
    pingTimeout: 60000
  })

  const qrCache = new Map<string, CachedQr>()

  io.use((socket, next) => {
    const userId = normalizeUserId(socket.handshake.query.userId)
    if (!userId) {
      return next(new Error('userId_missing'))
    }

    ;(socket as SocketWithUser).data.userId = userId
    return next()
  })

  io.on('connection', (socket) => {
    const userId = (socket as SocketWithUser).data.userId
    if (!userId) {
      socket.disconnect()
      return
    }

    socket.join(userId)
    socket.emit('socket-connected', { message: 'Socket conectado com sucesso' })

    const unsubscribe = deps.eventBus.addSubscriber(userId, (event, data) => {
      if (event === 'qr') {
        void handleQrEvent(userId, data, socket, qrCache)
        return
      }

      if (event === 'status') {
        handleStatusEvent(userId, data, socket, qrCache)
      }
    })

    const cached = qrCache.get(userId)
    if (cached) {
      socket.emit('qr', cached.dataUrl)
    }

    void sendInitialStatus(userId, deps.statusStore, deps.sessionManager, socket, qrCache)

    socket.on('start-session', async () => {
      try {
        const snapshot = await deps.sessionManager.startSession(userId)
        handleStatusSnapshot(socket, snapshot, qrCache)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        socket.emit('error', message)
      }
    })

    socket.on('logout', async () => {
      try {
        const snapshot = await deps.sessionManager.stopSession(userId, 'logout')
        handleStatusSnapshot(socket, snapshot, qrCache)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        socket.emit('error', message)
      }
    })

    socket.on('disconnect', () => {
      unsubscribe()
    })
  })

  return io
}

function parseAllowedOrigins(value?: string) {
  if (!value) {
    return undefined
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)

  return origins.length > 0 ? origins : undefined
}

function normalizeUserId(value: unknown) {
  if (Array.isArray(value)) {
    return value[0]?.toString().trim()
  }
  if (typeof value === 'string') {
    return value.trim()
  }
  if (value == null) {
    return undefined
  }
  return String(value).trim()
}

function handleStatusEvent(
  userId: string,
  data: unknown,
  socket: Socket,
  qrCache: Map<string, CachedQr>
) {
  const snapshot = data as SessionStatusSnapshot
  if (!snapshot?.status) {
    return
  }

  handleStatusSnapshot(socket, snapshot, qrCache)
}

function handleStatusSnapshot(socket: Socket, snapshot: SessionStatusSnapshot, qrCache: Map<string, CachedQr>) {
  switch (snapshot.status) {
    case 'starting':
      if (snapshot.reason === 'restart-required') {
        socket.emit('logging-in')
      }
      break
    case 'connected':
      socket.emit('connected', { sessionId: snapshot.sessionId })
      break
    case 'stopped':
    case 'idle':
      qrCache.delete(snapshot.sessionId)
      socket.emit('disconnected')
      break
    case 'error':
      qrCache.delete(snapshot.sessionId)
      socket.emit('error', snapshot.reason ?? 'session-error')
      socket.emit('disconnected')
      break
    case 'backoff':
      socket.emit('error', snapshot.reason ?? 'session-backoff')
      break
    default:
      break
  }
}

async function handleQrEvent(
  userId: string,
  data: unknown,
  socket: Socket,
  qrCache: Map<string, CachedQr>
) {
  const payload = data as { qr?: string; generatedAt?: number }
  if (!payload?.qr) {
    return
  }

  try {
    const dataUrl = await toQrDataUrl(payload.qr)
    qrCache.set(userId, {
      dataUrl,
      generatedAt: payload.generatedAt ?? Date.now()
    })
    socket.emit('qr', dataUrl)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    socket.emit('error', message)
  }
}

async function toQrDataUrl(raw: string) {
  if (raw.startsWith('data:image/')) {
    return raw
  }

  return QRCode.toDataURL(raw, {
    margin: 1,
    width: 280
  })
}

async function sendInitialStatus(
  userId: string,
  statusStore: SessionStatusStore | undefined,
  sessionManager: SessionManager,
  socket: Socket,
  qrCache: Map<string, CachedQr>
) {
  const snapshot = sessionManager.getSessionStatus(userId) ?? (await statusStore?.getStatus(userId))
  if (snapshot) {
    handleStatusSnapshot(socket, snapshot, qrCache)
  }
}
