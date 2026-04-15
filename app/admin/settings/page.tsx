'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertCircle,
  Bug,
  CheckCircle2,
  Clock3,
  Copy,
  DollarSign,
  Link2,
  Loader2,
  MessageSquareText,
  Settings,
  Terminal,
  Wallet
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/providers/auth-provider'

const DEFAULT_PRICING_MODELS = {
  'gpt-5.2': { inputUsdPerM: '', outputUsdPerM: '' },
  'gemini-3-flash-preview': { inputUsdPerM: '', outputUsdPerM: '' }
}

type SaveStatus = 'idle' | 'success' | 'error'

type ProspectingSettings = {
  enabled: boolean
  senderEmail: string
  ctaBaseUrl: string
}

type AffiliateLink = {
  code: string
  name: string
  status: 'active' | 'inactive'
  createdAt: number | null
  updatedAt: number | null
  shareUrl: string
}

export default function SettingsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [settings, setSettings] = useState({
    debugAiPrompt: false,
    debugAiResponse: false,
    requestLogging: true
  })
  const [pricing, setPricing] = useState({
    usdBrlRate: '',
    aiAudioTranscriptionUsdPerMin: '',
    models: { ...DEFAULT_PRICING_MODELS }
  })
  const [pricingSaving, setPricingSaving] = useState(false)
  const [pricingStatus, setPricingStatus] = useState<SaveStatus>('idle')
  const [signupCreditsBrl, setSignupCreditsBrl] = useState('0')
  const [signupCreditsSaving, setSignupCreditsSaving] = useState(false)
  const [signupCreditsStatus, setSignupCreditsStatus] = useState<SaveStatus>('idle')
  const [prospecting, setProspecting] = useState<ProspectingSettings>({
    enabled: false,
    senderEmail: 'igsartor@icloud.com',
    ctaBaseUrl: '/login?mode=signup'
  })
  const [prospectingSaving, setProspectingSaving] = useState(false)
  const [prospectingStatus, setProspectingStatus] = useState<SaveStatus>('idle')
  const [affiliateName, setAffiliateName] = useState('')
  const [affiliateCode, setAffiliateCode] = useState('')
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLink[]>([])
  const [affiliatesLoading, setAffiliatesLoading] = useState(false)
  const [affiliatesSaving, setAffiliatesSaving] = useState(false)
  const [affiliatesStatus, setAffiliatesStatus] = useState<SaveStatus>('idle')
  const [affiliatesMessage, setAffiliatesMessage] = useState('')

  useEffect(() => {
    const loadSettings = async () => {
      if (!user) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const token = await user.getIdToken()
        const response = await fetch('/api/admin/system-settings', {
          headers: {
            authorization: `Bearer ${token}`
          }
        })

        if (!response.ok) {
          throw new Error(`settings_fetch_failed_${response.status}`)
        }

        const payload = await response.json().catch(() => ({}))
        const snapshot = payload?.settings ?? {}
        setSettings({
          debugAiPrompt: Boolean(snapshot.debugAiPrompt),
          debugAiResponse: Boolean(snapshot.debugAiResponse),
          requestLogging: typeof snapshot.requestLogging === 'boolean' ? snapshot.requestLogging : true
        })

        const pricingModels = { ...DEFAULT_PRICING_MODELS }
        const rawModels = snapshot.aiPricing?.models
        if (rawModels && typeof rawModels === 'object') {
          for (const [model, values] of Object.entries(rawModels)) {
            if (!(model in pricingModels)) {
              continue
            }
            const input = (values as { inputUsdPerM?: unknown }).inputUsdPerM
            const output = (values as { outputUsdPerM?: unknown }).outputUsdPerM
            if (typeof input === 'number' && Number.isFinite(input)) {
              pricingModels[model as keyof typeof pricingModels].inputUsdPerM = String(input)
            }
            if (typeof output === 'number' && Number.isFinite(output)) {
              pricingModels[model as keyof typeof pricingModels].outputUsdPerM = String(output)
            }
          }
        }

        setPricing({
          usdBrlRate: toInputValue(snapshot.usdBrlRate),
          aiAudioTranscriptionUsdPerMin: toInputValue(snapshot.aiAudioTranscriptionUsdPerMin),
          models: pricingModels
        })

        setSignupCreditsBrl(toInputValue(snapshot.newAccountCreditsBrl, '0'))

        const rawProspecting = snapshot.postInteractionProspecting
        setProspecting({
          enabled: rawProspecting?.enabled === true,
          senderEmail: typeof rawProspecting?.senderEmail === 'string' ? rawProspecting.senderEmail : 'igsartor@icloud.com',
          ctaBaseUrl: typeof rawProspecting?.ctaBaseUrl === 'string' ? rawProspecting.ctaBaseUrl : '/login?mode=signup'
        })
      } catch (error) {
        console.error('Erro ao carregar configurações:', error)
      } finally {
        setLoading(false)
      }
    }

    void loadSettings()
  }, [user])

  const showAffiliatesStatus = useCallback((status: SaveStatus, message: string) => {
    setAffiliatesStatus(status)
    setAffiliatesMessage(message)
    setTimeout(() => {
      setAffiliatesStatus('idle')
      setAffiliatesMessage('')
    }, 3000)
  }, [])

  const loadAffiliates = useCallback(async () => {
    if (!user) {
      setAffiliateLinks([])
      return
    }

    setAffiliatesLoading(true)
    try {
      const token = await user.getIdToken()
      const response = await fetch('/api/admin/affiliates', {
        headers: {
          authorization: `Bearer ${token}`
        },
        cache: 'no-store'
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error ? String(payload.error) : `affiliates_fetch_failed_${response.status}`)
      }

      setAffiliateLinks(Array.isArray(payload?.links) ? payload.links : [])
    } catch (error) {
      console.error('Erro ao carregar afiliados:', error)
      showAffiliatesStatus('error', 'Erro ao carregar afiliados')
    } finally {
      setAffiliatesLoading(false)
    }
  }, [showAffiliatesStatus, user])

  useEffect(() => {
    void loadAffiliates()
  }, [loadAffiliates])

  const saveAffiliate = async (input: { code: string; name: string; status: 'active' | 'inactive' }) => {
    if (!user) return

    setAffiliatesSaving(true)
    try {
      const token = await user.getIdToken()
      const response = await fetch('/api/admin/affiliates', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(input)
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error ? String(payload.error) : `affiliate_save_failed_${response.status}`)
      }

      await loadAffiliates()
      showAffiliatesStatus('success', 'Afiliado salvo com sucesso')
    } catch (error) {
      console.error('Erro ao salvar afiliado:', error)
      showAffiliatesStatus('error', 'Erro ao salvar afiliado')
    } finally {
      setAffiliatesSaving(false)
    }
  }

  const handleCreateAffiliate = async () => {
    const code = affiliateCode.trim().toLowerCase().replace(/\s+/g, '-')
    const name = affiliateName.trim()
    if (!code || !name) {
      showAffiliatesStatus('error', 'Preencha nome e código do afiliado')
      return
    }

    await saveAffiliate({
      code,
      name,
      status: 'active'
    })
    setAffiliateName('')
    setAffiliateCode('')
  }

  const handleToggleAffiliateStatus = async (link: AffiliateLink) => {
    await saveAffiliate({
      code: link.code,
      name: link.name,
      status: link.status === 'active' ? 'inactive' : 'active'
    })
  }

  const handleCopyAffiliateLink = async (shareUrl: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      showAffiliatesStatus('success', 'Link copiado')
    } catch (error) {
      console.error('Erro ao copiar link do afiliado:', error)
      showAffiliatesStatus('error', 'Não foi possível copiar o link')
    }
  }

  const saveSettings = async (updates: Partial<typeof settings>) => {
    const previous = { ...settings }
    setSettings((current) => ({ ...current, ...updates }))

    if (!user) return

    setSaving(true)
    setSaveStatus('idle')
    try {
      const token = await user.getIdToken()
      const response = await fetch('/api/admin/system-settings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      })

      if (!response.ok) {
        throw new Error(`settings_save_failed_${response.status}`)
      }

      pulseStatus(setSaveStatus, 'success')
    } catch (error) {
      console.error('Erro ao salvar configuração:', error)
      setSaveStatus('error')
      setSettings(previous)
    } finally {
      setSaving(false)
    }
  }

  const savePricing = async () => {
    if (!user) return

    setPricingSaving(true)
    setPricingStatus('idle')
    try {
      const token = await user.getIdToken()
      const usdBrlRate = parseDecimalInput(pricing.usdBrlRate)
      const aiAudioTranscriptionUsdPerMin = parseDecimalInput(pricing.aiAudioTranscriptionUsdPerMin)
      const models: Record<string, { inputUsdPerM: number; outputUsdPerM: number }> = {}

      Object.entries(pricing.models).forEach(([model, values]) => {
        const input = parseDecimalInput(values.inputUsdPerM)
        const output = parseDecimalInput(values.outputUsdPerM)
        if (Number.isFinite(input) && Number.isFinite(output)) {
          models[model] = { inputUsdPerM: input, outputUsdPerM: output }
        }
      })

      const response = await fetch('/api/admin/system-settings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...(Number.isFinite(usdBrlRate) ? { usdBrlRate } : {}),
          ...(Number.isFinite(aiAudioTranscriptionUsdPerMin) ? { aiAudioTranscriptionUsdPerMin } : {}),
          aiPricing: { models }
        })
      })

      if (!response.ok) {
        throw new Error(`pricing_save_failed_${response.status}`)
      }

      pulseStatus(setPricingStatus, 'success')
    } catch (error) {
      console.error('Erro ao salvar preços:', error)
      setPricingStatus('error')
    } finally {
      setPricingSaving(false)
    }
  }

  const saveSignupCredits = async () => {
    if (!user) return

    setSignupCreditsSaving(true)
    setSignupCreditsStatus('idle')
    const previous = signupCreditsBrl

    try {
      const newAccountCreditsBrl = parseDecimalInput(signupCreditsBrl)
      if (!Number.isFinite(newAccountCreditsBrl) || newAccountCreditsBrl < 0) {
        throw new Error('Valor inválido')
      }

      const token = await user.getIdToken()
      const response = await fetch('/api/admin/system-settings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ newAccountCreditsBrl })
      })

      if (!response.ok) {
        throw new Error(`signup_credits_save_failed_${response.status}`)
      }

      pulseStatus(setSignupCreditsStatus, 'success')
    } catch (error) {
      console.error('Erro ao salvar créditos iniciais:', error)
      setSignupCreditsStatus('error')
      setSignupCreditsBrl(previous)
    } finally {
      setSignupCreditsSaving(false)
    }
  }

  const saveProspecting = async () => {
    if (!user) return

    setProspectingSaving(true)
    setProspectingStatus('idle')
    try {
      const token = await user.getIdToken()
      const response = await fetch('/api/admin/system-settings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          postInteractionProspecting: {
            enabled: prospecting.enabled,
            senderEmail: prospecting.senderEmail.trim(),
            ctaBaseUrl: prospecting.ctaBaseUrl.trim()
          }
        })
      })

      if (!response.ok) {
        throw new Error(`prospecting_save_failed_${response.status}`)
      }

      pulseStatus(setProspectingStatus, 'success')
    } catch (error) {
      console.error('Erro ao salvar prospecção por feedback:', error)
      setProspectingStatus('error')
    } finally {
      setProspectingSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-gray-400">Carregando configurações...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold text-white">
          <Settings className="h-8 w-8 text-primary" />
          Configurações do Sistema
        </h1>
        <p className="mt-1 text-gray-400">Gerencie parâmetros globais, custos, prospecção e ferramentas de diagnóstico.</p>
      </div>

      <div className="grid gap-6">
        <section className="overflow-hidden rounded-2xl border border-surface-lighter bg-surface-light shadow-sm">
          <div className="border-b border-surface-lighter bg-surface-lighter/10 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Bug className="h-5 w-5 text-primary" />
              Diagnóstico e Debug
            </h2>
          </div>
          <div className="space-y-6 p-6">
            <ToggleRow
              icon={Terminal}
              title="Log de prompts da IA"
              description="Quando ativado, o backend exibe o prompt completo enviado para a OpenAI/Gemini no terminal."
              checked={settings.debugAiPrompt}
              disabled={saving}
              onCheckedChange={(checked) => void saveSettings({ debugAiPrompt: checked })}
            />
            <ToggleRow
              icon={Terminal}
              title="Ver resposta da IA nos logs"
              description="Quando ativado, o backend exibe a resposta bruta retornada pela IA no terminal."
              checked={settings.debugAiResponse}
              disabled={saving}
              onCheckedChange={(checked) => void saveSettings({ debugAiResponse: checked })}
            />
            <ToggleRow
              icon={Activity}
              title="Logs de requisições HTTP"
              description="Controla os logs automáticos de cada request do backend."
              checked={settings.requestLogging}
              disabled={saving}
              onCheckedChange={(checked) => void saveSettings({ requestLogging: checked })}
            />
            <StatusLine saving={saving} status={saveStatus} successText="Configuração salva com sucesso" errorText="Erro ao salvar alterações" />
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-surface-lighter bg-surface-light shadow-sm">
          <div className="border-b border-surface-lighter bg-surface-lighter/10 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <MessageSquareText className="h-5 w-5 text-primary" />
              Prospecção por Feedback
            </h2>
          </div>
          <div className="space-y-6 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-medium text-white">Campanha ativa</h3>
                <p className="max-w-xl text-sm text-gray-400">
                  Quando ativada, a conta do sistema aborda contatos que tiveram atendimento positivo com a IA de contas clientes.
                </p>
              </div>
              <Switch
                checked={prospecting.enabled}
                onCheckedChange={(checked) => setProspecting((current) => ({ ...current, enabled: checked }))}
                disabled={prospectingSaving}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">E-mail da conta emissora</label>
                <Input
                  value={prospecting.senderEmail}
                  onChange={(event) => setProspecting((current) => ({ ...current, senderEmail: event.target.value }))}
                  placeholder="igsartor@icloud.com"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Link2 className="h-4 w-4 text-gray-500" />
                  URL de CTA
                </label>
                <Input
                  value={prospecting.ctaBaseUrl}
                  onChange={(event) => setProspecting((current) => ({ ...current, ctaBaseUrl: event.target.value }))}
                  placeholder="/login?mode=signup"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-gray-300">
              <div className="mb-2 flex items-center gap-2 font-medium text-white">
                <Clock3 className="h-4 w-4 text-primary" />
                Cadência fixa da v1
              </div>
              <p>Disparo imediato após 2 mensagens do usuário + 2 respostas enviadas pela IA na mesma conversa em até 24h.</p>
              <p>Lembretes em +1h e +1d para nota e para comentário.</p>
              <p>Após o toque de +1d, o sistema espera mais 24h e encerra sem novos lembretes.</p>
            </div>

            <CardActions
              status={prospectingStatus}
              successText="Configuração de prospecção salva com sucesso"
              errorText="Erro ao salvar prospecção por feedback"
            >
              <Button onClick={saveProspecting} disabled={prospectingSaving} className="gap-2">
                {prospectingSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <MessageSquareText className="h-4 w-4" />
                    Salvar Prospecção
                  </>
                )}
              </Button>
            </CardActions>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-surface-lighter bg-surface-light shadow-sm">
          <div className="border-b border-surface-lighter bg-surface-lighter/10 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Wallet className="h-5 w-5 text-primary" />
              Créditos para Novas Contas
            </h2>
          </div>
          <div className="space-y-6 p-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Créditos iniciais (BRL)</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={signupCreditsBrl}
                  onChange={(event) => setSignupCreditsBrl(event.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-gray-400">Valor concedido automaticamente no cadastro. Use 0 para desativar.</p>
              </div>
            </div>

            <CardActions
              status={signupCreditsStatus}
              successText="Créditos iniciais salvos com sucesso"
              errorText="Erro ao salvar créditos iniciais"
            >
              <Button onClick={saveSignupCredits} disabled={signupCreditsSaving} className="gap-2">
                {signupCreditsSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Wallet className="h-4 w-4" />
                    Salvar Créditos
                  </>
                )}
              </Button>
            </CardActions>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-surface-lighter bg-surface-light shadow-sm">
          <div className="border-b border-surface-lighter bg-surface-lighter/10 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <DollarSign className="h-5 w-5 text-primary" />
              Custos de IA
            </h2>
          </div>
          <div className="space-y-6 p-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">USD → BRL</label>
                <Input value={pricing.usdBrlRate} onChange={(event) => setPricing((current) => ({ ...current, usdBrlRate: event.target.value }))} placeholder="Ex: 5.00" />
                <p className="text-xs text-gray-400">Taxa usada para converter custos em reais.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Transcrição de áudio (USD/min)</label>
                <Input
                  value={pricing.aiAudioTranscriptionUsdPerMin}
                  onChange={(event) => setPricing((current) => ({ ...current, aiAudioTranscriptionUsdPerMin: event.target.value }))}
                  placeholder="Ex: 0.006"
                />
                <p className="text-xs text-gray-400">Custo por minuto com cobrança proporcional ao tempo processado.</p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-400">Preço por 1M tokens (USD)</p>
              <div className="grid gap-4 md:grid-cols-3">
                {Object.entries(pricing.models).map(([model, values]) => (
                  <div key={model} className="rounded-xl border border-surface-lighter bg-surface p-4">
                    <p className="mb-3 text-sm font-semibold text-white">{model}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] uppercase tracking-wide text-gray-500">Input</label>
                        <Input
                          value={values.inputUsdPerM}
                          onChange={(event) =>
                            setPricing((current) => ({
                              ...current,
                              models: {
                                ...current.models,
                                [model]: {
                                  ...current.models[model as keyof typeof current.models],
                                  inputUsdPerM: event.target.value
                                }
                              }
                            }))
                          }
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] uppercase tracking-wide text-gray-500">Output</label>
                        <Input
                          value={values.outputUsdPerM}
                          onChange={(event) =>
                            setPricing((current) => ({
                              ...current,
                              models: {
                                ...current.models,
                                [model]: {
                                  ...current.models[model as keyof typeof current.models],
                                  outputUsdPerM: event.target.value
                                }
                              }
                            }))
                          }
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <CardActions status={pricingStatus} successText="Preços salvos com sucesso" errorText="Erro ao salvar preços">
              <Button onClick={savePricing} disabled={pricingSaving} className="gap-2">
                {pricingSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <DollarSign className="h-4 w-4" />
                    Salvar Preços
                  </>
                )}
              </Button>
            </CardActions>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-surface-lighter bg-surface-light shadow-sm">
          <div className="border-b border-surface-lighter bg-surface-lighter/10 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Link2 className="h-5 w-5 text-primary" />
              Afiliados
            </h2>
          </div>
          <div className="space-y-6 p-6">
            <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_auto]">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Nome</label>
                <Input
                  value={affiliateName}
                  onChange={(event) => setAffiliateName(event.target.value)}
                  placeholder="Ex: João Afiliado"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Código</label>
                <Input
                  value={affiliateCode}
                  onChange={(event) => setAffiliateCode(event.target.value.toLowerCase())}
                  placeholder="joao-afiliado"
                />
                <p className="text-xs text-gray-400">Use letras minúsculas, números, hífen ou underscore.</p>
              </div>
              <div className="flex items-end">
                <Button onClick={handleCreateAffiliate} disabled={affiliatesSaving} className="gap-2">
                  {affiliatesSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Criar afiliado'
                  )}
                </Button>
              </div>
            </div>

            {affiliatesStatus !== 'idle' && affiliatesMessage ? (
              <div className={`text-sm ${affiliatesStatus === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {affiliatesMessage}
              </div>
            ) : null}

            <div className="space-y-3">
              {affiliatesLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando afiliados...
                </div>
              ) : affiliateLinks.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum afiliado cadastrado ainda.</p>
              ) : (
                affiliateLinks.map((link) => (
                  <div key={link.code} className="rounded-2xl border border-surface-lighter bg-surface p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-white">{link.name}</p>
                          <span className="rounded-full border border-surface-lighter px-2 py-0.5 text-xs text-gray-300">
                            {link.code}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              link.status === 'active'
                                ? 'bg-green-500/10 text-green-400'
                                : 'bg-yellow-500/10 text-yellow-300'
                            }`}
                          >
                            {link.status === 'active' ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        <p className="break-all text-sm text-gray-400">{link.shareUrl}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleCopyAffiliateLink(link.shareUrl)}
                          disabled={affiliatesSaving}
                          className="gap-2"
                        >
                          <Copy className="h-4 w-4" />
                          Copiar link
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleToggleAffiliateStatus(link)}
                          disabled={affiliatesSaving}
                        >
                          {link.status === 'active' ? 'Desativar' : 'Ativar'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
          <div className="flex gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
              <AlertCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="mb-1 font-medium text-white">Dica de segurança</h3>
              <p className="text-sm text-gray-400">
                O log de prompts pode conter informações sensíveis. Mantenha essa opção desligada em produção, salvo em debug pontual.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToggleRow({
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange
}: {
  icon: typeof Terminal
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-gray-400" />
          <h3 className="font-medium text-white">{title}</h3>
        </div>
        <p className="max-w-md text-sm text-gray-400">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

function CardActions({
  children,
  status,
  successText,
  errorText
}: {
  children: ReactNode
  status: SaveStatus
  successText: string
  errorText: string
}) {
  return (
    <div className="flex items-center justify-between border-t border-surface-lighter pt-4">
      <div className="flex items-center gap-2">
        {status === 'success' ? (
          <div className="flex items-center gap-1.5 text-sm text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {successText}
          </div>
        ) : null}
        {status === 'error' ? (
          <div className="flex items-center gap-1.5 text-sm text-red-400">
            <AlertCircle className="h-4 w-4" />
            {errorText}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  )
}

function StatusLine({
  saving,
  status,
  successText,
  errorText
}: {
  saving: boolean
  status: SaveStatus
  successText: string
  errorText: string
}) {
  return (
    <div className="flex items-center justify-between border-t border-surface-lighter pt-4">
      <div className="flex items-center gap-2">
        {status === 'success' ? (
          <div className="flex items-center gap-1.5 text-sm text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {successText}
          </div>
        ) : null}
        {status === 'error' ? (
          <div className="flex items-center gap-1.5 text-sm text-red-400">
            <AlertCircle className="h-4 w-4" />
            {errorText}
          </div>
        ) : null}
      </div>
      {saving ? <span className="text-xs font-medium text-primary">Salvando...</span> : null}
    </div>
  )
}

function toInputValue(value: unknown, fallback = '') {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : fallback
}

function parseDecimalInput(value: string) {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) {
    return Number.NaN
  }
  return Number(normalized)
}

function pulseStatus(setter: (status: SaveStatus) => void, status: SaveStatus) {
  setter(status)
  setTimeout(() => setter('idle'), 3000)
}
