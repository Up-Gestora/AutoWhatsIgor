'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { io, Socket } from 'socket.io-client'
import { auth } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { getBackendUrl } from '@/lib/backendUrl'
import { useI18n } from '@/lib/i18n/client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  GUIDED_TUTORIAL_ROUTE_KEYS,
  GUIDED_TUTORIAL_TITLES,
  getGuidedTutorialNextKey,
  isGuidedTutorialKey,
  markGuidedTutorialCompleted,
  type GuidedTutorialKey,
} from '@/lib/onboarding/guided-tutorials'
import {
  QrCode,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'

type ConnectionStatus = 'idle' | 'loading' | 'qr' | 'logging-in' | 'connected' | 'error'
type GuidedStepTarget = 'qr_block' | 'how_to_connect' | 'important_tip'

type GuidedStep = {
  id: string
  target: GuidedStepTarget
  title: string
  description: string
}

export default function ConexoesPage() {
  const { locale, toRoute } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isEn = locale === 'en'
  const tr = (pt: string, en: string) => (isEn ? en : pt)

  const [status, setStatus] = useState<ConnectionStatus>('loading')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [deviceInfo, setDeviceInfo] = useState<any>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isQrRequestPending, setIsQrRequestPending] = useState(false)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [guidedOpen, setGuidedOpen] = useState(false)
  const [guidedStep, setGuidedStep] = useState(0)
  const [guidedCompletionModalOpen, setGuidedCompletionModalOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)

  const qrRequestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const qrBlockRef = useRef<HTMLDivElement | null>(null)
  const howToConnectRef = useRef<HTMLDivElement | null>(null)
  const importantTipRef = useRef<HTMLDivElement | null>(null)
  const guidedSuppressAutoOpenRef = useRef(false)

  const QR_REQUEST_TIMEOUT_MS = 30000
  const guidedTutorialFromQuery = searchParams.get('guidedTutorial')
  const currentGuidedTutorialKey: GuidedTutorialKey = isGuidedTutorialKey(guidedTutorialFromQuery)
    ? guidedTutorialFromQuery
    : 'connections'
  const nextGuidedTutorialKey = getGuidedTutorialNextKey(currentGuidedTutorialKey)
  const nextGuidedTutorialLabel = nextGuidedTutorialKey
    ? tr(
        GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].pt,
        GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].en
      )
    : null

  useEffect(() => {
    setPortalReady(true)
  }, [])

  const guidedSteps: GuidedStep[] = [
    {
      id: 'how_to_connect',
      target: 'how_to_connect',
      title: tr('Etapa 1: Como conectar', 'Step 1: How to connect'),
      description: tr(
        'Aqui estão os 4 passos práticos para conectar o seu celular.',
        'Here are the 4 practical steps to connect your phone.'
      )
    },
    {
      id: 'qr_block',
      target: 'qr_block',
      title: tr('Etapa 2: QR Code', 'Step 2: QR code'),
      description: tr(
        'Use este bloco para gerar e ler o QR Code do WhatsApp Web.',
        'Use this block to generate and scan the WhatsApp Web QR code.'
      )
    },
    {
      id: 'important_tip',
      target: 'important_tip',
      title: tr('Etapa 3: Dica importante', 'Step 3: Important tip'),
      description: tr(
        'Esta recomendação evita quedas de sessão e falhas na automação.',
        'This recommendation avoids session drops and automation failures.'
      )
    }
  ]
  const lastGuidedStepIndex = guidedSteps.length - 1
  const currentGuidedStep = guidedSteps[guidedStep] ?? guidedSteps[0]

  const resolveGuidedTargetElement = useCallback((target: GuidedStepTarget) => {
    if (target === 'qr_block') return qrBlockRef.current
    if (target === 'how_to_connect') return howToConnectRef.current
    return importantTipRef.current
  }, [])

  const closeGuidedOnboarding = useCallback(() => {
    guidedSuppressAutoOpenRef.current = true
    setGuidedOpen(false)
    setGuidedStep(0)
    setGuidedCompletionModalOpen(false)
    const query = new URLSearchParams(searchParams.toString())
    if (query.has('guidedOnboarding')) {
      query.delete('guidedOnboarding')
    }
    if (query.has('guidedTutorial')) {
      query.delete('guidedTutorial')
    }
    const queryString = query.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname)
  }, [pathname, router, searchParams])

  const goToPreviousGuidedStep = useCallback(() => {
    setGuidedStep((current) => Math.max(0, current - 1))
  }, [])

  const goToNextGuidedStep = useCallback(() => {
    setGuidedStep((current) => Math.min(lastGuidedStepIndex, current + 1))
  }, [lastGuidedStepIndex])

  const isGuidedTargetActive = useCallback(
    (target: GuidedStepTarget) => guidedOpen && currentGuidedStep?.target === target,
    [currentGuidedStep?.target, guidedOpen]
  )

  const finishGuidedTutorial = useCallback(() => {
    if (userId) {
      markGuidedTutorialCompleted(userId, currentGuidedTutorialKey)
    }
    setGuidedCompletionModalOpen(true)
  }, [currentGuidedTutorialKey, userId])

  const goToNextGuidedTutorial = useCallback(() => {
    if (!nextGuidedTutorialKey) {
      closeGuidedOnboarding()
      return
    }

    setGuidedCompletionModalOpen(false)
    setGuidedOpen(false)
    setGuidedStep(0)
    const nextRouteKey = GUIDED_TUTORIAL_ROUTE_KEYS[nextGuidedTutorialKey]
    router.push(
      toRoute(nextRouteKey, {
        query: {
          guidedOnboarding: '1',
          guidedTutorial: nextGuidedTutorialKey,
        },
      })
    )
  }, [closeGuidedOnboarding, nextGuidedTutorialKey, router, toRoute])

  useEffect(() => {
    const shouldOpen = searchParams.get('guidedOnboarding') === '1'
    if (!shouldOpen) {
      guidedSuppressAutoOpenRef.current = false
      return
    }
    if (guidedSuppressAutoOpenRef.current) {
      return
    }
    if (guidedOpen) {
      return
    }

    setGuidedOpen(true)
    setGuidedStep(0)
    setGuidedCompletionModalOpen(false)
  }, [guidedOpen, searchParams])

  useEffect(() => {
    if (!guidedOpen) return

    const activeElement = resolveGuidedTargetElement(currentGuidedStep.target)
    if (!activeElement) return

    activeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest'
    })
  }, [currentGuidedStep.target, guidedOpen, resolveGuidedTargetElement])

  useEffect(() => {
    if (!guidedOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (guidedCompletionModalOpen) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeGuidedOnboarding()
        }
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        closeGuidedOnboarding()
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToPreviousGuidedStep()
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (guidedStep === lastGuidedStepIndex) {
          return
        }
        goToNextGuidedStep()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    closeGuidedOnboarding,
    goToNextGuidedStep,
    goToPreviousGuidedStep,
    guidedCompletionModalOpen,
    guidedOpen,
    guidedStep,
    lastGuidedStepIndex
  ])

  const clearQrRequestTimeout = () => {
    if (qrRequestTimeoutRef.current) {
      clearTimeout(qrRequestTimeoutRef.current)
      qrRequestTimeoutRef.current = null
    }
  }

  useEffect(() => {
    if (!auth) return

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid)
      } else {
        setUserId(null)
      }
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return

    console.log('[Frontend] Initializing socket for userId:', userId)
    const backendUrl = getBackendUrl({
      productionFallback: 'https://backend-b-production.up.railway.app',
      developmentFallback: 'http://localhost:3002'
    })

    let socketInitialized = false
    let activeSocket: Socket | null = null

    fetch(`${backendUrl}/health`)
      .then((res) => {
        if (res.ok) {
          if (!socketInitialized) {
            initializeSocket()
            socketInitialized = true
          }
        } else {
          setStatus('error')
        }
      })
      .catch((err) => {
        console.warn('[Frontend] Backend health check failed:', err?.message)
        if (!socketInitialized) {
          initializeSocket()
          socketInitialized = true
        }
      })

    function initializeSocket() {
      const newSocket = io(backendUrl, {
        autoConnect: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        query: { userId },
        transports: ['websocket'],
        withCredentials: true,
        timeout: 20000,
        forceNew: true,
        upgrade: true
      })

      setupSocketListeners(newSocket)
      setSocket(newSocket)
      activeSocket = newSocket
    }

    function setupSocketListeners(newSocket: Socket) {
      newSocket.on('connect', () => {
        setErrorMessage(null)
        setTimeout(() => {
          setStatus((currentStatus) => (currentStatus === 'loading' ? 'idle' : currentStatus))
        }, 3000)
      })

      newSocket.on('reconnect_failed', () => {
        setStatus('error')
      })

      newSocket.on('connect_error', (error: Error | string) => {
        const message = typeof error === 'string' ? error : error instanceof Error ? error.message : String(error)
        if (message.includes('websocket error') || message.includes('TransportError')) {
          return
        }
        console.log('[Frontend] Socket connect attempt:', message)
      })

      newSocket.on('qr', (base64Qr: string) => {
        clearQrRequestTimeout()
        setIsQrRequestPending(false)
        setStatus('qr')
        setQrCode(base64Qr)
        setErrorMessage(null)
      })

      newSocket.on('logging-in', () => {
        clearQrRequestTimeout()
        setIsQrRequestPending(false)
        setStatus('logging-in')
        setQrCode(null)
        setErrorMessage(null)
      })

      newSocket.on('connected', (info: any) => {
        clearQrRequestTimeout()
        setIsQrRequestPending(false)
        setStatus('connected')
        setDeviceInfo(info)
        setQrCode(null)
        setErrorMessage(null)
      })

      newSocket.on('disconnected', () => {
        clearQrRequestTimeout()
        setIsQrRequestPending(false)
        setStatus('idle')
        setQrCode(null)
        setDeviceInfo(null)
        setErrorMessage(null)
      })

      newSocket.on('error', (err: Error | string) => {
        const message = typeof err === 'string' ? err : err instanceof Error ? err.message : String(err)
        console.warn('[Frontend] Socket error:', message)
        clearQrRequestTimeout()
        setIsQrRequestPending(false)
        setErrorMessage(message)
        setStatus('error')
      })

    }

    setTimeout(() => {
      if (!socketInitialized) {
        initializeSocket()
        socketInitialized = true
      }
    }, 2000)

    return () => {
      if (activeSocket) {
        clearQrRequestTimeout()
        activeSocket.close()
      }
      setSocket(null)
    }
  }, [userId])

  const startConnection = () => {
    if (!socket) return

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
  }

  const disconnectDevice = () => {
    if (!socket) return
    socket.emit('logout')
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-white">{tr('Conexões', 'Connections')}</h1>
        <p className="text-gray-400">{tr('Conecte seu WhatsApp para começar a automatizar seu atendimento.', 'Connect your WhatsApp to start automating your support.')}</p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="rounded-2xl border border-surface-lighter bg-surface-light p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <Smartphone className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">WhatsApp Web</h2>
              <p className="text-sm text-gray-400">{tr('Conexão oficial via QR Code', 'Official connection via QR Code')}</p>
            </div>
          </div>

          <div
            ref={qrBlockRef}
            className={cn(
              'relative flex min-h-[350px] flex-col items-center justify-center overflow-hidden rounded-xl border border-surface-lighter bg-surface p-6 transition-all',
              isGuidedTargetActive('qr_block') && 'z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)]'
            )}
          >
            {status === 'idle' && (
              <div className="space-y-4 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-surface-lighter">
                  <QrCode className="h-10 w-10 text-gray-500" />
                </div>
                <h3 className="font-semibold text-white">{tr('Pronto para conectar?', 'Ready to connect?')}</h3>
                <p className="mx-auto max-w-[220px] text-sm text-gray-400">
                  {tr('Clique no botao abaixo para gerar um novo QR Code.', 'Click the button below to generate a new QR Code.')}
                </p>
                <Button onClick={startConnection} size="lg" className="w-full" disabled={isQrRequestPending}>
                  {tr('Gerar QR Code', 'Generate QR Code')}
                </Button>
              </div>
            )}

            {status === 'loading' && (
              <div className="space-y-4 text-center">
                <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
                <h3 className="font-semibold text-white">{tr('Iniciando sessão...', 'Starting session...')}</h3>
                <p className="text-sm text-gray-400">{tr('Isso pode levar alguns segundos enquanto preparamos sua instancia.', 'This may take a few seconds while we prepare your instance.')}</p>
              </div>
            )}

            {status === 'qr' && qrCode && (
              <div className="space-y-4 text-center">
                <div className="mb-4 rounded-xl bg-white p-4">
                  <img src={qrCode} alt="WhatsApp QR Code" className="mx-auto h-64 w-64 grayscale contrast-[1.1]" />
                </div>
                <div className="flex animate-pulse items-center justify-center gap-2 text-primary">
                  <RefreshCw className="h-4 w-4 animate-spin-slow" />
                  <span className="text-sm font-medium">{tr('Aguardando leitura...', 'Waiting for scan...')}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={startConnection} className="text-gray-400 hover:text-white" disabled={isQrRequestPending}>
                  {tr('Gerar novo código', 'Generate new code')}
                </Button>
              </div>
            )}

            {status === 'logging-in' && (
              <div className="space-y-4 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/20">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-white">{tr('Autenticado!', 'Authenticated!')}</h3>
                <p className="text-sm text-gray-400">
                  {tr('Sincronizando suas conversas...', 'Syncing your conversations...')}
                  <br />
                  {tr('Isso pode levar alguns segundos.', 'This may take a few seconds.')}
                </p>
              </div>
            )}

            {status === 'connected' && (
              <div className="space-y-4 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20">
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                </div>
                <h3 className="text-xl font-semibold text-white">{tr('Conectado com sucesso!', 'Connected successfully!')}</h3>
                {(deviceInfo?.host?.device_manufacturer || deviceInfo?.host?.device_model || deviceInfo?.wid) && (
                  <div className="w-full space-y-1 rounded-lg bg-surface-lighter p-4 text-left">
                    {(deviceInfo?.host?.device_manufacturer || deviceInfo?.host?.device_model) && (
                      <>
                        <p className="text-xs font-bold uppercase text-gray-500">{tr('Aparelho', 'Device')}</p>
                        <p className="mb-2 text-sm font-medium text-white">
                          {deviceInfo?.host?.device_manufacturer} {deviceInfo?.host?.device_model}
                        </p>
                      </>
                    )}
                    {deviceInfo?.wid && (
                      <>
                        <p className="mt-2 text-xs font-bold uppercase text-gray-500">{tr('Número', 'Number')}</p>
                        <p className="text-sm font-medium text-white">{deviceInfo.wid.split('@')[0]}</p>
                      </>
                    )}
                  </div>
                )}
                <Button variant="outline" className="w-full border-red-400/20 text-red-400 hover:bg-red-500/10" onClick={disconnectDevice}>
                  {tr('Desconectar aparelho', 'Disconnect device')}
                </Button>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-4 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20">
                  <AlertCircle className="h-10 w-10 text-red-500" />
                </div>
                <h3 className="font-semibold text-white">{tr('Erro na conexão', 'Connection error')}</h3>
                <p className="text-sm text-gray-400">{tr('Não foi possível gerar o QR Code. Tente novamente em instantes.', 'Could not generate the QR Code. Please try again shortly.')}</p>
                {errorMessage && (
                  <div className="rounded-lg border border-surface-lighter bg-surface-lighter/60 p-3 text-left">
                    <p className="mb-1 text-[11px] font-bold uppercase text-gray-500">{tr('Detalhe do erro', 'Error detail')}</p>
                    <p className="break-words text-xs text-gray-300">{errorMessage}</p>
                  </div>
                )}
                <Button onClick={startConnection} variant="outline" className="w-full" disabled={isQrRequestPending}>
                  {tr('Tentar novamente', 'Try again')}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div
            ref={howToConnectRef}
            className={cn(
              'relative rounded-2xl border border-surface-lighter bg-surface-light p-8 transition-all',
              isGuidedTargetActive('how_to_connect') && 'z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)]'
            )}
          >
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
              <Info className="h-5 w-5 text-primary" />
              {tr('Como conectar?', 'How to connect?')}
            </h3>
            <ol className="space-y-4">
              <li className="flex gap-4">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-surface-lighter bg-surface-lighter text-xs font-bold text-gray-400">1</span>
                <p className="text-sm text-gray-400">{tr('Abra o ', 'Open ')}<span className="text-white">WhatsApp</span>{tr(' no seu celular.', ' on your phone.')}</p>
              </li>
              <li className="flex gap-4">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-surface-lighter bg-surface-lighter text-xs font-bold text-gray-400">2</span>
                <p className="text-sm text-gray-400">{tr('Toque em ', 'Tap ')}<span className="text-white">{tr('Aparelhos conectados', 'Linked devices')}</span>{tr(' nas configurações.', ' in settings.')}</p>
              </li>
              <li className="flex gap-4">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-surface-lighter bg-surface-lighter text-xs font-bold text-gray-400">3</span>
                <p className="text-sm text-gray-400">{tr('Toque em ', 'Tap ')}<span className="text-white">{tr('Conectar um aparelho', 'Link a device')}</span>.</p>
              </li>
              <li className="flex gap-4">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-surface-lighter bg-surface-lighter text-xs font-bold text-gray-400">4</span>
                <p className="text-sm text-gray-400">{tr('Aponte a camera para o ', 'Point your camera to the ')}<span className="text-white">QR Code</span>{tr(' ao lado.', ' shown on the side.')}</p>
              </li>
            </ol>
          </div>

          <div
            ref={importantTipRef}
            className={cn(
              'relative rounded-2xl border border-primary/20 bg-primary/5 p-6 transition-all',
              isGuidedTargetActive('important_tip') && 'z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)]'
            )}
          >
            <h4 className="mb-2 text-sm font-bold uppercase tracking-wider text-primary">{tr('Dica importante', 'Important tip')}</h4>
            <p className="text-sm text-gray-300">
              {tr(
                'Para uma automação estável, mantenha seu celular conectado à internet e evite fechar o aplicativo do WhatsApp por longos períodos.',
                'For stable automation, keep your phone connected to the internet and avoid closing WhatsApp for long periods.'
              )}
            </p>
          </div>
        </div>
      </div>

      {portalReady && guidedOpen
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[200] bg-black/90"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.88)' }}
              />

              <button
                type="button"
                onClick={closeGuidedOnboarding}
                className="fixed right-5 top-20 z-[230] flex h-11 w-11 items-center justify-center rounded-full border border-surface-lighter bg-surface-light text-gray-200 transition hover:bg-surface hover:text-white"
                aria-label={tr('Fechar onboarding', 'Close onboarding')}
              >
                <X className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={goToPreviousGuidedStep}
                disabled={guidedStep === 0 || guidedCompletionModalOpen}
                className={cn(
                  'fixed left-5 top-1/2 z-[220] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-surface-lighter bg-surface-light transition',
                  guidedStep === 0 || guidedCompletionModalOpen
                    ? 'cursor-not-allowed text-gray-600'
                    : 'text-gray-200 hover:bg-surface hover:text-white'
                )}
                aria-label={tr('Etapa anterior', 'Previous step')}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={goToNextGuidedStep}
                disabled={guidedStep === lastGuidedStepIndex || guidedCompletionModalOpen}
                className={cn(
                  'fixed right-5 top-1/2 z-[220] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-surface-lighter bg-surface-light transition',
                  guidedStep === lastGuidedStepIndex || guidedCompletionModalOpen
                    ? 'cursor-not-allowed text-gray-600'
                    : 'text-gray-200 hover:bg-surface hover:text-white'
                )}
                aria-label={tr('Próxima etapa', 'Next step')}
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              <div className="fixed bottom-5 left-1/2 z-[220] w-[min(680px,calc(100vw-2.5rem))] -translate-x-1/2 rounded-2xl border border-surface-lighter bg-surface-light p-4 shadow-2xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-primary">
                      {tr('Onboarding guiado', 'Guided onboarding')}
                    </p>
                    <h3 className="text-sm font-bold text-white">{currentGuidedStep.title}</h3>
                  </div>
                  <span className="text-xs font-medium text-gray-300">
                    {tr('Etapa', 'Step')} {guidedStep + 1}/{guidedSteps.length}
                  </span>
                </div>

                <p className="mt-2 text-sm text-gray-300">{currentGuidedStep.description}</p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {guidedSteps.map((step, index) => (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => setGuidedStep(index)}
                        disabled={guidedCompletionModalOpen}
                        className={cn(
                          'h-2.5 rounded-full transition-all',
                          index === guidedStep ? 'w-8 bg-primary' : 'w-2.5 bg-gray-600 hover:bg-gray-500'
                        )}
                        aria-label={`${tr('Ir para etapa', 'Go to step')} ${index + 1}`}
                      />
                    ))}
                  </div>

                  {guidedStep === lastGuidedStepIndex ? (
                    <Button
                      type="button"
                      onClick={finishGuidedTutorial}
                      className="bg-primary text-black hover:bg-primary/90"
                    >
                      {tr('Concluir tópico', 'Complete topic')}
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-400">
                      {tr('Use as setas na tela ou teclado para avançar.', 'Use on-screen or keyboard arrows to continue.')}
                    </span>
                  )}
                </div>
              </div>

              {guidedCompletionModalOpen ? (
                <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/45 px-4">
                  <div className="w-full max-w-md rounded-2xl border border-surface-lighter bg-surface-light p-5 shadow-2xl">
                    <h3 className="text-lg font-bold text-white">
                      {tr('Tutorial concluído!', 'Tutorial completed!')}
                    </h3>
                    <p className="mt-2 text-sm text-gray-300">
                      {nextGuidedTutorialKey
                        ? tr(
                            `Deseja ir para o próximo tutorial agora (${nextGuidedTutorialLabel})?`,
                            `Do you want to go to the next tutorial now (${nextGuidedTutorialLabel})?`
                          )
                        : tr(
                            'Você concluiu este fluxo. Deseja fechar o onboarding agora?',
                            'You completed this flow. Do you want to close onboarding now?'
                          )}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-surface-lighter bg-surface text-gray-200"
                        onClick={closeGuidedOnboarding}
                      >
                        {tr('Fechar', 'Close')}
                      </Button>
                      {nextGuidedTutorialKey ? (
                        <Button
                          type="button"
                          className="bg-primary text-black hover:bg-primary/90"
                          onClick={goToNextGuidedTutorial}
                        >
                          {tr('Ir para próximo', 'Go to next')}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          className="bg-primary text-black hover:bg-primary/90"
                          onClick={closeGuidedOnboarding}
                        >
                          {tr('Finalizar', 'Finish')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </>,
            document.body
          )
        : null}
    </div>
  )
}
