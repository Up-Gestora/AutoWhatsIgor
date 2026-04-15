'use client'

import { useState, useEffect } from 'react'
import {
  User,
  CreditCard,
  Bell,
  Shield,
  Palette,
  Globe,
  Save,
  Mail,
  Phone,
  Loader2,
  CheckCircle2,
  XCircle
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'
import { getUserProfile, updateUserProfile } from '@/lib/firebase'
import { AssinaturaCreditosTab } from '@/components/billing/assinatura-creditos-tab'
import { SubcontasTab } from '@/components/settings/subcontas-tab'
import { useI18n } from '@/lib/i18n/client'

type TabId =
  | 'perfil'
  | 'assinatura_creditos'
  | 'subcontas'
  | 'notificacoes'
  | 'seguranca'
  | 'aparencia'
  | 'geral'

const tabs: Array<{
  id: TabId
  labelPt: string
  labelEn: string
  icon: LucideIcon
  disabled?: boolean
}> = [
  { id: 'perfil', labelPt: 'Perfil', labelEn: 'Profile', icon: User },
  { id: 'assinatura_creditos', labelPt: 'Assinatura e créditos', labelEn: 'Subscription and credits', icon: CreditCard },
  { id: 'subcontas', labelPt: 'Sub-contas', labelEn: 'Sub-accounts', icon: User },
  { id: 'notificacoes', labelPt: 'Notificações', labelEn: 'Notifications', icon: Bell, disabled: true },
  { id: 'seguranca', labelPt: 'Segurança', labelEn: 'Security', icon: Shield, disabled: true },
  { id: 'aparencia', labelPt: 'Aparência', labelEn: 'Appearance', icon: Palette, disabled: true },
  { id: 'geral', labelPt: 'Geral', labelEn: 'General', icon: Globe, disabled: true }
]

const disabledTabs = new Set(tabs.filter((tab) => tab.disabled).map((tab) => tab.id))

export default function ConfiguracoesPage() {
  const { user } = useAuth()
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const tr = (pt: string, en: string) => (isEn ? en : pt)

  const [activeTab, setActiveTab] = useState<TabId>('perfil')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [profileData, setProfileData] = useState({
    nome: '',
    email: '',
    telefone: ''
  })

  const [notifications, setNotifications] = useState({
    emailNovoLead: true,
    emailResumo: true,
    pushNovoLead: true,
    pushMensagens: false,
    somNotificacao: true
  })

  const [billingReturn, setBillingReturn] = useState<'success' | 'cancel' | null>(null)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const rawTab = params.get('tab')
      const normalizedTab = rawTab === 'assinatura_créditos' || rawTab === 'assinatura_crÃ©ditos'
        ? 'assinatura_creditos'
        : rawTab
      const tab = normalizedTab as TabId | null
      if (tab && tabs.some((item) => item.id === tab) && !disabledTabs.has(tab)) {
        setActiveTab(tab)
      }
      const billing = params.get('billing')
      if (billing === 'success' || billing === 'cancel') {
        setBillingReturn(billing)
      } else {
        setBillingReturn(null)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return

      setIsLoading(true)
      try {
        const profile = await getUserProfile(user.uid)
        if (profile) {
          setProfileData({
            nome: profile.nome || '',
            email: profile.email || user.email || '',
            telefone: profile.telefone || profile.whatsapp || ''
          })
        } else {
          setProfileData((prev) => ({
            ...prev,
            email: user.email || ''
          }))
        }
      } catch (error) {
        console.error('Erro ao carregar perfil:', error)
      } finally {
        setIsLoading(false)
      }
    }

    void loadProfile()
  }, [user])

  const handleSave = async () => {
    if (!user) return

    setIsSaving(true)
    setSaveMessage(null)

    try {
      const success = await updateUserProfile(user.uid, {
        nome: profileData.nome,
        email: profileData.email,
        telefone: profileData.telefone,
        whatsapp: profileData.telefone
      })

      if (success) {
        setSaveMessage({
          type: 'success',
          text: tr('Configurações salvas com sucesso!', 'Settings saved successfully!')
        })
      } else {
        setSaveMessage({
          type: 'error',
          text: tr('Erro ao salvar. Tente novamente.', 'Failed to save. Please try again.')
        })
      }
    } catch (error) {
      console.error('Erro ao salvar:', error)
      setSaveMessage({
        type: 'error',
        text: tr('Erro ao salvar. Tente novamente.', 'Failed to save. Please try again.')
      })
    } finally {
      setIsSaving(false)
      setTimeout(() => setSaveMessage(null), 3000)
    }
  }

  const renderContent = () => {
    if (disabledTabs.has(activeTab)) {
      return <EmDesenvolvimentoTab isEn={isEn} />
    }

    switch (activeTab) {
      case 'perfil':
        return <PerfilTab profileData={profileData} setProfileData={setProfileData} isEn={isEn} />
      case 'assinatura_creditos':
        return <AssinaturaCreditosTab billingReturn={billingReturn} />
      case 'subcontas':
        return <SubcontasTab />
      case 'notificacoes':
        return <NotificacoesTab notifications={notifications} setNotifications={setNotifications} isEn={isEn} />
      case 'seguranca':
        return <SegurancaTab isEn={isEn} />
      case 'aparencia':
        return <AparenciaTab isEn={isEn} />
      case 'geral':
        return <GeralTab isEn={isEn} />
      default:
        return null
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-white md:text-3xl">{tr('Configurações', 'Settings')}</h1>
          <p className="text-gray-400">
            {tr('Gerencie suas preferências e configurações da conta.', 'Manage your account preferences and settings.')}
          </p>
        </div>
        {activeTab === 'perfil' ? (
          <div className="flex items-center gap-3">
            {saveMessage && (
              <div
                className={cn(
                  'animate-fade-in flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium',
                  saveMessage.type === 'success' ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-400'
                )}
              >
                {saveMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {saveMessage.text}
              </div>
            )}
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isSaving ? tr('Salvando...', 'Saving...') : tr('Salvar alterações', 'Save changes')}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-primary/20 bg-surface-light p-4 text-sm text-gray-300">
        {tr(
          'As abas Notificações, Segurança, Aparência e Geral estão em desenvolvimento e ainda não estão disponíveis.',
          'The Notifications, Security, Appearance and General tabs are still in development and are not available yet.'
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-surface-lighter bg-surface-light p-2">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (!tab.disabled) {
                      setActiveTab(tab.id)
                    }
                  }}
                  disabled={tab.disabled}
                  aria-disabled={tab.disabled}
                  className={cn(
                    'w-full rounded-xl px-4 py-3 text-left transition-all duration-200 flex items-center gap-3',
                    tab.disabled
                      ? 'cursor-not-allowed text-gray-500 opacity-60'
                      : activeTab === tab.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-gray-400 hover:bg-surface-lighter hover:text-white'
                  )}
                >
                  <tab.icon className="h-5 w-5" />
                  <span className="font-medium">{isEn ? tab.labelEn : tab.labelPt}</span>
                  {tab.disabled && (
                    <span className="ml-auto text-[11px] uppercase tracking-wide text-gray-500">{tr('Em desenvolvimento', 'In development')}</span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-surface-lighter bg-surface-light p-6">{renderContent()}</div>
        </div>
      </div>
    </div>
  )
}

interface PerfilTabProps {
  profileData: {
    nome: string
    email: string
    telefone: string
  }
  setProfileData: (data: any) => void
  isEn: boolean
}

function PerfilTab({ profileData, setProfileData, isEn }: PerfilTabProps) {
  const tr = (pt: string, en: string) => (isEn ? en : pt)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-xl font-bold text-white">{tr('Informações do perfil', 'Profile information')}</h2>
        <p className="text-sm text-gray-400">{tr('Atualize suas informações pessoais e de contato.', 'Update your personal and contact details.')}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <User className="h-4 w-4 text-gray-500" />
            {tr('Nome completo', 'Full name')}
          </label>
          <Input
            value={profileData.nome}
            onChange={(e) => setProfileData({ ...profileData, nome: e.target.value })}
            placeholder={tr('Seu nome completo', 'Your full name')}
          />
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <Mail className="h-4 w-4 text-gray-500" />
            E-mail
          </label>
          <Input
            type="email"
            value={profileData.email}
            onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
            placeholder="you@email.com"
          />
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <Phone className="h-4 w-4 text-gray-500" />
            {tr('Telefone', 'Phone')}
          </label>
          <Input
            value={profileData.telefone}
            onChange={(e) => setProfileData({ ...profileData, telefone: e.target.value })}
            placeholder="(11) 99999-9999"
          />
        </div>
      </div>
    </div>
  )
}

interface NotificacoesTabProps {
  notifications: {
    emailNovoLead: boolean
    emailResumo: boolean
    pushNovoLead: boolean
    pushMensagens: boolean
    somNotificacao: boolean
  }
  setNotifications: (data: any) => void
  isEn: boolean
}

function NotificacoesTab({ notifications, setNotifications, isEn }: NotificacoesTabProps) {
  const tr = (pt: string, en: string) => (isEn ? en : pt)

  const toggleNotification = (key: string) => {
    setNotifications({ ...notifications, [key]: !notifications[key as keyof typeof notifications] })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-xl font-bold text-white">{tr('Preferências de notificação', 'Notification preferences')}</h2>
        <p className="text-sm text-gray-400">{tr('Escolha como e quando deseja receber notificações.', 'Choose how and when you want to receive notifications.')}</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">{tr('Notificações por e-mail', 'Email notifications')}</h3>

        <NotificationToggle
          label={tr('Novos leads', 'New leads')}
          description={tr('Receba um e-mail sempre que um novo lead for capturado.', 'Receive an email whenever a new lead is captured.')}
          checked={notifications.emailNovoLead}
          onChange={() => toggleNotification('emailNovoLead')}
        />

        <NotificationToggle
          label={tr('Resumo diário', 'Daily summary')}
          description={tr('Receba um resumo diário das atividades da sua conta.', 'Receive a daily summary of your account activity.')}
          checked={notifications.emailResumo}
          onChange={() => toggleNotification('emailResumo')}
        />
      </div>

      <div className="space-y-4 border-t border-surface-lighter pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">{tr('Notificações push', 'Push notifications')}</h3>

        <NotificationToggle
          label={tr('Novos leads', 'New leads')}
          description={tr('Receba notificações push quando novos leads chegarem.', 'Receive push notifications when new leads arrive.')}
          checked={notifications.pushNovoLead}
          onChange={() => toggleNotification('pushNovoLead')}
        />

        <NotificationToggle
          label={tr('Novas mensagens', 'New messages')}
          description={tr('Seja notificado quando receber novas mensagens.', 'Be notified when you receive new messages.')}
          checked={notifications.pushMensagens}
          onChange={() => toggleNotification('pushMensagens')}
        />
      </div>

      <div className="space-y-4 border-t border-surface-lighter pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">{tr('Som', 'Sound')}</h3>

        <NotificationToggle
          label={tr('Som de notificação', 'Notification sound')}
          description={tr('Reproduzir um som ao receber notificações.', 'Play a sound when receiving notifications.')}
          checked={notifications.somNotificacao}
          onChange={() => toggleNotification('somNotificacao')}
        />
      </div>
    </div>
  )
}

function EmDesenvolvimentoTab({ isEn }: { isEn: boolean }) {
  const tr = (pt: string, en: string) => (isEn ? en : pt)
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold text-white">{tr('Em desenvolvimento', 'In development')}</h2>
      <p className="text-sm text-gray-400">
        {tr(
          'Esta área ainda está em construção. Assim que estiver pronta, ela ficará disponível aqui.',
          'This area is still under construction. As soon as it is ready, it will be available here.'
        )}
      </p>
    </div>
  )
}

function SegurancaTab({ isEn }: { isEn: boolean }) {
  const tr = (pt: string, en: string) => (isEn ? en : pt)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-xl font-bold text-white">{tr('Segurança da conta', 'Account security')}</h2>
        <p className="text-sm text-gray-400">{tr('Gerencie sua senha e configurações de segurança.', 'Manage your password and security settings.')}</p>
      </div>

      <div className="space-y-4 border-b border-surface-lighter pb-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">{tr('Alterar senha', 'Change password')}</h3>

        <div className="max-w-md space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{tr('Senha atual', 'Current password')}</label>
            <Input type="password" placeholder={tr('Digite sua senha atual', 'Enter your current password')} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{tr('Nova senha', 'New password')}</label>
            <Input type="password" placeholder={tr('Digite a nova senha', 'Enter the new password')} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{tr('Confirmar nova senha', 'Confirm new password')}</label>
            <Input type="password" placeholder={tr('Confirme a nova senha', 'Confirm the new password')} />
          </div>

          <Button className="mt-2">{tr('Atualizar senha', 'Update password')}</Button>
        </div>
      </div>

      <div className="space-y-4 border-b border-surface-lighter pb-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">{tr('Autenticação em duas etapas', 'Two-factor authentication')}</h3>

        <div className="flex items-center justify-between rounded-xl border border-surface-lighter bg-surface p-4">
          <div>
            <p className="font-medium text-white">{tr('Autenticação 2FA', '2FA authentication')}</p>
            <p className="text-sm text-gray-400">{tr('Adicione uma camada extra de segurança à sua conta.', 'Add an extra layer of security to your account.')}</p>
          </div>
          <Button variant="outline">{tr('Configurar', 'Configure')}</Button>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">{tr('Sessões ativas', 'Active sessions')}</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-surface p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-white">Chrome - Windows</p>
                <p className="text-xs text-gray-400">{tr('São Paulo, Brasil - Agora (sessão atual)', 'Sao Paulo, Brazil - Now (current session)')}</p>
              </div>
            </div>
            <span className="rounded-lg bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{tr('Atual', 'Current')}</span>
          </div>
        </div>

        <Button variant="outline" className="border-red-400/30 text-red-400 hover:bg-red-400/10">
          {tr('Encerrar todas as outras sessões', 'End all other sessions')}
        </Button>
      </div>
    </div>
  )
}

