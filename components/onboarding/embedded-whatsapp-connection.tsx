'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { AlertCircle, CheckCircle2, Loader2, QrCode, RefreshCw, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getBackendUrl } from '@/lib/backendUrl'
import { cn } from '@/lib/utils'

type ConnectionStatus = 'idle' | 'loading' | 'qr' | 'logging-in' | 'connected' | 'error'

type EmbeddedWhatsappConnectionProps = {
  sessionId: string
  isConnected: boolean
  onConnected?: () => void
  tr: (pt: string, en: string) => string
  className?: string
}

export function EmbeddedWhatsappConnection(props: EmbeddedWhatsappConnectionProps) {
  const { className, isConnected, onConnected, sessionId, tr } = props
  const [status, setStatus] = useState<ConnectionStatus>(isConnected ? 'connected' : 'idle')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [deviceInfo, setDeviceInfo] = useState<any>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isQrRequestPending, setIsQrRequestPending] = useState(false)
  const [socket, setSocket] = useState<Socket | null>(null)
  const qrRequestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const QR_REQUEST_TIMEOUT_MS = 30000

  const clearQrRequestTimeout = useCallback(() => {
    if (qrRequestTimeoutRef.current) {
      clearTimeout(qrRequestTimeoutRef.current)
      qrRequestTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (isConnected) {
      setStatus('connected')
      setQrCode(null)
      setErrorMessage(null)
      setIsQrRequestPending(false)
    } else if (status === 'connected') {
      setStatus('idle')
      setDeviceInfo(null)
    }
  }, [isConnected, status])

  useEffect(() => {
    if (!sessionId) {
      return
    }

    const backendUrl = getBackendUrl({
      productionFallback: 'https://backend-b-production.up.railway.app',
      developmentFallback: 'http://localhost:3002'
    })

    let activeSocket: Socket | null = null
    let socketInitialized = false

    const initializeSocket = () => {
      const nextSocket = io(backendUrl, {
        autoConnect: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        query: { userId: sessionId },
        transports: ['websocket'],
        withCredentials: true,
        timeout: 20000,
        forceNew: true,
        upgrade: true
      })

      nextSocket.on('connect', () => {
        setErrorMessage(null)
        setTimeout(() => {
          setStatus((currentStatus) => (currentStatus === 'loading' ? 'idle' : currentStatus))
        }, 3000)
      })

      nextSocket.on('reconnect_failed', () => {
        setStatus('error')
      })

      nextSocket.on('connect_error', (error: Error | string) => {
        const message = typeof error === 'string' ? error : error instanceof Error ? error.message : String(error)
        if (message.includes('websocket error') || message.includes('TransportError')) {
          return
        }
        setErrorMessage(message)
      })

      nextSocket.on('qr', (base64Qr: string) => {
        clearQrRequestTimeout()
        setIsQrRequestPending(false)
        setStatus('qr')
        setQrCode(base64Qr)
        setErrorMessage(null)
      })

      nextSocket.on('logging-in', () => {
        clearQrRequestTimeout()
        setIsQrRequestPending(false)
        setStatus('logging-in')
        setQrCode(null)
        setErrorMessage(null)
      })

      nextSocket.on('connected', (info: any) => {
        clearQrRequestTimeout()
        setIsQrRequestPending(false)
        setStatus('connected')
        setDeviceInfo(info)
        setQrCode(null)
        setErrorMessage(null)
        onConnected?.()
      })

      nextSocket.on('disconnected', () => {
        clearQrRequestTimeout()
        setIsQrRequestPending(false)
        setStatus('idle')
        setQrCode(null)
        setDeviceInfo(null)
        setErrorMessage(null)
      })

      nextSocket.on('error', (error: Error | string) => {
        const message = typeof error === 'string' ? error : error instanceof Error ? error.message : String(error)
        clearQrRequestTimeout()
        setIsQrRequestPending(false)
        setErrorMessage(message)
        setStatus('error')
      })

      setSocket(nextSocket)
      activeSocket = nextSocket
    }

    fetch(`${backendUrl}/health`)
      .then(() => {
        if (!socketInitialized) {
          initializeSocket()
          socketInitialized = true
        }
      })
      .catch(() => {
        if (!socketInitialized) {
          initializeSocket()
          socketInitialized = true
        }
      })

    return () => {
      clearQrRequestTimeout()
      if (activeSocket) {
        activeSocket.close()
      }
      setSocket(null)
    }
  }, [clearQrRequestTimeout, onConnected, sessionId])

  const startConnection = useCallback(() => {
    if (!socket) {
      return
    }

    setStatus('loading')
    setErrorMessage(null)
    setQrCode(null)
    setIsQrRequestPending(true)
    clearQrRequestTimeout()
    qrRequestTimeoutRef.current = setTimeout(() => {
      setIsQrRequestPending(false)
      setStatus('error')
      setErrorMessage(tr('Não foi possível iniciar a sessão. Tente novamente.', 'Could not start the session. Please try again.'))
    }, QR_REQUEST_TIMEOUT_MS)

    socket.connect()
    socket.emit('start-session')
  }, [QR_REQUEST_TIMEOUT_MS, clearQrRequestTimeout, socket, tr])

  const disconnectDevice = useCallback(() => {
    socket?.emit('logout')
  }, [socket])

  return (
    <div className={cn('rounded-[28px] border border-surface-lighter bg-surface-light p-6 shadow-sm', className)}>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Smartphone className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">WhatsApp Web</h3>
          <p className="text-sm text-gray-400">{tr('Conexão oficial via QR Code', 'Official QR Code connection')}</p>
        </div>
      </div>

      <div className="rounded-[24px] border border-surface-lighter bg-surface p-5">
        {status === 'idle' ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-surface-lighter">
              <QrCode className="h-10 w-10 text-gray-500" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{tr('Pronto para conectar?', 'Ready to connect?')}</p>
              <p className="mt-1 text-sm text-gray-400">
                {tr('Gere um QR Code e leia pelo WhatsApp do celular.', 'Generate a QR Code and scan it from WhatsApp on your phone.')}
              </p>
            </div>
            <Button onClick={startConnection} disabled={isQrRequestPending} className="w-full">
              {tr('Gerar QR Code', 'Generate QR Code')}
            </Button>
          </div>
        ) : null}

        {status === 'loading' ? (
          <div className="space-y-4 py-8 text-center">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <div>
              <p className="text-lg font-semibold text-white">{tr('Iniciando sessão...', 'Starting session...')}</p>
              <p className="mt-1 text-sm text-gray-400">
                {tr('Estamos preparando sua instância para gerar o QR Code.', 'We are preparing your instance to generate the QR Code.')}
              </p>
            </div>
          </div>
        ) : null}

        {status === 'qr' && qrCode ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-fit rounded-2xl bg-white p-4">
              <Image src={qrCode} alt="WhatsApp QR Code" width={256} height={256} unoptimized className="h-64 w-64 grayscale contrast-[1.1]" />
            </div>
            <div className="flex items-center justify-center gap-2 text-primary">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm font-medium">{tr('Aguardando leitura...', 'Waiting for scan...')}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={startConnection} disabled={isQrRequestPending} className="text-gray-300">
              {tr('Gerar novo código', 'Generate new code')}
            </Button>
          </div>
        ) : null}

        {status === 'logging-in' ? (
          <div className="space-y-4 py-8 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/20">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{tr('Autenticado!', 'Authenticated!')}</p>
              <p className="mt-1 text-sm text-gray-400">
                {tr('Sincronizando suas conversas. Isso pode levar alguns segundos.', 'Syncing your conversations. This may take a few seconds.')}
              </p>
            </div>
          </div>
        ) : null}

        {status === 'connected' ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{tr('Conectado com sucesso!', 'Connected successfully!')}</p>
              <p className="mt-1 text-sm text-gray-400">
                {tr('Seu número já pode ser usado na etapa final de publicação.', 'Your number is now ready for the publish step.')}
              </p>
            </div>
            {(deviceInfo?.host?.device_manufacturer || deviceInfo?.host?.device_model || deviceInfo?.wid) && (
              <div className="space-y-1 rounded-2xl bg-surface-lighter p-4 text-left text-sm text-gray-200">
                {(deviceInfo?.host?.device_manufacturer || deviceInfo?.host?.device_model) && (
                  <p>
                    <span className="text-gray-400">{tr('Aparelho', 'Device')}:</span>{' '}
                    {deviceInfo?.host?.device_manufacturer} {deviceInfo?.host?.device_model}
                  </p>
                )}
                {deviceInfo?.wid ? (
                  <p>
                    <span className="text-gray-400">{tr('Número', 'Number')}:</span> {String(deviceInfo.wid).split('@')[0]}
                  </p>
                ) : null}
              </div>
            )}
            <Button variant="outline" onClick={disconnectDevice} className="w-full border-red-400/20 text-red-400 hover:bg-red-500/10">
              {tr('Desconectar aparelho', 'Disconnect device')}
            </Button>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="space-y-4 py-6 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20">
              <AlertCircle className="h-10 w-10 text-red-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{tr('Erro na conexão', 'Connection error')}</p>
              <p className="mt-1 text-sm text-gray-400">
                {tr('Não foi possível gerar o QR Code. Tente novamente em instantes.', 'Could not generate the QR Code. Please try again shortly.')}
              </p>
            </div>
            {errorMessage ? (
              <div className="rounded-2xl border border-surface-lighter bg-surface-lighter/60 p-3 text-left text-xs text-gray-300">
                {errorMessage}
              </div>
            ) : null}
            <Button onClick={startConnection} variant="outline" className="w-full" disabled={isQrRequestPending}>
              {tr('Tentar novamente', 'Try again')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
