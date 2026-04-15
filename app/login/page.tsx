'use client'

import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, ArrowLeft, Lock, Mail, Loader2, Phone, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { auth, getUserRole, createUserProfile } from '@/lib/firebase'
import { syncAiConfig } from '@/lib/aiConfigSync'
import { emitOnboardingEventSafe } from '@/lib/onboarding/events'
import { track } from '@/lib/metaPixel'
import { trackSignupGa } from '@/lib/ga4'
import { AFFILIATE_ATTRIBUTION_MODEL } from '@/lib/affiliates/constants'
import { requestSignupHelp } from '@/app/actions/request-signup-help'
import {
  assignPaidAbVariant,
  buildAcquisitionEventProperties,
  captureAcquisitionAttributionFromCurrentLocation,
  getAcquisitionSnapshot,
  getPaidAbVariant,
  getSignupExperimentKey,
  isPaidAttributionV1Enabled,
  isPaidCroAbEnabled
} from '@/lib/acquisition/attribution'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  signInWithPopup,
  getAdditionalUserInfo,
  type User
} from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/client'

type AuthMode = 'login' | 'signup' | 'forgot-password'

type SignupAttributionPayload = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  gclid?: string
  gbraid?: string
  wbraid?: string
  fbclid?: string
  landingPath?: string
  firstSeenAtMs?: number
  lastSeenAtMs?: number
  experiments?: Record<string, string>
  affiliateCode?: string
  affiliateClickId?: string
  affiliateVisitorId?: string
  attributionModel?: string
}

type AffiliateClaimAttribution = {
  affiliateCode?: string | null
  clickId?: string | null
  visitorId?: string | null
  attributionModel?: string | null
}

function createEventId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function waitMs(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })
}

function normalizeAuthEmail(value: string) {
  return value.trim().toLowerCase()
}

function extractFirebaseErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : ''
}

function buildSignupAttributionPayload(properties: Record<string, unknown>): SignupAttributionPayload | undefined {
  const acquisition = properties.acquisition
  if (!acquisition || typeof acquisition !== 'object' || Array.isArray(acquisition)) {
    return undefined
  }

  const sourceObj = acquisition as Record<string, unknown>
  const toString = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
  const toNumber = (value: unknown) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const payload: SignupAttributionPayload = {
    source: toString(sourceObj.source),
    medium: toString(sourceObj.medium),
    campaign: toString(sourceObj.campaign),
    content: toString(sourceObj.content),
    term: toString(sourceObj.term),
    gclid: toString(sourceObj.gclid),
    gbraid: toString(sourceObj.gbraid),
    wbraid: toString(sourceObj.wbraid),
    fbclid: toString(sourceObj.fbclid),
    landingPath: toString(sourceObj.landingPath),
    firstSeenAtMs: toNumber(sourceObj.firstSeenAtMs),
    lastSeenAtMs: toNumber(sourceObj.lastSeenAtMs)
  }

  const experiments = properties.experiments
  if (experiments && typeof experiments === 'object' && !Array.isArray(experiments)) {
    const mapped = Object.entries(experiments as Record<string, unknown>)
      .map(([key, value]) => {
        if (typeof key !== 'string' || !key.trim() || typeof value !== 'string' || !value.trim()) {
          return null
        }
        return [key.trim(), value.trim()] as const
      })
      .filter((entry): entry is readonly [string, string] => entry !== null)
    if (mapped.length > 0) {
      payload.experiments = Object.fromEntries(mapped)
    }
  }

  const affiliate = properties.affiliate
  if (affiliate && typeof affiliate === 'object' && !Array.isArray(affiliate)) {
    const affiliateObj = affiliate as Record<string, unknown>
    payload.affiliateCode = toString(affiliateObj.code)
    payload.affiliateClickId = toString(affiliateObj.clickId)
    payload.affiliateVisitorId = toString(affiliateObj.visitorId)
    payload.attributionModel = toString(affiliateObj.attributionModel)
  }

  return payload
}