function AparenciaTab({ isEn }: { isEn: boolean }) {
  const [theme, setTheme] = useState('dark')
  const tr = (pt: string, en: string) => (isEn ? en : pt)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-xl font-bold text-white">{tr('Aparência', 'Appearance')}</h2>
        <p className="text-sm text-gray-400">{tr('Personalize a aparência do seu painel.', 'Customize your dashboard appearance.')}</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">{tr('Tema', 'Theme')}</h3>

        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => setTheme('light')}
            className={cn(
              'rounded-xl border-2 p-4 transition-all',
              theme === 'light' ? 'border-primary bg-primary/10' : 'border-surface-lighter hover:border-gray-600'
            )}
          >
            <div className="mb-3 h-20 w-full rounded-lg bg-white" />
            <p className="text-sm font-medium text-white">{tr('Claro', 'Light')}</p>
          </button>

          <button
            onClick={() => setTheme('dark')}
            className={cn(
              'rounded-xl border-2 p-4 transition-all',
              theme === 'dark' ? 'border-primary bg-primary/10' : 'border-surface-lighter hover:border-gray-600'
            )}
          >
            <div className="mb-3 h-20 w-full rounded-lg border border-surface-lighter bg-surface" />
            <p className="text-sm font-medium text-white">{tr('Escuro', 'Dark')}</p>
          </button>

          <button
            onClick={() => setTheme('system')}
            className={cn(
              'rounded-xl border-2 p-4 transition-all',
              theme === 'system' ? 'border-primary bg-primary/10' : 'border-surface-lighter hover:border-gray-600'
            )}
          >
            <div className="mb-3 h-20 w-full rounded-lg bg-gradient-to-r from-white to-surface" />
            <p className="text-sm font-medium text-white">{tr('Sistema', 'System')}</p>
          </button>
        </div>
      </div>

      <div className="space-y-4 border-t border-surface-lighter pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">{tr('Cor de destaque', 'Accent color')}</h3>

        <div className="flex gap-3">
          {['#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308'].map((color) => (
            <button
              key={color}
              className="h-10 w-10 rounded-xl border-2 border-transparent transition-all hover:scale-110 hover:border-white/50"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function GeralTab({ isEn }: { isEn: boolean }) {
  const tr = (pt: string, en: string) => (isEn ? en : pt)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-xl font-bold text-white">{tr('Configurações gerais', 'General settings')}</h2>
        <p className="text-sm text-gray-400">{tr('Configure preferências gerais da sua conta.', 'Configure general account preferences.')}</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">{tr('Idioma', 'Language')}</h3>

        <select className="w-full max-w-xs rounded-xl border border-surface-lighter bg-white px-4 py-3 text-gray-900 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="pt-BR">Português (Brasil)</option>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </div>

      <div className="space-y-4 border-t border-surface-lighter pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">{tr('Exportar dados', 'Export data')}</h3>

        <div className="flex items-center justify-between rounded-xl border border-surface-lighter bg-surface p-4">
          <div>
            <p className="font-medium text-white">{tr('Exportar todos os dados', 'Export all data')}</p>
            <p className="text-sm text-gray-400">{tr('Baixe uma cópia de todos os seus dados.', 'Download a copy of all your data.')}</p>
          </div>
          <Button variant="outline">{tr('Exportar', 'Export')}</Button>
        </div>
      </div>

      <div className="space-y-4 border-t border-red-500/30 pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-red-400">{tr('Zona de perigo', 'Danger zone')}</h3>

        <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div>
            <p className="font-medium text-white">{tr('Excluir conta', 'Delete account')}</p>
            <p className="text-sm text-gray-400">{tr('Exclua permanentemente sua conta e todos os dados', 'Permanently delete your account and all data')}</p>
          </div>
          <Button variant="outline" className="border-red-400/30 text-red-400 hover:bg-red-400/10">
            {tr('Excluir conta', 'Delete account')}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface NotificationToggleProps {
  label: string
  description: string
  checked: boolean
  onChange: () => void
}

function NotificationToggle({ label, description, checked, onChange }: NotificationToggleProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-surface-lighter bg-surface p-4">
      <div>
        <p className="font-medium text-white">{label}</p>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
      <button
        onClick={onChange}
        className={cn('relative h-6 w-12 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-surface-lighter')}
      >
        <span
          className={cn(
            'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform',
            checked ? 'translate-x-7' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  )
}