async function grantSignupCredits(idToken: string): Promise<void> {
  const token = idToken.trim()
  if (!token) {
    throw new Error('missing_auth_token')
  }

  const response = await fetch('/api/credits/signup-grant', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`
    }
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const message = payload?.error ? String(payload.error) : `signup_credits_grant_failed_${response.status}`
    throw new Error(message)
  }
}

async function grantSignupCreditsWithRetry(user: User, maxAttempts = 3): Promise<void> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const token = await user.getIdToken(attempt > 1)
    try {
      await grantSignupCredits(token)
      return
    } catch (error) {
      lastError = error
      if (attempt >= maxAttempts) {
        break
      }
      await waitMs(300 * attempt)
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }
  throw new Error('signup_credits_grant_failed')
}

async function claimAffiliateAttribution(idToken: string, signupAtMs: number): Promise<AffiliateClaimAttribution | null> {
  const token = idToken.trim()
  if (!token) {
    throw new Error('missing_auth_token')
  }

  const response = await fetch('/api/affiliate/claim', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ signupAtMs })
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const message = payload?.error ? String(payload.error) : `affiliate_claim_failed_${response.status}`
    throw new Error(message)
  }

  const payload = (await response.json().catch(() => null)) as { attribution?: AffiliateClaimAttribution | null } | null
  return payload?.attribution ?? null
}

function buildAffiliateSignupProperties(affiliateAttribution: AffiliateClaimAttribution | null): Record<string, unknown> {
  const affiliateCode =
    typeof affiliateAttribution?.affiliateCode === 'string' && affiliateAttribution.affiliateCode.trim()
      ? affiliateAttribution.affiliateCode.trim()
      : null
  if (!affiliateCode) {
    return {}
  }

  return {
    affiliate: {
      code: affiliateCode,
      ...(typeof affiliateAttribution?.clickId === 'string' && affiliateAttribution.clickId.trim()
        ? { clickId: affiliateAttribution.clickId.trim() }
        : {}),
      ...(typeof affiliateAttribution?.visitorId === 'string' && affiliateAttribution.visitorId.trim()
        ? { visitorId: affiliateAttribution.visitorId.trim() }
        : {}),
      attributionModel:
        typeof affiliateAttribution?.attributionModel === 'string' && affiliateAttribution.attributionModel.trim()
          ? affiliateAttribution.attributionModel.trim()
          : AFFILIATE_ATTRIBUTION_MODEL
    }
  }
}

export default function LoginPage() {
  const router = useRouter()
  const { route, locale, t, toRoute } = useI18n()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [signupHelpLoading, setSignupHelpLoading] = useState(false)
  const [signupHelpStatus, setSignupHelpStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [signupHelpMessage, setSignupHelpMessage] = useState('')
  const [signupVariant, setSignupVariant] = useState<'variant_a' | 'variant_b'>('variant_a')

  useEffect(() => {
    if (route?.key === 'signup') {
      setMode('signup')
      return
    }
    if (route?.key === 'forgot_password') {
      setMode('forgot-password')
      return
    }
    if (route?.key === 'login') {
      setMode('login')
      return
    }

    const modeParam = new URLSearchParams(window.location.search).get('mode')
    if (modeParam === 'login' || modeParam === 'signup' || modeParam === 'forgot-password') {
      setMode(modeParam as AuthMode)
    }
  }, [route?.key])

  useEffect(() => {
    if (!isPaidAttributionV1Enabled()) {
      return
    }
    captureAcquisitionAttributionFromCurrentLocation()
  }, [])

  useEffect(() => {
    if (mode !== 'signup' || !isPaidCroAbEnabled()) {
      return
    }
    const experimentKey = getSignupExperimentKey()
    const variant = getPaidAbVariant(experimentKey) ?? assignPaidAbVariant(experimentKey)
    setSignupVariant(variant)
    captureAcquisitionAttributionFromCurrentLocation()
  }, [mode])

  const signupCopy = useMemo(() => {
    if (signupVariant === 'variant_b') {
      return {
        title: t('login.titleSignup', 'Ative seu teste grátis agora'),
        description: t('login.descSignup', 'Crie a conta e veja a IA em ação no seu WhatsApp'),
        submit: t('login.submitSignup', 'Começar teste grátis')
      }
    }

    return {
      title: t('login.titleSignup', 'Crie sua conta'),
      description: t('login.descSignup', 'Comece a automatizar hoje mesmo'),
      submit: t('login.submitSignup', 'Criar Conta')
    }
  }, [signupVariant, t])

  const isGaDebugModeEnabled = () => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    return params.get('ga_debug') === '1'
  }

  const sendSignupAnalytics = async (
    method: 'email' | 'google',
    user: User,
    attribution?: SignupAttributionPayload
  ) => {
    const eventId = createEventId()
    const browserGaPromise = trackSignupGa(method, eventId, attribution)

    try {
      const token = await user.getIdToken()
      const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      }

      if (isGaDebugModeEnabled()) {
        headers['x-ga-debug'] = '1'
      }

      const response = await fetch('/api/analytics/signup', {
        method: 'POST',
        headers,
        body: JSON.stringify({ method, eventId, attribution })
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const message = payload?.error ? String(payload.error) : `signup_ga_mp_failed_${response.status}`
        console.warn('Falha no fallback GA Measurement Protocol:', message)
      }
    } catch (apiError) {
      console.warn('Falha ao enviar analytics de signup:', apiError)
    } finally {
      try {
        await browserGaPromise
      } catch (browserError) {
        console.warn('Falha ao finalizar evento GA no browser:', browserError)
      }
    }
  }

  const navigateToMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    if (nextMode === 'signup') {
      router.push(toRoute('signup'))
      return
    }
    if (nextMode === 'forgot-password') {
      router.push(toRoute('forgot_password'))
      return
    }
    router.push(toRoute('login'))
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (!auth) {
        setError(t('login.errors.firebaseMissing', 'Configuração do Firebase ausente. Verifique seu arquivo .env.local'))
        return
      }

      const normalizedEmail = normalizeAuthEmail(email)

      if (mode === 'login') {
        if (!normalizedEmail) {
          setError(t('login.errors.invalidEmail', 'Informe um e-mail válido.'))
          return
        }

        let signInMethods: string[] = []
        try {
          signInMethods = await fetchSignInMethodsForEmail(auth, normalizedEmail)
        } catch {
          signInMethods = []
        }
        if (signInMethods.length > 0 && !signInMethods.includes('password')) {
          if (signInMethods.includes('google.com')) {
            setError(
              t(
                'login.errors.googleOnly',
                'Este e-mail está cadastrado com Google. Use o botão "Google" para entrar.'
              )
            )
            return
          }

          setError(
            t(
              'login.errors.providerOnly',
              'Este e-mail usa outro método de login. Entre com o provedor correto.'
            )
          )
          return
        }

        const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password)
        const role = await getUserRole(userCredential.user.uid)
        router.push(role === 'admin' ? '/admin' : toRoute('dashboard_home'))
      } else if (mode === 'signup') {
        if (password !== confirmPassword) {
          setError(t('login.errors.passwordMismatch', 'As senhas não coincidem.'))
          setLoading(false)
          return
        }
        if (!whatsapp) {
          setError(t('login.errors.whatsappRequired', 'O WhatsApp é obrigatório.'))
          setLoading(false)
          return
        }
        const signupStartedAtMs = Date.now()
        const acquisitionSnapshot = isPaidAttributionV1Enabled()
          ? captureAcquisitionAttributionFromCurrentLocation() ?? getAcquisitionSnapshot()
          : getAcquisitionSnapshot()
        const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password)
        await createUserProfile(userCredential.user.uid, normalizedEmail, 'user', whatsapp, locale)
        try {
          await syncAiConfig({
            enabled: false,
            provider: 'google',
            model: 'gemini-3-flash-preview',
            training: {
              language: locale
            }
          })
        } catch (syncError) {
          console.warn('Falha ao aplicar IA padrão (Gemini):', syncError)
        }
        const signupToken = await userCredential.user.getIdToken()
        const signupCompletedAtMs = Date.now()
        let affiliateAttribution: AffiliateClaimAttribution | null = null
        try {
          affiliateAttribution = await claimAffiliateAttribution(signupToken, signupCompletedAtMs)
        } catch (affiliateError) {
          console.warn('Falha ao vincular afiliado no cadastro:', affiliateError)
        }
        try {
          await grantSignupCreditsWithRetry(userCredential.user)
        } catch (grantError) {
          console.warn('Falha ao conceder créditos iniciais:', grantError)
        }
        const signupProperties = buildAcquisitionEventProperties(acquisitionSnapshot, {
          method: 'email',
          ...(whatsapp.trim() ? { whatsapp: whatsapp.trim() } : {}),
          ...buildAffiliateSignupProperties(affiliateAttribution)
        })
        const signupAttribution = buildSignupAttributionPayload(signupProperties)
        if (acquisitionSnapshot?.hasCampaignSignals) {
          await emitOnboardingEventSafe({
            sessionId: userCredential.user.uid,
            eventName: 'paid_landing_viewed',
            eventId: createEventId(),
            occurredAtMs: acquisitionSnapshot.firstTouch.firstSeenAtMs,
            authToken: signupToken,
            properties: buildAcquisitionEventProperties(acquisitionSnapshot, {
              pagePath: acquisitionSnapshot.firstTouch.landingPath
            })
          })
        }
        await emitOnboardingEventSafe({
          sessionId: userCredential.user.uid,
          eventName: 'signup_started',
          eventId: createEventId(),
          occurredAtMs: signupStartedAtMs,
          authToken: signupToken,
          properties: signupProperties
        })
        await emitOnboardingEventSafe({
          sessionId: userCredential.user.uid,
          eventName: 'signup_completed',
          occurredAtMs: signupCompletedAtMs,
          authToken: signupToken,
          properties: signupProperties
        })
        await sendSignupAnalytics('email', userCredential.user, signupAttribution)
        track('CompleteRegistration')
        router.push(toRoute('dashboard_home'))
      } else {
        await sendPasswordResetEmail(auth, normalizedEmail)
        setSuccess(t('login.success.resetSent', 'Link de recuperação enviado para o seu e-mail!'))
      }
    } catch (err: unknown) {
      const errorCode = extractFirebaseErrorCode(err)
      console.warn('Falha no fluxo de autenticação:', errorCode || err)

      if (errorCode === 'auth/email-already-in-use') {
        setError(t('login.errors.emailInUse', 'Este e-mail já está sendo usado.'))
      } else if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/wrong-password') {
        setError(t('login.errors.invalidCredential', 'E-mail ou senha inválidos.'))
      } else if (errorCode === 'auth/user-not-found') {
        setError(t('login.errors.userNotFound', 'Usuário não encontrado.'))
      } else if (errorCode === 'auth/too-many-requests') {
        setError(
          t(
            'login.errors.tooManyRequests',
            'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.'
          )
        )
      } else if (errorCode === 'auth/network-request-failed') {
        setError(
          t(
            'login.errors.networkFailed',
            'Falha de conexão com o servidor de autenticação. Verifique sua internet e tente novamente.'
          )
        )
      } else if (errorCode === 'auth/operation-not-allowed') {
        setError(
          t(
            'login.errors.operationNotAllowed',
            'Login por e-mail/senha não está habilitado no Firebase Authentication.'
          )
        )
      } else {
        setError(t('login.errors.generic', 'Ocorreu um erro. Tente novamente.'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError('')
    setSuccess('')
    const provider = new GoogleAuthProvider()
    const signupStartedAtMs = Date.now()
    try {
      if (!auth) {
        setError(t('login.errors.firebaseMissing', 'Configuração do Firebase ausente. Verifique seu arquivo .env.local'))
        return
      }
      const userCredential = await signInWithPopup(auth!, provider)
      const role = await getUserRole(userCredential.user.uid)

      const created = await createUserProfile(userCredential.user.uid, userCredential.user.email || '', 'user', '', locale)
      const additionalInfo = getAdditionalUserInfo(userCredential)
      if (additionalInfo?.isNewUser || created) {
        const acquisitionSnapshot = isPaidAttributionV1Enabled()
          ? captureAcquisitionAttributionFromCurrentLocation() ?? getAcquisitionSnapshot()
          : getAcquisitionSnapshot()
        try {
          await syncAiConfig({
            enabled: false,
            provider: 'google',
            model: 'gemini-3-flash-preview',
            training: {
              language: locale
            }
          })
        } catch (syncError) {
          console.warn('Falha ao aplicar IA padrão (Gemini):', syncError)
        }
        const signupToken = await userCredential.user.getIdToken()
        const signupCompletedAtMs = Date.now()
        let affiliateAttribution: AffiliateClaimAttribution | null = null
        try {
          affiliateAttribution = await claimAffiliateAttribution(signupToken, signupCompletedAtMs)
        } catch (affiliateError) {
          console.warn('Falha ao vincular afiliado no cadastro Google:', affiliateError)
        }
        try {
          await grantSignupCreditsWithRetry(userCredential.user)
        } catch (grantError) {
          console.warn('Falha ao conceder créditos iniciais:', grantError)
        }
        const signupProperties = buildAcquisitionEventProperties(acquisitionSnapshot, {
          method: 'google',
          ...buildAffiliateSignupProperties(affiliateAttribution)
        })
        const signupAttribution = buildSignupAttributionPayload(signupProperties)
        if (acquisitionSnapshot?.hasCampaignSignals) {
          await emitOnboardingEventSafe({
            sessionId: userCredential.user.uid,
            eventName: 'paid_landing_viewed',
            eventId: createEventId(),
            occurredAtMs: acquisitionSnapshot.firstTouch.firstSeenAtMs,
            authToken: signupToken,
            properties: buildAcquisitionEventProperties(acquisitionSnapshot, {
              pagePath: acquisitionSnapshot.firstTouch.landingPath
            })
          })
        }
        await emitOnboardingEventSafe({
          sessionId: userCredential.user.uid,
          eventName: 'signup_started',
          eventId: createEventId(),
          occurredAtMs: signupStartedAtMs,
          authToken: signupToken,
          properties: signupProperties
        })
        await emitOnboardingEventSafe({
          sessionId: userCredential.user.uid,
          eventName: 'signup_completed',
          occurredAtMs: signupCompletedAtMs,
          authToken: signupToken,
          properties: signupProperties
        })
        await sendSignupAnalytics('google', userCredential.user, signupAttribution)
        track('CompleteRegistration')
      }

      router.push(role === 'admin' ? '/admin' : toRoute('dashboard_home'))
    } catch (err: any) {
      console.error(err)
      setError(t('login.errors.google', 'Erro ao entrar com Google.'))
    } finally {
      setLoading(false)
    }
  }

  const handleSignupHelp = async () => {
    if (signupHelpLoading) {
      return
    }

    const normalizedWhatsapp = whatsapp.trim()
    if (!normalizedWhatsapp) {
      setSignupHelpStatus('error')
      setSignupHelpMessage(t('login.errors.whatsappRequired', 'O WhatsApp é obrigatório.'))
      return
    }

    setSignupHelpLoading(true)
    setSignupHelpStatus('idle')
    setSignupHelpMessage('')

    const response = await requestSignupHelp({
      name: email.split('@')[0] || 'Cliente',
      whatsapp: normalizedWhatsapp,
      stage: 'cadastro'
    })

    if (response.success) {
      setSignupHelpStatus('success')
      setSignupHelpMessage('Mensagem enviada no seu WhatsApp. Vamos te ajudar a concluir o cadastro.')
    } else {
      setSignupHelpStatus('error')
      setSignupHelpMessage('Não conseguimos enviar agora. Tente novamente em instantes.')
    }

    setSignupHelpLoading(false)
  }

  const titles = {
    login: t('login.titleLogin', 'Acesse sua conta'),
    signup: signupCopy.title,
    'forgot-password': t('login.titleForgot', 'Recupere sua senha')
  }

  const descriptions = {
    login: t('login.descLogin', 'Gerencie sua IA de atendimento'),
    signup: signupCopy.description,
    'forgot-password': t('login.descForgot', 'Enviaremos um link para o seu email')
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <button
          onClick={() => router.push(toRoute('home'))}
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          {t('login.backHome', 'Voltar para Home')}
        </button>

        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-4 glow-primary">
            <MessageCircle className="w-10 h-10 text-black" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            Auto<span className="gradient-text">Whats</span>
          </h1>
          <p className="text-gray-400 mt-2">{titles[mode]}</p>
          <p className="text-gray-500 text-sm">{descriptions[mode]}</p>
        </div>

        <div className="bg-surface-light rounded-2xl p-8 border border-surface-lighter shadow-2xl">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-lg mb-6 text-center">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/50 text-green-500 text-sm p-3 rounded-lg mb-6 text-center">
              {success}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleAuth}>
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                {t('login.email', 'Email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@email.com"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div className="space-y-2">
                <label htmlFor="whatsapp" className="block text-sm font-medium text-gray-300">
                  {t('login.whatsapp', 'WhatsApp')}
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <Input
                    id="whatsapp"
                    type="tel"
                    placeholder="+91 90000-0000"
                    className="pl-10"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            {mode !== 'forgot-password' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                    {t('login.password', 'Senha')}
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => navigateToMode('forgot-password')}
                      className="text-xs text-primary hover:underline"
                    >
                      {t('login.forgotPassword', 'Esqueceu a senha?')}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    aria-label={showPassword ? t('login.hidePassword', 'Esconder senha') : t('login.showPassword', 'Mostrar senha')}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'signup' && (
              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300">
                  {t('login.confirmPassword', 'Confirmar Senha')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    aria-label={
                      showConfirmPassword
                        ? t('login.hidePassword', 'Esconder senha')
                        : t('login.showPassword', 'Mostrar senha')
                    }
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            <Button className="w-full" size="lg" disabled={loading}>
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : mode === 'login' ? (
                t('login.submitLogin', 'Entrar')
              ) : mode === 'signup' ? (
                signupCopy.submit
              ) : (
                t('login.submitForgot', 'Enviar Link')
              )}
            </Button>

            {mode === 'signup' && (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void handleSignupHelp()}
                  disabled={signupHelpLoading}
                >
                  {signupHelpLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('login.help.sending', 'Enviando ajuda...')}
                    </>
                  ) : (
                    t('login.help.cta', 'Precisa de ajuda para criar sua conta?')
                  )}
                </Button>

                {signupHelpStatus !== 'idle' && signupHelpMessage ? (
                  <p className={`text-xs ${signupHelpStatus === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>
                    {signupHelpMessage}
                  </p>
                ) : null}
              </div>
            )}
          </form>

          {mode !== 'forgot-password' && (
            <>
              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-surface-lighter"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-surface-light px-2 text-gray-500">{t('login.orContinueWith', 'Ou continue com')}</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full gap-2 border-surface-lighter hover:bg-surface-lighter"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google
              </Button>
            </>
          )}

          <div className="mt-8 pt-8 border-t border-surface-lighter text-center">
            {mode === 'login' ? (
              <p className="text-gray-400 text-sm">
                {t('login.noAccount', 'Não tem uma conta?')}{' '}
                <button onClick={() => navigateToMode('signup')} className="text-primary font-semibold hover:underline">
                  {t('login.createNow', 'Crie uma agora')}
                </button>
              </p>
            ) : (
              <p className="text-gray-400 text-sm">
                {t('login.hasAccount', 'Ja tem uma conta?')}{' '}
                <button onClick={() => navigateToMode('login')} className="text-primary font-semibold hover:underline">
                  {t('login.loginNow', 'Faca login')}
                </button>
              </p>
            )}
          </div>
        </div>

        <p className="text-center text-gray-500 text-xs mt-8">
          © {new Date().getFullYear()} AutoWhats. {t('login.footerRights', 'Todos os direitos reservados.')}
        </p>
      </div>
    </main>
  )
}
