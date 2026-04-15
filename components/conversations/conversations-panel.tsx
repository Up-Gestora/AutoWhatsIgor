'use client'

import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Search,
  MoreVertical,
  MessageSquare,
  Phone,
  Video,
  Paperclip,
  Smile,
  Send,
  CheckCheck,
  User,
  Loader2,
  AlertCircle,
  Brain,
  Image as ImageIcon,
  FileText,
  PlayCircle,
  Volume2,
  Download,
  RotateCcw,
  ContactRound,
  Edit2,
  Trash2,
  X,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { auth, db, storage } from '@/lib/firebase'
import { buildHttpErrorMessage, parseResponsePayload } from '@/lib/http-error'
import { useI18n } from '@/lib/i18n/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { syncAiConfig } from '@/lib/aiConfigSync'
import { computeTrainingCompleteness, type TrainingCompletenessFieldKey } from '@/lib/training/completeness'
import {
  GUIDED_TUTORIAL_ROUTE_KEYS,
  GUIDED_TUTORIAL_TITLES,
  getGuidedTutorialNextKey,
  isGuidedTutorialKey,
  markGuidedTutorialCompleted,
  type GuidedTutorialKey
} from '@/lib/onboarding/guided-tutorials'

interface Chat {
  id: string
  name: string
  isGroup: boolean
  unreadCount: number
  manualUnread?: boolean
  labels?: ChatLabel[]
  assignedSubaccountUids?: string[]
  lastMessage?: {
    id?: string | null
    text?: string | null
    type?: string | null
    timestampMs?: number | null
    fromMe?: boolean | null
    origin?: MessageOrigin
  } | null
  lastActivityMs?: number | null
  pinned?: boolean
  archived?: boolean
  contact?: any
}

interface ChatLabel {
  id: string
  name: string
  colorHex: string
  createdAt?: number | null
  updatedAt?: number | null
}

interface Message {
  id: string
  type: string
  text: string | null
  timestampMs: number
  chatId: string
  fromMe: boolean
  media?: {
    mediaType: 'imageMessage' | 'videoMessage' | 'audioMessage' | 'documentMessage' | 'stickerMessage'
    mimeType?: string
    fileName?: string
    caption?: string
    sizeBytes?: number
    durationSec?: number
  }
  mediaRef?: string
  contact?: {
    displayName?: string
    contacts: Array<{
      name?: string
      whatsapp?: string
      vcard?: string
    }>
  }
  requestId?: string | null
  status?: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'retrying' | 'failed' | null
  origin?: MessageOrigin
  pending?: boolean
  failed?: boolean
}

type MessageOrigin =
  | 'ai'
  | 'human_dashboard'
  | 'automation_api'
  | 'human_external'
  | 'inbound'
  | 'legacy_manual'

type MediaLoadEntry = {
  status: 'idle' | 'loading' | 'loaded' | 'error'
  url?: string
  contentType?: string
  error?: string
}

interface ConversationsPanelProps {
  userId: string | null
  isSubaccount?: boolean
}

interface Subaccount {
  uid: string
  email: string
  nome?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

type ChatAutoOffReason = 'context' | 'delivery_guard' | 'recent_human_activity'
type ConversationsGuidedStepTarget =
  | 'visualizer'
  | 'global_ai_toggle'
  | 'disable_all'
  | 'enable_all'
  | 'search'
  | 'contacts_list'

type ConversationsGuidedStep = {
  id: string
  target: ConversationsGuidedStepTarget
  title: string
  description: string
}

interface ChatConfig {
  aiEnabled: boolean
  aiDisabledByContext?: boolean
  aiAutoOffReason?: ChatAutoOffReason | null
  aiDisabledReason?: string | null
  aiDisabledAt?: unknown | null
}

interface ChatAiConfigPayload {
  chatId: string
  aiEnabled: boolean
  disabledReason?: string | null
  disabledAt?: number | null
  updatedAt?: number | null
}

interface AiConfigTrainingPayload {
  esconderGrupos?: boolean
  responderGrupos?: boolean
}

interface AiConfigResponsePayload {
  enabled?: boolean
  training?: AiConfigTrainingPayload
}

interface OnboardingStatePayload {
  state?: {
    trainingScore?: number
  }
}

type AiSoftBlockContext = {
  score: number
  missingFields: TrainingCompletenessFieldKey[]
}

interface QuickReply {
  id: string
  sessionId: string
  shortcut: string
  content: string
  createdAt?: number | null
  updatedAt?: number | null
}

function resolveAutoOffReason(reason: string | null | undefined): ChatAutoOffReason | null {
  if (reason === 'context' || reason === 'delivery_guard' || reason === 'recent_human_activity') {
    return reason
  }
  return null
}

function toChatConfig(payload: ChatAiConfigPayload): ChatConfig {
  const autoOffReason = resolveAutoOffReason(payload.disabledReason)
  return {
    aiEnabled: payload.aiEnabled !== false,
    aiDisabledByContext: autoOffReason === 'context',
    aiAutoOffReason: autoOffReason,
    aiDisabledReason: payload.disabledReason ?? null,
    aiDisabledAt: payload.disabledAt ?? null
  }
}

function isGroupChatEntry(chat: Pick<Chat, 'id' | 'isGroup'>): boolean {
  if (chat.isGroup === true) {
    return true
  }

  const normalizedId = typeof chat.id === 'string' ? chat.id.trim().toLowerCase() : ''
  return normalizedId.endsWith('@g.us')
}

function normalizeDigits(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.replace(/\D+/g, '')
}

function normalizeComparableText(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeChatIdDigits(chatId: string): string {
  const normalized = chatId.trim()
  if (!normalized) {
    return ''
  }
  const bareId = normalized.includes('@') ? normalized.split('@', 1)[0] : normalized
  return normalizeDigits(bareId)
}

function digitsMatch(left: string, right: string): boolean {
  if (!left || !right) {
    return false
  }
  return left === right || left.endsWith(right) || right.endsWith(left)
}

function findChatFromLeadQuery(
  chats: Chat[],
  query: {
    chatId: string
    leadWhatsapp: string
    leadName: string
  }
): Chat | null {
  if (query.chatId) {
    const byId = chats.find((chat) => chat.id === query.chatId)
    if (byId) {
      return byId
    }
  }

  const leadWhatsappDigits = normalizeDigits(query.leadWhatsapp)
  if (leadWhatsappDigits) {
    const byWhatsapp = chats.find((chat) => {
      const chatDigits = normalizeChatIdDigits(chat.id)
      if (digitsMatch(chatDigits, leadWhatsappDigits)) {
        return true
      }

      const contact = chat.contact as Record<string, unknown> | null | undefined
      const contactWhatsapp =
        typeof contact?.whatsapp === 'string'
          ? contact.whatsapp
          : typeof contact?.phone === 'string'
            ? contact.phone
            : typeof contact?.number === 'string'
              ? contact.number
              : typeof contact?.id === 'string'
                ? contact.id
                : ''
      return digitsMatch(normalizeDigits(contactWhatsapp), leadWhatsappDigits)
    })
    if (byWhatsapp) {
      return byWhatsapp
    }
  }

  const normalizedLeadName = normalizeComparableText(query.leadName)
  if (normalizedLeadName) {
    const byName = chats.find((chat) => normalizeComparableText(chat.name) === normalizedLeadName)
    if (byName) {
      return byName
    }
  }

  return null
}


function toMs(timestamp: number): number {
  if (!timestamp) return 0
  return timestamp < 1e12 ? timestamp * 1000 : timestamp
}

function formatTimestamp(timestampMs: number, isEn = false): string {
  if (!timestampMs) return ''

  const date = new Date(toMs(timestampMs))
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return isEn ? 'Now' : 'Agora'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays === 1) return isEn ? 'Yesterday' : 'Ontem'
  if (diffDays < 7) return `${diffDays}d`

  return date.toLocaleDateString(isEn ? 'en-US' : 'pt-BR', { day: '2-digit', month: '2-digit' })
}

function formatMessageTime(timestampMs: number, isEn = false): string {
  if (!timestampMs) return ''
  const date = new Date(toMs(timestampMs))
  return date.toLocaleTimeString(isEn ? 'en-US' : 'pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function getTimestampMs(value: unknown): number | null {
  if (!value) return null
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  if (typeof value === 'object') {
    const asAny = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number }
    if (typeof asAny.toMillis === 'function') return asAny.toMillis()
    if (typeof asAny.seconds === 'number') {
      const nanos = typeof asAny.nanoseconds === 'number' ? asAny.nanoseconds : 0
      return asAny.seconds * 1000 + Math.floor(nanos / 1e6)
    }
  }
  return null
}

const messageTypeLabelsPt: Record<string, string> = {
  conversation: 'Mensagem',
  extendedTextMessage: 'Mensagem',
  text: 'Mensagem',
  imageMessage: 'Imagem',
  videoMessage: 'Video',
  audioMessage: 'Audio',
  documentMessage: 'Documento',
  contactMessage: 'Contato',
  contactsArrayMessage: 'Contatos',
  stickerMessage: 'Sticker',
  buttonsResponseMessage: 'Resposta',
  listResponseMessage: 'Lista',
  templateButtonReplyMessage: 'Resposta'
}

const CHAT_LABEL_COLORS = [
  '#7E49E7',
  '#2D8CFF',
  '#00BFA5',
  '#43A047',
  '#7CB342',
  '#C0CA33',
  '#F9A825',
  '#FB8C00',
  '#F4511E',
  '#E53935',
  '#D81B60',
  '#8E24AA',
  '#5E35B1',
  '#6D4C41',
  '#757575',
  '#546E7A',
  '#1E88E5',
  '#3949AB',
  '#00897B',
  '#6D4C41'
] as const

const messageTypeLabelsEn: Record<string, string> = {
  conversation: 'Message',
  extendedTextMessage: 'Message',
  text: 'Message',
  imageMessage: 'Image',
  videoMessage: 'Video',
  audioMessage: 'Audio',
  documentMessage: 'Document',
  contactMessage: 'Contact',
  contactsArrayMessage: 'Contacts',
  stickerMessage: 'Sticker',
  buttonsResponseMessage: 'Reply',
  listResponseMessage: 'List',
  templateButtonReplyMessage: 'Reply'
}

function formatMessagePreview(message?: { text?: string | null; type?: string | null } | null, isEn = false): string {
  if (message?.text) {
    return message.text
  }

  const map = isEn ? messageTypeLabelsEn : messageTypeLabelsPt
  const label = message?.type ? map[message.type] ?? message.type : null
  if (label) {
    return `[${label}]`
  }

  return isEn ? 'No messages' : 'Sem mensagens'
}

function formatMessageBody(message: Message, isEn = false): string {
  if (message.text) {
    return message.text
  }

  const map = isEn ? messageTypeLabelsEn : messageTypeLabelsPt
  const label = map[message.type] ?? message.type
  return label ? `[${label}]` : isEn ? '[Message]' : '[Mensagem]'
}

function formatMessageOrigin(origin: MessageOrigin | undefined, isEn = false): string | null {
  if (!origin) {
    return null
  }

  if (origin === 'ai') {
    return isEn ? 'AI' : 'IA'
  }
  if (origin === 'human_dashboard') {
    return isEn ? 'AutoWhats Panel' : 'Painel AutoWhats'
  }
  if (origin === 'automation_api') {
    return isEn ? 'Automation/API' : 'Automação/API'
  }
  if (origin === 'human_external') {
    return isEn ? 'WhatsApp App/Web' : 'WhatsApp App/Web'
  }
  if (origin === 'legacy_manual') {
    return isEn ? 'Legacy Manual' : 'Manual Legado'
  }
  if (origin === 'inbound') {
    return isEn ? 'Inbound' : 'Recebida'
  }

  return null
}

function isMediaType(type?: string | null) {
  return (
    type === 'imageMessage' ||
    type === 'videoMessage' ||
    type === 'audioMessage' ||
    type === 'documentMessage' ||
    type === 'stickerMessage'
  )
}

type ComposerMediaType = 'imageMessage' | 'videoMessage' | 'audioMessage' | 'documentMessage'
const COMPOSER_MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024

function composerMediaTypeFromFile(file: File): ComposerMediaType {
  const mime = (file.type || '').toLowerCase().trim()
  const name = (file.name || '').toLowerCase().trim()
  if (mime.startsWith('image/')) return 'imageMessage'
  if (mime.startsWith('video/')) return 'videoMessage'
  if (mime.startsWith('audio/')) return 'audioMessage'
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'documentMessage'
  return 'documentMessage'
}

function sanitizeComposerFilename(name: string): string {
  const trimmed = (name || '').trim()
  if (!trimmed) return 'arquivo'
  return trimmed.replace(/[^\w.\- ]+/g, '_').slice(0, 120)
}

function normalizeWhatsappDigits(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) {
    return null
  }
  return digits
}

function formatFileSize(bytes?: number): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return null
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const digits = unitIndex === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}

function formatDuration(seconds?: number): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return null
  }
  const total = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function describeMediaError(raw?: string, isEn = false) {
  const code = (raw ?? '').trim().toLowerCase()
  if (code === 'media_unavailable') {
    return isEn ? 'File unavailable in history.' : 'Arquivo indisponível no histórico.'
  }
  if (code === 'too_large') {
    return isEn ? 'File is too large to load.' : 'Arquivo muito grande para carregar.'
  }
  if (code === 'not_found' || code === 'unsupported_media') {
    return isEn ? 'File not found.' : 'Arquivo não encontrado.'
  }
  return isEn ? 'Failed to load media.' : 'Falha ao carregar mídia.'
}

function formatSubaccountLabel(subaccount: Subaccount): string {
  const nome = (subaccount.nome ?? '').trim()
  if (nome) {
    return nome
  }
  return subaccount.email
}

function formatSubaccountApiError(raw?: string, isEn = false): string {
  const code = (raw ?? '').trim().toLowerCase()
  if (code === 'subaccounts_limit_reached') {
    return isEn ? 'Sub-account limit reached.' : 'Limite de sub-contas atingido.'
  }
  if (code === 'subaccount_forbidden') {
    return isEn ? 'Action unavailable for sub-account.' : 'Ação indisponível para sub-conta.'
  }
  if (code === 'chat_not_assigned') {
    return isEn ? 'This chat is not assigned to this sub-account.' : 'Este chat não está atribuído para esta sub-conta.'
  }
  if (code === 'invalid_subaccount_uid') {
    return isEn ? 'One of the selected sub-accounts is invalid.' : 'Uma das sub-contas selecionadas é inválida.'
  }
  if (code === 'chat_assignment_check_failed') {
    return isEn ? 'Failed to validate chat assignment.' : 'Falha ao validar a atribuição do chat.'
  }
  if (code === 'chat_assignments_load_failed') {
    return isEn ? 'Failed to load chat assignments.' : 'Falha ao carregar atribuições dos chats.'
  }
  return raw || 'request_failed'
}

function formatQuickReplyApiError(raw?: string, isEn = false): string {
  const code = (raw ?? '').trim().toLowerCase()
  if (code === 'shortcut_required') {
    return isEn ? 'Enter a shortcut.' : 'Informe o atalho.'
  }
  if (code === 'shortcut_invalid_format') {
    return isEn
      ? 'Invalid shortcut. Use only letters, numbers, _ or - (up to 32 chars).'
      : 'Atalho inválido. Use apenas letras, números, _ ou - (até 32 caracteres).'
  }
  if (code === 'content_required') {
    return isEn ? 'Enter quick reply content.' : 'Informe o conteúdo da resposta rápida.'
  }
  if (code === 'content_too_long') {
    return isEn ? 'Content is too long. Limit is 2000 chars.' : 'Conteúdo muito longo. Limite de 2000 caracteres.'
  }
  if (code === 'quick_replies_limit_reached') {
    return isEn ? '50 quick replies limit reached.' : 'Limite de 50 respostas rápidas atingido.'
  }
  if (code === 'quick_reply_shortcut_conflict') {
    return isEn ? 'This shortcut already exists.' : 'Este atalho já existe.'
  }
  if (code === 'quick_reply_not_found') {
    return isEn ? 'Quick reply not found.' : 'Resposta rápida não encontrada.'
  }
  if (code === 'subaccount_forbidden') {
    return isEn
      ? 'Your account does not have permission to change quick replies.'
      : 'Sua conta não tem permissão para alterar respostas rápidas.'
  }
  return raw || 'request_failed'
}

function normalizeChatLabels(input: unknown): ChatLabel[] {
  if (!Array.isArray(input)) {
    return []
  }

  const seen = new Set<string>()
  const output: ChatLabel[] = []
  input.forEach((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return
    }
    const row = entry as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    const colorHexRaw = typeof row.colorHex === 'string' ? row.colorHex : ''
    const colorHex = colorHexRaw.trim().toUpperCase()
    if (!id || !name || !/^#[0-9A-F]{6}$/.test(colorHex) || seen.has(id)) {
      return
    }
    seen.add(id)
    output.push({
      id,
      name,
      colorHex,
      createdAt: typeof row.createdAt === 'number' ? row.createdAt : null,
      updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : null
    })
  })

  return output
}

function formatLabelApiError(raw?: string, isEn = false): string {
  const code = (raw ?? '').trim().toLowerCase()
  if (code === 'label_name_required') {
    return isEn ? 'Enter label name.' : 'Informe o nome da etiqueta.'
  }
  if (code === 'label_name_too_long') {
    return isEn ? 'Name is too long. Limit is 32 chars.' : 'Nome muito longo. Limite de 32 caracteres.'
  }
  if (code === 'label_color_required') {
    return isEn ? 'Select a color.' : 'Selecione uma cor.'
  }
  if (code === 'label_color_invalid') {
    return isEn ? 'Invalid color.' : 'Cor inválida.'
  }
  if (code === 'labels_limit_reached') {
    return isEn ? '20 labels limit reached.' : 'Limite de 20 etiquetas atingido.'
  }
  if (code === 'label_name_conflict') {
    return isEn ? 'A label with this name already exists.' : 'Já existe uma etiqueta com esse nome.'
  }
  if (code === 'label_not_found') {
    return isEn ? 'Label not found.' : 'Etiqueta não encontrada.'
  }
  if (code === 'chat_labels_limit_exceeded') {
    return isEn ? 'Select up to 20 labels.' : 'Selecione no máximo 20 etiquetas.'
  }
  if (code === 'chat_label_invalid_ids') {
    return isEn ? 'One or more labels are invalid.' : 'Uma ou mais etiquetas são inválidas.'
  }
  if (code === 'subaccount_forbidden') {
    return isEn ? 'Your account does not have permission to manage labels.' : 'Sua conta não tem permissão para gerenciar etiquetas.'
  }
  if (code === 'chat_not_assigned') {
    return isEn ? 'This chat is not assigned to this sub-account.' : 'Este chat não está atribuído para esta sub-conta.'
  }
  return raw || 'request_failed'
}

function normalizeUidArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }
  const seen = new Set<string>()
  const output: string[] = []
  input.forEach((value) => {
    if (typeof value !== 'string') {
      return
    }
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) {
      return
    }
    seen.add(normalized)
    output.push(normalized)
  })
  return output
}

function normalizeQuickReplyShortcutInput(value: string): string {
  return value.trim().replace(/^\/+/, '').toLowerCase()
}

function sortQuickReplies(list: QuickReply[]): QuickReply[] {
  return [...list].sort((a, b) => {
    const aTime = typeof a.updatedAt === 'number' ? a.updatedAt : 0
    const bTime = typeof b.updatedAt === 'number' ? b.updatedAt : 0
    if (aTime !== bTime) {
      return bTime - aTime
    }
    return a.shortcut.localeCompare(b.shortcut)
  })
}

function parseQuickReplyQuery(value: string): string | null {
  if (!value.startsWith('/')) {
    return null
  }
  if (/\s/.test(value.slice(1))) {
    return null
  }
  return normalizeQuickReplyShortcutInput(value)
}

const ChatItem = memo(({
  chat,
  isEn,
  isSelected,
  onSelect,
  aiEnabled,
  onAiToggle,
  aiAutoOffReason,
  showAiControls,
  isActionsOpen,
  onToggleActions,
  onMarkRead,
  onMarkUnread,
  onOpenLabels,
  onDeleteChat,
  showDeleteAction,
  deleting,
  deleteDisabled,
  actionsRef
}: {
  chat: Chat
  isEn: boolean
  isSelected: boolean
  onSelect: (id: string) => void
  aiEnabled: boolean
  onAiToggle: (id: string, checked: boolean) => void
  aiAutoOffReason?: ChatAutoOffReason | null
  showAiControls?: boolean
  isActionsOpen: boolean
  onToggleActions: (id: string) => void
  onMarkRead: (chat: Chat) => void
  onMarkUnread: (chat: Chat) => void
  onOpenLabels: (chat: Chat) => void
  onDeleteChat?: (chat: Chat) => void
  showDeleteAction?: boolean
  deleting?: boolean
  deleteDisabled?: boolean
  actionsRef?: { current: HTMLDivElement | null }
}) => {
  const hasUnread = chat.unreadCount > 0 || chat.manualUnread === true
  const autoOffTooltip =
    aiAutoOffReason === 'delivery_guard'
      ? isEn
          ? 'Automatically disabled by deliverability guard.'
          : 'Desativada automaticamente pela protecao de entregabilidade.'
      : aiAutoOffReason === 'recent_human_activity'
        ? isEn
          ? 'Automatically disabled due to recent human activity.'
          : 'Desativada automaticamente por atividade humana recente.'
      : isEn
        ? 'Automatically disabled by context.'
        : 'Desativada automaticamente por contexto.'

  return (
    <div
      className={cn(
        'group relative border-b border-surface-lighter/30 transition-colors hover:bg-surface-lighter/50',
        isSelected && 'bg-surface-lighter/80'
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(chat.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect(chat.id)
          }
        }}
        className="w-full p-4 pr-14 flex items-center gap-3 text-left"
      >
        <div className="relative flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline mb-1 gap-2">
            <div className="min-w-0 flex items-center gap-1.5">
              <h3 className="font-semibold text-white truncate text-sm">{chat.name}</h3>
              {Array.isArray(chat.labels) && chat.labels.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  {chat.labels.map((label) => (
                    <span
                      key={label.id}
                      className="h-2.5 w-2.5 rounded-[3px]"
                      style={{ backgroundColor: label.colorHex }}
                      title={label.name}
                    />
                  ))}
                </div>
              ) : null}
            </div>
            <span className="text-[10px] text-gray-500">
              {formatTimestamp(chat.lastActivityMs || chat.lastMessage?.timestampMs || 0, isEn)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-400 truncate pr-4">
              {formatMessagePreview(chat.lastMessage, isEn)}
            </p>
            <div className="flex items-center gap-2">
              {showAiControls ? (
                <>
                  <div
                    className="flex items-center gap-1 bg-surface-lighter/50 px-1.5 py-0.5 rounded-md border border-surface-lighter"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[9px] text-gray-500 font-bold uppercase">IA</span>
                    <Switch
                      checked={aiEnabled}
                      onCheckedChange={(checked) => onAiToggle(chat.id, checked)}
                      className="scale-[0.6] origin-right"
                    />
                  </div>
                  {!aiEnabled && aiAutoOffReason && (
                    <div
                      className="flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5"
                      title={autoOffTooltip}
                    >
                      <AlertCircle className="w-3 h-3 text-amber-400" />
                      <span className="text-[9px] text-amber-300 font-semibold uppercase">Auto off</span>
                    </div>
                  )}
                </>
              ) : null}
              {chat.unreadCount > 0 ? (
                <span className="bg-primary text-black text-[10px] font-bold min-w-5 h-5 px-1.5 flex items-center justify-center rounded-full">
                  {chat.unreadCount}
                </span>
              ) : hasUnread ? (
                <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div
        ref={isActionsOpen ? actionsRef : undefined}
        className="absolute right-2 top-2 z-20"
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onToggleActions(chat.id)
          }}
          className={cn(
            'h-8 w-8 rounded-md border border-surface-lighter/60 bg-surface-light/90 text-gray-300 flex items-center justify-center transition',
            isActionsOpen
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-white'
          )}
          aria-label={isEn ? 'Open conversation actions' : 'Abrir ações da conversa'}
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {isActionsOpen ? (
          <div className="absolute right-0 mt-1 w-56 rounded-xl border border-surface-lighter bg-surface-light p-2 shadow-xl">
            {hasUnread ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onMarkRead(chat)
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-200 transition-colors hover:bg-surface-lighter/70"
              >
                {isEn ? 'Mark as read' : 'Marcar conversa como lida'}
              </button>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onMarkUnread(chat)
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-200 transition-colors hover:bg-surface-lighter/70"
              >
                {isEn ? 'Mark as unread' : 'Marcar conversa como não lida'}
              </button>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onOpenLabels(chat)
              }}
              className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-gray-200 transition-colors hover:bg-surface-lighter/70"
            >
              {isEn ? 'Label conversation' : 'Etiquetar conversa'}
            </button>
            {showDeleteAction && onDeleteChat ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onDeleteChat(chat)
                }}
                disabled={deleteDisabled}
                className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-surface-lighter/70 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting
                  ? (isEn ? 'Deleting conversation...' : 'Excluindo conversa...')
                  : (isEn ? 'Delete conversation' : 'Excluir conversa')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
})

ChatItem.displayName = 'ChatItem'

export function ConversationsPanel({ userId, isSubaccount = false }: ConversationsPanelProps) {
  const { locale, toRoute } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const leadChatIdFromQuery = (searchParams.get('chatId') ?? '').trim()
  const leadWhatsappFromQuery = (searchParams.get('leadWhatsapp') ?? '').trim()
  const leadNameFromQuery = (searchParams.get('leadName') ?? '').trim()
  const hasLeadQueryTarget = Boolean(leadChatIdFromQuery || leadWhatsappFromQuery || leadNameFromQuery)
  const guidedTutorialFromQuery = searchParams.get('guidedTutorial')
  const currentGuidedTutorialKey: GuidedTutorialKey = isGuidedTutorialKey(guidedTutorialFromQuery)
    ? guidedTutorialFromQuery
    : 'conversations'
  const nextGuidedTutorialKey = getGuidedTutorialNextKey(currentGuidedTutorialKey)
  const nextGuidedTutorialLabel = nextGuidedTutorialKey
    ? tr(GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].pt, GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].en)
    : null

  const [guidedOpen, setGuidedOpen] = useState(false)
  const [guidedStep, setGuidedStep] = useState(0)
  const [guidedCompletionModalOpen, setGuidedCompletionModalOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)

  const [chats, setChats] = useState<Chat[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [mediaState, setMediaState] = useState<Record<string, MediaLoadEntry>>({})
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [messageText, setMessageText] = useState('')
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const [selectedAttachmentFile, setSelectedAttachmentFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [contactMode, setContactMode] = useState(false)
  const [contactDisplayNameDraft, setContactDisplayNameDraft] = useState('')
  const [contactNameDraft, setContactNameDraft] = useState('')
  const [contactWhatsappDraft, setContactWhatsappDraft] = useState('')
  const [sendingComposer, setSendingComposer] = useState(false)
  const [loadingChats, setLoadingChats] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAiEnabled, setIsAiEnabled] = useState(false)
  const [hideGroupsInConversations, setHideGroupsInConversations] = useState(false)
  const [loadingAi, setLoadingAi] = useState(true)
  const [aiSoftBlockContext, setAiSoftBlockContext] = useState<AiSoftBlockContext | null>(null)
  const [showAiSoftBlockModal, setShowAiSoftBlockModal] = useState(false)
  const [bulkAction, setBulkAction] = useState<'disable' | 'enable' | null>(null)
  const [chatConfigs, setChatConfigs] = useState<Record<string, ChatConfig>>({})
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([])
  const [loadingSubaccounts, setLoadingSubaccounts] = useState(false)
  const [savingAssignment, setSavingAssignment] = useState(false)
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false)
  const [assignmentDraftSubaccountUids, setAssignmentDraftSubaccountUids] = useState<string[]>([])
  const [assignmentError, setAssignmentError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'groups'>('all')
  const [toast, setToast] = useState<{ message: string } | null>(null)
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
  const [canManageQuickReplies, setCanManageQuickReplies] = useState(!isSubaccount)
  const [loadingQuickReplies, setLoadingQuickReplies] = useState(false)
  const [quickRepliesMenuOpen, setQuickRepliesMenuOpen] = useState(false)
  const [chatActionsMenuChatId, setChatActionsMenuChatId] = useState<string | null>(null)
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)
  const [isQuickRepliesModalOpen, setIsQuickRepliesModalOpen] = useState(false)
  const [isLabelsModalOpen, setIsLabelsModalOpen] = useState(false)
  const [labels, setLabels] = useState<ChatLabel[]>([])
  const [loadingLabels, setLoadingLabels] = useState(false)
  const [labelsError, setLabelsError] = useState<string | null>(null)
  const [labelsTargetChatId, setLabelsTargetChatId] = useState<string | null>(null)
  const [labelSelectionDraftIds, setLabelSelectionDraftIds] = useState<string[]>([])
  const [savingChatLabels, setSavingChatLabels] = useState(false)
  const [labelDraftId, setLabelDraftId] = useState<string | null>(null)
  const [labelNameDraft, setLabelNameDraft] = useState('')
  const [labelColorDraft, setLabelColorDraft] = useState<string>(CHAT_LABEL_COLORS[0])
  const [labelFormError, setLabelFormError] = useState<string | null>(null)
  const [savingLabel, setSavingLabel] = useState(false)
  const [deletingLabelId, setDeletingLabelId] = useState<string | null>(null)
  const [quickReplyDraftId, setQuickReplyDraftId] = useState<string | null>(null)
  const [quickReplyShortcutDraft, setQuickReplyShortcutDraft] = useState('')
  const [quickReplyContentDraft, setQuickReplyContentDraft] = useState('')
  const [quickReplyFormError, setQuickReplyFormError] = useState<string | null>(null)
  const [savingQuickReply, setSavingQuickReply] = useState(false)
  const [deletingQuickReplyId, setDeletingQuickReplyId] = useState<string | null>(null)
  const [quickReplySuggestionsOpen, setQuickReplySuggestionsOpen] = useState(false)
  const [activeQuickReplyIndex, setActiveQuickReplyIndex] = useState(0)
  const globalAiToggleRef = useRef<HTMLDivElement | null>(null)
  const disableAllAiRef = useRef<HTMLDivElement | null>(null)
  const enableAllAiRef = useRef<HTMLDivElement | null>(null)
  const searchBlockRef = useRef<HTMLDivElement | null>(null)
  const contactsListRef = useRef<HTMLDivElement | null>(null)
  const visualizerRef = useRef<HTMLDivElement | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chatsRef = useRef<Chat[]>([])
  const hideGroupsInConversationsRef = useRef(false)
  const autoOffNotifiedRef = useRef<Set<string>>(new Set())
  const shouldScrollToBottomRef = useRef(false)
  const mediaStateRef = useRef<Record<string, MediaLoadEntry>>({})
  const mediaUrlRef = useRef<Map<string, string>>(new Map())
  const mediaOrderRef = useRef<string[]>([])
  const mediaInflightRef = useRef<Map<string, Promise<void>>>(new Map())
  const imageTargetsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const imageObserverRef = useRef<IntersectionObserver | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const quickRepliesMenuRef = useRef<HTMLDivElement>(null)
  const chatActionsMenuRef = useRef<HTMLDivElement>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null)
  const guidedSuppressAutoOpenRef = useRef(false)
  const leadQueryResolvedRef = useRef(false)
  const MEDIA_CACHE_MAX_ITEMS = 80
  const guidedSteps = useMemo<ConversationsGuidedStep[]>(
    () => [
      {
        id: 'global_ai_toggle',
        target: 'global_ai_toggle',
        title: tr('Etapa 1: IA Global', 'Step 1: Global AI'),
        description: tr(
          'Ative ou desative a IA global para todas as conversas de uma vez.',
          'Enable or disable global AI for all conversations at once.'
        )
      },
      {
        id: 'disable_all',
        target: 'disable_all',
        title: tr('Etapa 2: Desligar IA em todas', 'Step 2: Disable AI for all'),
        description: tr(
          'Use este botão para desligar rápidamente a IA em todas as conversas.',
          'Use this button to quickly disable AI across all conversations.'
        )
      },
      {
        id: 'enable_all',
        target: 'enable_all',
        title: tr('Etapa 3: Ligar IA em todas', 'Step 3: Enable AI for all'),
        description: tr(
          'Use este botão para ligar novamente a IA em massa quando quiser retomar a automação.',
          'Use this button to enable AI in bulk when you want to resume automation.'
        )
      },
      {
        id: 'search',
        target: 'search',
        title: tr('Etapa 4: Pesquisa de contatos', 'Step 4: Contact search'),
        description: tr(
          'Pesquise por nome, número ou trecho da conversa para encontrar contatos mais rápido.',
          'Search by name, number, or message content to find contacts faster.'
        )
      },
      {
        id: 'contacts_list',
        target: 'contacts_list',
        title: tr('Etapa 5: Lista de conversas', 'Step 5: Conversations list'),
        description: tr(
          'Aqui ficam todos os contatos e grupos disponíveis para seleção e atendimento.',
          'This is where all contacts and groups are listed for selection and support.'
        )
      },
      {
        id: 'visualizer',
        target: 'visualizer',
        title: tr('Etapa 6: Visualizador do WhatsApp', 'Step 6: WhatsApp visualizer'),
        description: tr(
          'Este painel mostra os detalhes da conversa selecionada e todo o histórico de mensagens.',
          'This panel shows details from the selected conversation and the full message history.'
        )
      }
    ],
    [tr]
  )
  const lastGuidedStepIndex = guidedSteps.length - 1
  const currentGuidedStep = guidedSteps[guidedStep] ?? guidedSteps[0]

  const resolveGuidedTargetElement = useCallback((target: ConversationsGuidedStepTarget) => {
    if (target === 'visualizer') return visualizerRef.current
    if (target === 'global_ai_toggle') return globalAiToggleRef.current
    if (target === 'disable_all') return disableAllAiRef.current
    if (target === 'enable_all') return enableAllAiRef.current
    if (target === 'search') return searchBlockRef.current
    return contactsListRef.current
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
    (target: ConversationsGuidedStepTarget) => guidedOpen && currentGuidedStep?.target === target,
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
          guidedTutorial: nextGuidedTutorialKey
        }
      })
    )
  }, [closeGuidedOnboarding, nextGuidedTutorialKey, router, toRoute])

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    const shouldOpen =
      searchParams.get('guidedOnboarding') === '1' &&
      (!searchParams.get('guidedTutorial') || currentGuidedTutorialKey === 'conversations')

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
  }, [currentGuidedTutorialKey, guidedOpen, searchParams])

  useEffect(() => {
    if (!guidedOpen) return

    const scrollToTarget = () => {
      const target = resolveGuidedTargetElement(currentGuidedStep.target)
      if (!target) return
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    }

    const timeoutA = window.setTimeout(scrollToTarget, 80)
    const timeoutB = window.setTimeout(scrollToTarget, 260)
    return () => {
      window.clearTimeout(timeoutA)
      window.clearTimeout(timeoutB)
    }
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

  useEffect(() => {
    chatsRef.current = chats
  }, [chats])

  useEffect(() => {
    leadQueryResolvedRef.current = false
  }, [leadChatIdFromQuery, leadNameFromQuery, leadWhatsappFromQuery])

  useEffect(() => {
    hideGroupsInConversationsRef.current = hideGroupsInConversations
  }, [hideGroupsInConversations])

  useEffect(() => {
    if (!hasLeadQueryTarget || leadQueryResolvedRef.current) {
      return
    }

    const visibleChats = hideGroupsInConversations
      ? chats.filter((chat) => !isGroupChatEntry(chat))
      : chats
    if (visibleChats.length === 0) {
      return
    }

    const targetChat = findChatFromLeadQuery(visibleChats, {
      chatId: leadChatIdFromQuery,
      leadWhatsapp: leadWhatsappFromQuery,
      leadName: leadNameFromQuery
    })
    if (!targetChat) {
      return
    }

    leadQueryResolvedRef.current = true
    if (selectedChatIdRef.current !== targetChat.id) {
      setSelectedChatId(targetChat.id)
    }

    const query = new URLSearchParams(searchParams.toString())
    query.delete('chatId')
    query.delete('leadWhatsapp')
    query.delete('leadName')
    const queryString = query.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname)
  }, [
    chats,
    hasLeadQueryTarget,
    hideGroupsInConversations,
    leadChatIdFromQuery,
    leadNameFromQuery,
    leadWhatsappFromQuery,
    pathname,
    router,
    searchParams
  ])

  useEffect(() => {
    if (!hideGroupsInConversations) {
      return
    }

    if (activeFilter === 'groups') {
      setActiveFilter('all')
    }

    const selectedId = selectedChatIdRef.current
    if (!selectedId) {
      return
    }

    const selectedChat = chats.find((chat) => chat.id === selectedId)
    if (!selectedChat || !isGroupChatEntry(selectedChat)) {
      return
    }

    const fallbackChat = chats.find((chat) => !isGroupChatEntry(chat))
    setSelectedChatId(fallbackChat?.id ?? null)
  }, [activeFilter, chats, hideGroupsInConversations])

  useEffect(() => {
    mediaStateRef.current = mediaState
  }, [mediaState])

  const clearMediaCache = useCallback(() => {
    for (const url of mediaUrlRef.current.values()) {
      try {
        URL.revokeObjectURL(url)
      } catch {
        // Ignore cleanup errors.
      }
    }
    mediaUrlRef.current.clear()
    mediaOrderRef.current = []
    mediaInflightRef.current.clear()
    imageTargetsRef.current.clear()
    if (imageObserverRef.current) {
      imageObserverRef.current.disconnect()
      imageObserverRef.current = null
    }
    mediaStateRef.current = {}
    setMediaState({})
  }, [])

  useEffect(() => {
    return () => {
      clearMediaCache()
    }
  }, [clearMediaCache])

  const showToast = (message: string) => {
    setToast({ message })
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
    }
    toastTimerRef.current = setTimeout(() => {
      setToast(null)
    }, 10000)
  }

  const triggerAutoOffToast = (chatId: string, reason: ChatAutoOffReason | null) => {
    if (autoOffNotifiedRef.current.has(chatId)) return
    const chatName = chatsRef.current.find((chat) => chat.id === chatId)?.name || tr('esta conversa', 'this conversation')
    const toastMessage =
      reason === 'delivery_guard'
        ? tr(
            `A IA foi desativada automaticamente por entregabilidade em ${chatName}.`,
            `AI was automatically disabled by deliverability in ${chatName}.`
          )
        : reason === 'recent_human_activity'
          ? tr(
              `A IA foi desativada automaticamente por atividade humana recente em ${chatName}.`,
              `AI was automatically disabled by recent human activity in ${chatName}.`
            )
        : tr(
            `A IA foi desativada automaticamente por contexto em ${chatName}.`,
            `AI was automatically disabled by context in ${chatName}.`
          )

    showToast(toastMessage)
    autoOffNotifiedRef.current.add(chatId)
  }

  const preserveWindowScroll = () => {
    if (typeof window === 'undefined') return
    const currentScroll = window.scrollY
    requestAnimationFrame(() => {
      if (window.scrollY !== currentScroll) {
        window.scrollTo({ top: currentScroll })
      }
    })
  }

  const getTrainingFieldLabel = useCallback(
    (field: TrainingCompletenessFieldKey) => {
      if (field === 'nomeEmpresa') return tr('Nome da empresa', 'Company name')
      if (field === 'nomeIA') return tr('Nome da IA', 'AI name')
      if (field === 'tipoResposta') return tr('Tipo de resposta', 'Response style')
      if (field === 'empresa') return tr('Sobre a empresa', 'Company context')
      if (field === 'descricaoServicosProdutosVendidos') {
        return tr('Descrição comercial', 'Commercial description')
      }
      if (field === 'horarios') return tr('Horários', 'Business hours')
      if (field === 'orientacoesGerais') return tr('Orientações gerais', 'General guidance')
      if (field === 'orientacoesFollowUp') return tr('Orientações de follow-up', 'Follow-up guidance')
      return tr('Instruções de sugestões de CRM', 'CRM suggestion guidance')
    },
    [tr]
  )

  useEffect(() => {
    if (!userId || isSubaccount) {
      setIsAiEnabled(false)
      setHideGroupsInConversations(false)
      setChatConfigs({})
      setLoadingAi(false)
      return
    }

    setLoadingAi(true)
    let cancelled = false

    void (async () => {
      try {
        const payload = await fetchWithAuth<AiConfigResponsePayload>(
          `/api/ai-config?sessionId=${encodeURIComponent(userId)}`
        )
        if (cancelled) return
        setIsAiEnabled(payload?.enabled === true)
        setHideGroupsInConversations(payload?.training?.esconderGrupos === true)
      } catch (error) {
        console.error('Failed to load AI config:', error)
        if (cancelled) return
        setIsAiEnabled(false)
        setHideGroupsInConversations(false)
      } finally {
        if (cancelled) return
        setLoadingAi(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isSubaccount, userId])

  useEffect(() => {
    if (isSubaccount) {
      return
    }
    const now = Date.now()
    Object.entries(chatConfigs).forEach(([chatId, config]) => {
      const autoOffReason =
        config?.aiAutoOffReason ?? resolveAutoOffReason(config?.aiDisabledReason)
      const isAutoDisabled = config?.aiEnabled === false && autoOffReason !== null

      if (!isAutoDisabled) return
      if (autoOffNotifiedRef.current.has(chatId)) return

      const disabledAtMs = getTimestampMs(config.aiDisabledAt)
      if (disabledAtMs && now - disabledAtMs > 60000) return

      triggerAutoOffToast(chatId, autoOffReason)
    })
  }, [chatConfigs, isSubaccount])

  const persistGlobalAiToggle = async (checked: boolean, overrideSoftBlock = false): Promise<boolean> => {
    if (!userId || isSubaccount) return false

    const previous = isAiEnabled
    setIsAiEnabled(checked)
    setLoadingAi(true)
    let success = true

    try {
      await syncAiConfig({
        enabled: checked,
        sessionId: userId,
        ...(overrideSoftBlock ? { onboardingSoftBlockOverrideConfirmed: true } : {})
      })
      if (!checked) {
        setAiSoftBlockContext(null)
      }
    } catch (toggleError) {
      console.error('Failed to save AI config:', toggleError)
      setIsAiEnabled(previous)
      setError((toggleError as Error).message)
      success = false
    } finally {
      setLoadingAi(false)
    }
    return success
  }

  const resolveAiSoftBlockContext = async (): Promise<AiSoftBlockContext> => {
    let score: number | null = null
    let missingFields: TrainingCompletenessFieldKey[] = []

    if (db && userId) {
      try {
        const trainingDoc = await getDoc(doc(db, 'users', userId, 'settings', 'ai_training'))
        const rawInstructions = trainingDoc.exists() ? trainingDoc.data()?.instructions : null
        const instructions =
          rawInstructions && typeof rawInstructions === 'object' && !Array.isArray(rawInstructions)
            ? (rawInstructions as Record<string, unknown>)
            : {}
        const breakdown = computeTrainingCompleteness(instructions)
        score = breakdown.score
        missingFields = breakdown.missingOrPartial
      } catch (error) {
        console.warn('[conversations] Failed to load training completeness from Firestore:', error)
      }
    }

    if (score === null) {
      const payload = await fetchWithAuth<OnboardingStatePayload>('/api/onboarding/state')
      if (typeof payload?.state?.trainingScore === 'number') {
        score = payload.state.trainingScore
      }
    }

    return {
      score: Math.max(0, Math.min(100, Number(score ?? 0))),
      missingFields
    }
  }

  const handleAiToggle = async (checked: boolean) => {
    if (!userId || isSubaccount) return

    if (!checked) {
      await persistGlobalAiToggle(false)
      return
    }

    try {
      const context = await resolveAiSoftBlockContext()
      if (context.score < 70) {
        setAiSoftBlockContext(context)
        setShowAiSoftBlockModal(true)
        return
      }
      await persistGlobalAiToggle(true)
    } catch (toggleError) {
      console.error('Failed to validate AI enable soft-block:', toggleError)
      setError((toggleError as Error).message)
    }
  }

  const handleChatAiToggle = async (chatId: string, checked: boolean) => {
    if (!userId || isSubaccount) return

    const previous = chatConfigs[chatId]
    setChatConfigs((prev) => ({
      ...prev,
      [chatId]: {
        ...prev[chatId],
        aiEnabled: checked,
        aiDisabledByContext: checked ? false : prev[chatId]?.aiDisabledByContext,
        aiAutoOffReason: checked
          ? null
          : prev[chatId]?.aiAutoOffReason ?? resolveAutoOffReason(prev[chatId]?.aiDisabledReason),
        aiDisabledReason: checked ? null : prev[chatId]?.aiDisabledReason,
        aiDisabledAt: checked ? null : prev[chatId]?.aiDisabledAt
      }
    }))

    try {
      const payload = await fetchWithAuth<{ config?: ChatAiConfigPayload }>(
        `/api/conversations/chats/${encodeURIComponent(chatId)}/ai-config${buildSessionQuery({})}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ aiEnabled: checked })
        }
      )
      const nextConfig = payload?.config
      if (nextConfig) {
        setChatConfigs((prev) => ({
          ...prev,
          [chatId]: toChatConfig(nextConfig)
        }))
      }
    } catch (toggleError) {
      console.error('Failed to save AI config for chat:', toggleError)
      setChatConfigs((prev) => ({
        ...prev,
        [chatId]: previous ?? { aiEnabled: true }
      }))
    }
  }

  const chatsLoadedRef = useRef(false)
  const selectedChatIdRef = useRef<string | null>(null)

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId
  }, [selectedChatId])

  useEffect(() => {
    if (selectedChatId) {
      shouldScrollToBottomRef.current = true
    }
  }, [selectedChatId])

  useEffect(() => {
    setIsAssignmentModalOpen(false)
    setAssignmentDraftSubaccountUids([])
    setChatActionsMenuChatId(null)
  }, [selectedChatId])

  useEffect(() => {
    setAttachmentMenuOpen(false)
    setUploadProgress(null)
    setUploadingAttachment(false)
    setChatActionsMenuChatId(null)
    setQuickReplySuggestionsOpen(false)
    setActiveQuickReplyIndex(0)
  }, [selectedChatId])

  useEffect(() => {
    if (!quickRepliesMenuOpen) {
      return
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) {
        return
      }
      if (quickRepliesMenuRef.current?.contains(target)) {
        return
      }
      setQuickRepliesMenuOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [quickRepliesMenuOpen])

  useEffect(() => {
    if (!chatActionsMenuChatId) {
      return
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) {
        return
      }
      if (chatActionsMenuRef.current?.contains(target)) {
        return
      }
      setChatActionsMenuChatId(null)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [chatActionsMenuChatId])

  useEffect(() => {
    if (!shouldScrollToBottomRef.current || loadingMessages || messages.length === 0) return

    const container = messagesContainerRef.current
    if (!container) return

    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight
      shouldScrollToBottomRef.current = false
    })
  }, [loadingMessages, messages.length, selectedChatId])

  const fetchWithAuth = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!auth?.currentUser) {
      throw new Error('auth_unavailable')
    }

    const token = await auth.currentUser.getIdToken()
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${token}`
      }
    })

    const { payload, rawText } = await parseResponsePayload<T>(response)
    if (!response.ok) {
      const message = buildHttpErrorMessage(response.status, payload, rawText)
      throw new Error(message)
    }

    return (payload ?? ({} as T)) as T
  }, [])

  const buildSessionQuery = useCallback((entries: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams()
    if (userId) {
      params.set('sessionId', userId)
    }
    Object.entries(entries).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, String(value))
      }
    })
    const query = params.toString()
    return query ? `?${query}` : ''
  }, [userId])

  const resetQuickReplyDraft = useCallback(() => {
    setQuickReplyDraftId(null)
    setQuickReplyShortcutDraft('')
    setQuickReplyContentDraft('')
    setQuickReplyFormError(null)
  }, [])

  const lockQuickRepliesManagement = useCallback(() => {
    setCanManageQuickReplies(false)
    setQuickRepliesMenuOpen(false)
    setIsQuickRepliesModalOpen(false)
    resetQuickReplyDraft()
  }, [resetQuickReplyDraft])

  const loadQuickReplies = useCallback(async () => {
    if (!userId) {
      setQuickReplies([])
      setCanManageQuickReplies(false)
      setLoadingQuickReplies(false)
      return
    }

    setLoadingQuickReplies(true)
    try {
      const payload = await fetchWithAuth<{ quickReplies?: QuickReply[]; canManageQuickReplies?: boolean }>(
        `/api/conversations/quick-replies${buildSessionQuery({ limit: 200 })}`
      )
      const list = Array.isArray(payload?.quickReplies) ? payload.quickReplies : []
      const resolvedCanManageQuickReplies =
        typeof payload?.canManageQuickReplies === 'boolean' ? payload.canManageQuickReplies : !isSubaccount
      setCanManageQuickReplies(resolvedCanManageQuickReplies)
      setQuickReplies(sortQuickReplies(list))
    } catch (loadError) {
      console.error('Failed to load quick replies:', loadError)
      setQuickReplies([])
      const code = (loadError as Error).message?.trim().toLowerCase()
      if (!isSubaccount) {
        setCanManageQuickReplies(true)
      } else if (code === 'subaccount_forbidden') {
        setCanManageQuickReplies(false)
      }
      setQuickReplyFormError(formatQuickReplyApiError((loadError as Error).message, isEn))
    } finally {
      setLoadingQuickReplies(false)
    }
  }, [buildSessionQuery, fetchWithAuth, isSubaccount, userId])

  const openQuickRepliesModal = useCallback(() => {
    if (!canManageQuickReplies) {
      setQuickRepliesMenuOpen(false)
      return
    }
    setQuickRepliesMenuOpen(false)
    setIsQuickRepliesModalOpen(true)
    setQuickReplyFormError(null)
    void loadQuickReplies()
  }, [canManageQuickReplies, loadQuickReplies])

  const closeQuickRepliesModal = useCallback(() => {
    setIsQuickRepliesModalOpen(false)
    resetQuickReplyDraft()
    setQuickRepliesMenuOpen(false)
  }, [resetQuickReplyDraft])

  const handleEditQuickReply = useCallback((quickReply: QuickReply) => {
    setQuickReplyDraftId(quickReply.id)
    setQuickReplyShortcutDraft(`/${quickReply.shortcut}`)
    setQuickReplyContentDraft(quickReply.content)
    setQuickReplyFormError(null)
  }, [])

  const handleSaveQuickReply = useCallback(async () => {
    if (!userId || !canManageQuickReplies || savingQuickReply) {
      return
    }

    setSavingQuickReply(true)
    setQuickReplyFormError(null)

    try {
      const isEditing = Boolean(quickReplyDraftId)
      const path = isEditing
        ? `/api/conversations/quick-replies/${encodeURIComponent(quickReplyDraftId as string)}${buildSessionQuery({})}`
        : `/api/conversations/quick-replies${buildSessionQuery({})}`

      const payload = await fetchWithAuth<{ quickReply?: QuickReply }>(path, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          shortcut: quickReplyShortcutDraft,
          content: quickReplyContentDraft
        })
      })

      const saved = payload?.quickReply
      if (saved?.id) {
        setQuickReplies((prev) => {
          const withoutCurrent = prev.filter((item) => item.id !== saved.id)
          return sortQuickReplies([saved, ...withoutCurrent])
        })
      } else {
        await loadQuickReplies()
      }

      resetQuickReplyDraft()
      showToast(isEditing ? tr('Resposta rápida atualizada.', 'Quick reply updated.') : tr('Resposta rápida criada.', 'Quick reply created.'))
    } catch (saveError) {
      const code = (saveError as Error).message?.trim().toLowerCase()
      if (code === 'subaccount_forbidden') {
        lockQuickRepliesManagement()
      }
      setQuickReplyFormError(formatQuickReplyApiError((saveError as Error).message, isEn))
    } finally {
      setSavingQuickReply(false)
    }
  }, [
    buildSessionQuery,
    canManageQuickReplies,
    lockQuickRepliesManagement,
    loadQuickReplies,
    quickReplyContentDraft,
    quickReplyDraftId,
    quickReplyShortcutDraft,
    resetQuickReplyDraft,
    savingQuickReply,
    userId
  ])

  const handleDeleteQuickReply = useCallback(async (quickReply: QuickReply) => {
    if (!userId || !canManageQuickReplies || deletingQuickReplyId) {
      return
    }
    const confirmed = confirm(
      isEn ? `Delete quick reply "/${quickReply.shortcut}"?` : `Excluir a resposta rápida "/${quickReply.shortcut}"?`
    )
    if (!confirmed) {
      return
    }

    setDeletingQuickReplyId(quickReply.id)
    setQuickReplyFormError(null)

    try {
      await fetchWithAuth(
        `/api/conversations/quick-replies/${encodeURIComponent(quickReply.id)}${buildSessionQuery({})}`,
        { method: 'DELETE' }
      )
      setQuickReplies((prev) => prev.filter((item) => item.id !== quickReply.id))
      if (quickReplyDraftId === quickReply.id) {
        resetQuickReplyDraft()
      }
      showToast(tr('Resposta rápida excluída.', 'Quick reply deleted.'))
    } catch (deleteError) {
      const code = (deleteError as Error).message?.trim().toLowerCase()
      if (code === 'subaccount_forbidden') {
        lockQuickRepliesManagement()
      }
      setQuickReplyFormError(formatQuickReplyApiError((deleteError as Error).message, isEn))
    } finally {
      setDeletingQuickReplyId(null)
    }
  }, [
    buildSessionQuery,
    canManageQuickReplies,
    deletingQuickReplyId,
    lockQuickRepliesManagement,
    quickReplyDraftId,
    resetQuickReplyDraft,
    userId
  ])

  const resetLabelDraft = useCallback(() => {
    setLabelDraftId(null)
    setLabelNameDraft('')
    setLabelColorDraft(CHAT_LABEL_COLORS[0])
    setLabelFormError(null)
  }, [])

  const loadLabels = useCallback(async () => {
    if (!userId) {
      setLabels([])
      setLoadingLabels(false)
      return
    }

    setLoadingLabels(true)
    setLabelsError(null)
    try {
      const payload = await fetchWithAuth<{ labels?: ChatLabel[] }>(
        `/api/conversations/labels${buildSessionQuery({ limit: 200 })}`
      )
      setLabels(normalizeChatLabels(payload?.labels))
    } catch (loadError) {
      setLabelsError(formatLabelApiError((loadError as Error).message, isEn))
      setLabels([])
    } finally {
      setLoadingLabels(false)
    }
  }, [buildSessionQuery, fetchWithAuth, userId])

  const handleToggleChatActionsMenu = useCallback((chatId: string) => {
    setChatActionsMenuChatId((prev) => (prev === chatId ? null : chatId))
  }, [])

  const handleOpenLabelsModal = useCallback((chat: Chat) => {
    setChatActionsMenuChatId(null)
    setLabelsTargetChatId(chat.id)
    setLabelSelectionDraftIds(normalizeChatLabels(chat.labels).map((label) => label.id))
    setLabelsError(null)
    resetLabelDraft()
    setIsLabelsModalOpen(true)
    void loadLabels()
  }, [loadLabels, resetLabelDraft])

  const closeLabelsModal = useCallback(() => {
    if (savingChatLabels || savingLabel || deletingLabelId) {
      return
    }
    setIsLabelsModalOpen(false)
    setLabelsTargetChatId(null)
    setLabelSelectionDraftIds([])
    setLabelsError(null)
    resetLabelDraft()
  }, [deletingLabelId, resetLabelDraft, savingChatLabels, savingLabel])

  const toggleLabelSelectionDraft = useCallback((labelId: string, checked: boolean) => {
    setLabelSelectionDraftIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(labelId)
      } else {
        next.delete(labelId)
      }
      return Array.from(next)
    })
  }, [])

  const handleEditLabel = useCallback((label: ChatLabel) => {
    setLabelDraftId(label.id)
    setLabelNameDraft(label.name)
    setLabelColorDraft(label.colorHex)
    setLabelFormError(null)
  }, [])

  const handleSaveLabel = useCallback(async () => {
    if (!userId || isSubaccount || savingLabel) {
      return
    }

    setSavingLabel(true)
    setLabelFormError(null)
    try {
      const isEditing = Boolean(labelDraftId)
      const path = isEditing
        ? `/api/conversations/labels/${encodeURIComponent(labelDraftId as string)}${buildSessionQuery({})}`
        : `/api/conversations/labels${buildSessionQuery({})}`

      const payload = await fetchWithAuth<{ label?: ChatLabel }>(path, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          name: labelNameDraft,
          colorHex: labelColorDraft
        })
      })

      const saved = normalizeChatLabels(payload?.label ? [payload.label] : [])[0]
      if (saved) {
        setLabels((prev) => {
          const withoutCurrent = prev.filter((item) => item.id !== saved.id)
          return [saved, ...withoutCurrent]
        })
        setChats((prev) =>
          prev.map((chat) => ({
            ...chat,
            labels: normalizeChatLabels(chat.labels).map((label) =>
              label.id === saved.id ? saved : label
            )
          }))
        )
      } else {
        await loadLabels()
      }

      resetLabelDraft()
      showToast(isEditing ? tr('Etiqueta atualizada.', 'Label updated.') : tr('Etiqueta criada.', 'Label created.'))
    } catch (saveError) {
      setLabelFormError(formatLabelApiError((saveError as Error).message, isEn))
    } finally {
      setSavingLabel(false)
    }
  }, [
    buildSessionQuery,
    fetchWithAuth,
    isSubaccount,
    labelColorDraft,
    labelDraftId,
    labelNameDraft,
    loadLabels,
    resetLabelDraft,
    savingLabel,
    userId
  ])

  const handleDeleteLabel = useCallback(async (label: ChatLabel) => {
    if (!userId || isSubaccount || deletingLabelId) {
      return
    }
    const confirmed = confirm(isEn ? `Delete label "${label.name}"?` : `Excluir a etiqueta "${label.name}"?`)
    if (!confirmed) {
      return
    }

    setDeletingLabelId(label.id)
    setLabelFormError(null)
    try {
      await fetchWithAuth(
        `/api/conversations/labels/${encodeURIComponent(label.id)}${buildSessionQuery({})}`,
        { method: 'DELETE' }
      )

      setLabels((prev) => prev.filter((item) => item.id !== label.id))
      setLabelSelectionDraftIds((prev) => prev.filter((id) => id !== label.id))
      setChats((prev) =>
        prev.map((chat) => ({
          ...chat,
          labels: normalizeChatLabels(chat.labels).filter((item) => item.id !== label.id)
        }))
      )
      if (labelDraftId === label.id) {
        resetLabelDraft()
      }
      showToast(tr('Etiqueta excluída.', 'Label deleted.'))
    } catch (deleteError) {
      setLabelFormError(formatLabelApiError((deleteError as Error).message, isEn))
    } finally {
      setDeletingLabelId(null)
    }
  }, [
    buildSessionQuery,
    deletingLabelId,
    fetchWithAuth,
    isSubaccount,
    labelDraftId,
    resetLabelDraft,
    userId
  ])

  const handleSaveChatLabels = useCallback(async () => {
    if (!labelsTargetChatId || savingChatLabels) {
      return
    }

    setSavingChatLabels(true)
    setLabelsError(null)
    try {
      const payload = await fetchWithAuth<{ labels?: ChatLabel[] }>(
        `/api/conversations/chats/${encodeURIComponent(labelsTargetChatId)}/labels${buildSessionQuery({})}`,
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            labelIds: labelSelectionDraftIds
          })
        }
      )

      const persisted = normalizeChatLabels(payload?.labels)
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === labelsTargetChatId
            ? { ...chat, labels: persisted }
            : chat
        )
      )
      setIsLabelsModalOpen(false)
      setLabelsTargetChatId(null)
      showToast(tr('Etiquetas atualizadas na conversa.', 'Conversation labels updated.'))
    } catch (saveError) {
      setLabelsError(formatLabelApiError((saveError as Error).message, isEn))
    } finally {
      setSavingChatLabels(false)
    }
  }, [
    buildSessionQuery,
    fetchWithAuth,
    labelSelectionDraftIds,
    labelsTargetChatId,
    savingChatLabels
  ])

  const applyQuickReplySuggestion = useCallback((quickReply: QuickReply) => {
    setMessageText(quickReply.content)
    setQuickReplySuggestionsOpen(false)
    setActiveQuickReplyIndex(0)
    requestAnimationFrame(() => {
      composerTextareaRef.current?.focus()
    })
  }, [])

  const setMediaEntry = useCallback((mediaRef: string, entry: MediaLoadEntry) => {
    setMediaState((prev) => {
      const next = { ...prev, [mediaRef]: entry }
      mediaStateRef.current = next
      return next
    })
  }, [])

  const registerMediaUrl = useCallback((mediaRef: string, url: string) => {
    const previous = mediaUrlRef.current.get(mediaRef)
    if (previous && previous !== url) {
      try {
        URL.revokeObjectURL(previous)
      } catch {
        // Ignore cleanup errors.
      }
    }

    mediaUrlRef.current.set(mediaRef, url)
    mediaOrderRef.current = mediaOrderRef.current.filter((id) => id !== mediaRef)
    mediaOrderRef.current.push(mediaRef)

    while (mediaOrderRef.current.length > MEDIA_CACHE_MAX_ITEMS) {
      const evictedRef = mediaOrderRef.current.shift()
      if (!evictedRef) break

      const evictedUrl = mediaUrlRef.current.get(evictedRef)
      if (evictedUrl) {
        try {
          URL.revokeObjectURL(evictedUrl)
        } catch {
          // Ignore cleanup errors.
        }
      }

      mediaUrlRef.current.delete(evictedRef)
      setMediaState((prev) => {
        if (!prev[evictedRef]) {
          return prev
        }
        const next = { ...prev }
        delete next[evictedRef]
        mediaStateRef.current = next
        return next
      })
    }
  }, [])

  const ensureMediaLoaded = useCallback(async (message: Message, force = false) => {
    const mediaRef = message.mediaRef?.trim()
    if (!mediaRef) {
      return
    }

    const current = mediaStateRef.current[mediaRef]
    if (!force && current?.status === 'loaded' && current.url) {
      return
    }

    const existingTask = mediaInflightRef.current.get(mediaRef)
    if (existingTask) {
      await existingTask
      return
    }

    setMediaEntry(mediaRef, { status: 'loading' })

    const task = (async () => {
      if (!auth?.currentUser) {
        throw new Error('auth_unavailable')
      }

      const token = await auth.currentUser.getIdToken()
      const response = await fetch(
        `/api/conversations/chats/${encodeURIComponent(message.chatId)}/messages/${encodeURIComponent(mediaRef)}/media${buildSessionQuery({})}`,
        {
          headers: {
            authorization: `Bearer ${token}`
          },
          cache: 'no-store'
        }
      )

      if (!response.ok) {
        const { payload, rawText } = await parseResponsePayload(response)
        const code = buildHttpErrorMessage(response.status, payload, rawText)
        throw new Error(code)
      }

      const blob = await response.blob()
      if (blob.size <= 0) {
        throw new Error('media_unavailable')
      }

      const objectUrl = URL.createObjectURL(blob)
      registerMediaUrl(mediaRef, objectUrl)

      setMediaEntry(mediaRef, {
        status: 'loaded',
        url: objectUrl,
        contentType: blob.type || message.media?.mimeType
      })
    })()

    mediaInflightRef.current.set(mediaRef, task)
    try {
      await task
    } catch (loadError) {
      const code = loadError instanceof Error ? loadError.message : 'media_download_failed'
      setMediaEntry(mediaRef, {
        status: 'error',
        error: code
      })
    } finally {
      mediaInflightRef.current.delete(mediaRef)
    }
  }, [buildSessionQuery, registerMediaUrl, setMediaEntry])

  const messagesByMediaRef = useMemo(() => {
    const map = new Map<string, Message>()
    messages.forEach((message) => {
      if (message.mediaRef) {
        map.set(message.mediaRef, message)
      }
    })
    return map
  }, [messages])

  const registerImageTarget = useCallback((mediaRef: string | undefined, node: HTMLDivElement | null) => {
    if (!mediaRef) {
      return
    }

    const previousNode = imageTargetsRef.current.get(mediaRef)
    if (previousNode && imageObserverRef.current) {
      imageObserverRef.current.unobserve(previousNode)
    }

    if (!node) {
      imageTargetsRef.current.delete(mediaRef)
      return
    }

    node.dataset.mediaRef = mediaRef
    imageTargetsRef.current.set(mediaRef, node)
    if (imageObserverRef.current) {
      imageObserverRef.current.observe(node)
    }
  }, [])

  useEffect(() => {
    if (!selectedChatId) {
      if (imageObserverRef.current) {
        imageObserverRef.current.disconnect()
        imageObserverRef.current = null
      }
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return
          }
          const target = entry.target as HTMLDivElement
          const mediaRef = target.dataset.mediaRef
          if (!mediaRef) {
            return
          }
          const message = messagesByMediaRef.get(mediaRef)
          if (!message) {
            return
          }
          const mediaType = message.media?.mediaType ?? message.type
          if (mediaType !== 'imageMessage' && mediaType !== 'stickerMessage') {
            return
          }
          void ensureMediaLoaded(message)
          observer.unobserve(target)
        })
      },
      {
        root: messagesContainerRef.current,
        rootMargin: '180px 0px',
        threshold: 0.01
      }
    )

    imageObserverRef.current = observer
    imageTargetsRef.current.forEach((node) => {
      observer.observe(node)
    })

    return () => {
      observer.disconnect()
      if (imageObserverRef.current === observer) {
        imageObserverRef.current = null
      }
    }
  }, [ensureMediaLoaded, messagesByMediaRef, selectedChatId])

  const openDocumentMessage = useCallback(async (message: Message) => {
    if (!message.mediaRef) {
      return
    }

    await ensureMediaLoaded(message)
    const loaded = mediaStateRef.current[message.mediaRef]
    if (loaded?.status !== 'loaded' || !loaded.url) {
      return
    }

    const popup = window.open(loaded.url, '_blank', 'noopener,noreferrer')
    if (popup) {
      return
    }

    const anchor = document.createElement('a')
    anchor.href = loaded.url
    anchor.target = '_blank'
    anchor.rel = 'noreferrer'
    anchor.click()
  }, [ensureMediaLoaded])

  const handleBulkAiUpdate = async (enabled: boolean) => {
    if (!userId || isSubaccount) {
      return
    }

    const confirmMessage = enabled
      ? tr('Tem certeza que deseja ligar a IA em todas as conversas existentes?', 'Are you sure you want to enable AI for all existing conversations?')
      : tr('Tem certeza que deseja desligar a IA em todas as conversas existentes?', 'Are you sure you want to disable AI for all existing conversations?')

    if (!confirm(confirmMessage)) {
      return
    }

    const action = enabled ? 'enable' : 'disable'
    setBulkAction(action)

    try {
      const payload = await fetchWithAuth<{ totalChats?: number; updated?: number }>(
        `/api/conversations/chats/ai-configs/${enabled ? 'enable-all' : 'disable-all'}${buildSessionQuery({})}`,
        { method: 'POST' }
      )
      await loadChatConfigs()

      const total = typeof payload?.totalChats === 'number' ? payload.totalChats : undefined
      if (typeof total === 'number') {
        const label = enabled
          ? tr('ativada', 'enabled')
          : tr('desativada', 'disabled')
        showToast(
          isEn
            ? `AI ${label} in ${total} conversation${total === 1 ? '' : 's'}.`
            : `IA ${label} em ${total} conversa${total === 1 ? '' : 's'}.`
        )
      } else {
        showToast(
          enabled
            ? tr('IA ativada em todas as conversas existentes.', 'AI enabled in all existing conversations.')
            : tr('IA desativada em todas as conversas existentes.', 'AI disabled in all existing conversations.')
        )
      }
    } catch (bulkError) {
      console.error('Failed to bulk update AI:', bulkError)
      showToast(
        enabled
          ? tr('Falha ao ativar a IA em todas as conversas.', 'Failed to enable AI in all conversations.')
          : tr('Falha ao desativar a IA em todas as conversas.', 'Failed to disable AI in all conversations.')
      )
    } finally {
      setBulkAction(null)
    }
  }

  const loadChatConfigs = async () => {
    if (!userId || isSubaccount) {
      setChatConfigs({})
      return
    }

    try {
      const payload = await fetchWithAuth<{ configs?: ChatAiConfigPayload[] }>(
        `/api/conversations/chats/ai-configs${buildSessionQuery({ limit: 2000 })}`
      )
      const configsList = Array.isArray(payload.configs) ? payload.configs : []
      const nextConfigs: Record<string, ChatConfig> = {}
      configsList.forEach((config) => {
        if (config?.chatId) {
          nextConfigs[config.chatId] = toChatConfig(config)
        }
      })
      setChatConfigs(nextConfigs)
    } catch (error) {
      console.error('Failed to load chat configs:', error)
    }
  }

  const loadSubaccounts = async () => {
    if (!userId || isSubaccount) {
      setSubaccounts([])
      setLoadingSubaccounts(false)
      return
    }

    setLoadingSubaccounts(true)
    try {
      const payload = await fetchWithAuth<{ subaccounts?: Subaccount[] }>('/api/subaccounts')
      const list = Array.isArray(payload?.subaccounts) ? payload.subaccounts : []
      setSubaccounts(list)
    } catch (loadError) {
      console.error('Failed to load sub-accounts:', loadError)
      setSubaccounts([])
    } finally {
      setLoadingSubaccounts(false)
    }
  }

  const updateChatAssignedSubaccounts = useCallback((chatId: string, subaccountUids: string[]) => {
    const nextUids = normalizeUidArray(subaccountUids)
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) {
          return chat
        }
        return {
          ...chat,
          assignedSubaccountUids: nextUids
        }
      })
    )
  }, [])

  const saveChatAssignment = async (chatId: string, nextAssignedUids: string[]) => {
    const chat = chatsRef.current.find((entry) => entry.id === chatId)
    const currentAssigned = normalizeUidArray(chat?.assignedSubaccountUids)
    const nextAssigned = normalizeUidArray(nextAssignedUids)
    setAssignmentError(null)
    setSavingAssignment(true)
    updateChatAssignedSubaccounts(chatId, nextAssigned)

    try {
      const payload = await fetchWithAuth<{ assignment?: { subaccountUids?: string[] } }>(
        '/api/subaccounts/assignments',
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            chatId,
            subaccountUids: nextAssigned
          })
        }
      )
      const persisted = normalizeUidArray(payload?.assignment?.subaccountUids)
      updateChatAssignedSubaccounts(chatId, persisted)
      return true
    } catch (saveError) {
      updateChatAssignedSubaccounts(chatId, currentAssigned)
      const code = saveError instanceof Error ? saveError.message : 'chat_assignment_save_failed'
      setAssignmentError(formatSubaccountApiError(code, isEn))
      return false
    } finally {
      setSavingAssignment(false)
    }
  }


  const loadChats = async () => {
    if (!userId) {
      return
    }

    if (!chatsLoadedRef.current) {
      setLoadingChats(true)
    }

    try {
      const payload = await fetchWithAuth<{ chats?: Chat[] }>(
        `/api/conversations/chats${buildSessionQuery({ limit: 50 })}`
      )
      const nextChats = (Array.isArray(payload.chats) ? payload.chats : []).map((chat) => ({
        ...chat,
        isGroup: isGroupChatEntry(chat),
        manualUnread: chat.manualUnread === true,
        labels: normalizeChatLabels(chat.labels)
      }))
      setChats(nextChats)
      chatsLoadedRef.current = true
      setLoadingChats(false)
      setError(null)

      const visibleChats = hideGroupsInConversationsRef.current
        ? nextChats.filter((chat) => !isGroupChatEntry(chat))
        : nextChats

      if (!selectedChatIdRef.current && visibleChats.length > 0) {
        setSelectedChatId(visibleChats[0].id)
      } else if (
        selectedChatIdRef.current &&
        !visibleChats.some((chat) => chat.id === selectedChatIdRef.current)
      ) {
        setSelectedChatId(visibleChats[0]?.id ?? null)
      }
    } catch (loadError) {
      setLoadingChats(false)
      setError((loadError as Error).message)
    }
  }

  const loadMessages = async (chatId: string, showLoading = false) => {
    if (!userId) {
      return
    }

    if (showLoading) {
      setLoadingMessages(true)
    }

    try {
      const payload = await fetchWithAuth<{ messages?: Message[] }>(
        `/api/conversations/chats/${encodeURIComponent(chatId)}/messages${buildSessionQuery({ limit: 60 })}`
      )
      const incoming = Array.isArray(payload.messages) ? payload.messages : []

      setMessages((prev) => {
        const pending = prev.filter((msg) => msg.pending)
        const confirmedIds = new Set(
          incoming
            .map((msg) => msg.requestId)
            .filter((id): id is string => Boolean(id))
        )
        const remaining = pending.filter((msg) => !msg.requestId || !confirmedIds.has(msg.requestId))
        const merged = [...incoming, ...remaining].sort((a, b) => a.timestampMs - b.timestampMs)
        return merged
      })

      if (selectedChatIdRef.current === chatId) {
        void markChatRead(chatId)
      }

      if (showLoading) {
        setLoadingMessages(false)
      }
      setError(null)
    } catch (loadError) {
      if (showLoading) {
        setLoadingMessages(false)
      }
      setError((loadError as Error).message)
    }
  }

  const markChatRead = async (chatId: string): Promise<boolean> => {
    if (!userId) {
      return false
    }

    try {
      await fetchWithAuth(
        `/api/conversations/chats/${encodeURIComponent(chatId)}/read${buildSessionQuery({})}`,
        { method: 'POST' }
      )
      return true
    } catch (readError) {
      console.warn('[ConversationsPanel] Failed to mark as read', readError)
      return false
    }
  }

  const markChatUnread = async (chatId: string): Promise<boolean> => {
    if (!userId) {
      return false
    }

    try {
      await fetchWithAuth(
        `/api/conversations/chats/${encodeURIComponent(chatId)}/unread${buildSessionQuery({})}`,
        { method: 'POST' }
      )
      return true
    } catch (unreadError) {
      console.warn('[ConversationsPanel] Failed to mark as unread', unreadError)
      return false
    }
  }

  const handleMarkChatAsRead = useCallback(async (chat: Chat) => {
    setChatActionsMenuChatId(null)
    const previousUnreadCount = chat.unreadCount
    const previousManualUnread = chat.manualUnread === true
    setChats((prev) =>
      prev.map((row) =>
        row.id === chat.id ? { ...row, unreadCount: 0, manualUnread: false } : row
      )
    )
    const ok = await markChatRead(chat.id)
    if (!ok) {
      setChats((prev) =>
        prev.map((row) =>
          row.id === chat.id
            ? { ...row, unreadCount: previousUnreadCount, manualUnread: previousManualUnread }
            : row
        )
      )
      showToast(tr('Falha ao marcar a conversa como lida.', 'Failed to mark conversation as read.'))
    }
  }, [markChatRead])

  const handleMarkChatAsUnread = useCallback(async (chat: Chat) => {
    setChatActionsMenuChatId(null)
    const previousManualUnread = chat.manualUnread === true
    setChats((prev) =>
      prev.map((row) =>
        row.id === chat.id ? { ...row, manualUnread: true } : row
      )
    )
    const ok = await markChatUnread(chat.id)
    if (!ok) {
      setChats((prev) =>
        prev.map((row) =>
          row.id === chat.id ? { ...row, manualUnread: previousManualUnread } : row
        )
      )
      showToast(tr('Falha ao marcar a conversa como não lida.', 'Failed to mark conversation as unread.'))
    }
  }, [markChatUnread])

  useEffect(() => {
    if (!userId) {
      setChats([])
      setMessages([])
      clearMediaCache()
      setSubaccounts([])
      setLoadingSubaccounts(false)
      setSavingAssignment(false)
      setIsAssignmentModalOpen(false)
      setAssignmentDraftSubaccountUids([])
      setAssignmentError(null)
      setSelectedChatId(null)
      setMessageText('')
      setAttachmentMenuOpen(false)
      setSelectedAttachmentFile(null)
      setUploadProgress(null)
      setUploadingAttachment(false)
      setContactMode(false)
      setContactDisplayNameDraft('')
      setContactNameDraft('')
      setContactWhatsappDraft('')
      setSendingComposer(false)
      setLoadingChats(false)
      setLoadingMessages(false)
      setQuickReplies([])
      setCanManageQuickReplies(false)
      setLoadingQuickReplies(false)
      setQuickRepliesMenuOpen(false)
      setChatActionsMenuChatId(null)
      setDeletingChatId(null)
      setIsQuickRepliesModalOpen(false)
      setIsLabelsModalOpen(false)
      setLabels([])
      setLoadingLabels(false)
      setLabelsError(null)
      setLabelsTargetChatId(null)
      setLabelSelectionDraftIds([])
      setSavingChatLabels(false)
      setLabelDraftId(null)
      setLabelNameDraft('')
      setLabelColorDraft(CHAT_LABEL_COLORS[0])
      setLabelFormError(null)
      setSavingLabel(false)
      setDeletingLabelId(null)
      setQuickReplyDraftId(null)
      setQuickReplyShortcutDraft('')
      setQuickReplyContentDraft('')
      setQuickReplyFormError(null)
      setSavingQuickReply(false)
      setDeletingQuickReplyId(null)
      setQuickReplySuggestionsOpen(false)
      setActiveQuickReplyIndex(0)
      setError(null)
      chatsLoadedRef.current = false
      return
    }

    clearMediaCache()
    setAssignmentError(null)
    setCanManageQuickReplies(!isSubaccount)

    void loadChats()
    void loadLabels()
    void loadQuickReplies()
    if (!isSubaccount) {
      void loadChatConfigs()
      void loadSubaccounts()
    } else {
      setChatConfigs({})
      setSubaccounts([])
    }
    const interval = setInterval(() => {
      void loadChats()
      if (!isSubaccount) {
        void loadChatConfigs()
      }
    }, 15000)
    return () => {
      clearInterval(interval)
    }
  }, [clearMediaCache, isSubaccount, loadLabels, loadQuickReplies, userId])

  useEffect(() => {
    if (!userId || !selectedChatId) {
      setMessages([])
      return
    }

    void loadMessages(selectedChatId, true)
    const interval = setInterval(() => {
      void loadMessages(selectedChatId, false)
    }, 5000)

    return () => {
      clearInterval(interval)
    }
  }, [userId, selectedChatId])

  const clearSelectedAttachment = useCallback(() => {
    setSelectedAttachmentFile(null)
    setUploadProgress(null)
    setUploadingAttachment(false)
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = ''
    }
  }, [])

  const clearContactDraft = useCallback(() => {
    setContactDisplayNameDraft('')
    setContactNameDraft('')
    setContactWhatsappDraft('')
    setContactMode(false)
  }, [])

  const buildRequestId = useCallback(() => {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `req-${Date.now()}`
  }, [])

  const pushOptimisticMessage = useCallback((message: Message) => {
    shouldScrollToBottomRef.current = true
    setMessages((prev) => [...prev, message])
  }, [])

  const updateChatLastMessage = useCallback((chatId: string, lastMessage: Chat['lastMessage']) => {
    const now = Date.now()
    setChats((prev) => {
      const updated = prev.map((chat) => {
        if (chat.id !== chatId) {
          return chat
        }

        return {
          ...chat,
          lastMessage,
          lastActivityMs: now,
          unreadCount: 0,
          manualUnread: false
        }
      })

      const chatIndex = updated.findIndex((chat) => chat.id === chatId)
      if (chatIndex > 0) {
        const [movedChat] = updated.splice(chatIndex, 1)
        return [movedChat, ...updated]
      }
      return updated
    })
  }, [])

  const markSendFailed = useCallback((requestId: string, sendError: unknown) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.requestId === requestId ? { ...msg, pending: false, failed: true } : msg
      )
    )
    setError((sendError as Error).message)
  }, [])

  const uploadAttachment = useCallback(async (sessionId: string, requestId: string, file: File) => {
    if (!storage) {
      throw new Error('storage_unavailable')
    }

    const safeFileName = sanitizeComposerFilename(file.name)
    const path = `users/${sessionId}/conversas/${requestId}-${safeFileName}`
    const uploadRef = storageRef(storage, path)
    const task = uploadBytesResumable(uploadRef, file, {
      ...(file.type ? { contentType: file.type } : {})
    })

    const url = await new Promise<string>((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          if (snapshot.totalBytes > 0) {
            const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            setUploadProgress(progress)
          }
        },
        (error) => reject(error),
        async () => {
          try {
            resolve(await getDownloadURL(task.snapshot.ref))
          } catch (error) {
            reject(error)
          }
        }
      )
    })

    return {
      url,
      mediaType: composerMediaTypeFromFile(file),
      mimeType: file.type || undefined,
      fileName: file.name || undefined
    }
  }, [])

  const handleSelectChat = (chatId: string) => {
    preserveWindowScroll()
    setSelectedChatId(chatId)
    setAssignmentError(null)
    setMessages([])
    setAttachmentMenuOpen(false)
    setQuickRepliesMenuOpen(false)
    setQuickReplySuggestionsOpen(false)
    setActiveQuickReplyIndex(0)
    clearSelectedAttachment()
    clearContactDraft()

    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0, manualUnread: false } : chat))
    )

    void markChatRead(chatId)
  }

  const handleFilePicked = useCallback((picked: File | null) => {
    if (!picked) {
      return
    }

    if (picked.size > COMPOSER_MAX_ATTACHMENT_BYTES) {
      setError(
        tr(
          `Arquivo muito grande (max ${(COMPOSER_MAX_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0)}MB).`,
          `File is too large (max ${(COMPOSER_MAX_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0)}MB).`
        )
      )
      clearSelectedAttachment()
      return
    }

    setContactMode(false)
    setSelectedAttachmentFile(picked)
    setUploadProgress(null)
    setAttachmentMenuOpen(false)
  }, [clearSelectedAttachment])

  const handleSendMessage = async () => {
    if (!userId || !selectedChatId || sendingComposer) return

    const text = messageText.trim()
    const contactName = contactNameDraft.trim()
    const contactWhatsapp = normalizeWhatsappDigits(contactWhatsappDraft)
    const contactDisplayName = contactDisplayNameDraft.trim()
    const hasFile = Boolean(selectedAttachmentFile)
    const shouldSendContact = contactMode && !hasFile

    if (!text && !hasFile && !shouldSendContact) {
      return
    }

    const requestId = buildRequestId()
    const now = Date.now()
    setSendingComposer(true)
    setAttachmentMenuOpen(false)
    setError(null)

    try {
      if (hasFile && selectedAttachmentFile) {
        const optimisticMessage: Message = {
          id: `temp-${requestId}`,
          type: composerMediaTypeFromFile(selectedAttachmentFile),
          text: text || null,
          timestampMs: now,
          chatId: selectedChatId,
          fromMe: true,
          origin: 'human_dashboard',
          requestId,
          pending: true,
          media: {
            mediaType: composerMediaTypeFromFile(selectedAttachmentFile),
            ...(selectedAttachmentFile.type ? { mimeType: selectedAttachmentFile.type } : {}),
            ...(selectedAttachmentFile.name ? { fileName: selectedAttachmentFile.name } : {}),
            ...(selectedAttachmentFile.size > 0 ? { sizeBytes: selectedAttachmentFile.size } : {}),
            ...(text ? { caption: text } : {})
          }
        }
        pushOptimisticMessage(optimisticMessage)
        updateChatLastMessage(selectedChatId, {
          text: text || null,
          type: optimisticMessage.type,
          timestampMs: now,
          fromMe: true
        })

        setUploadingAttachment(true)
        const uploaded = await uploadAttachment(userId, requestId, selectedAttachmentFile)
        setUploadingAttachment(false)
        setUploadProgress(null)

        await fetchWithAuth('/api/conversations/messages/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: userId,
            chatId: selectedChatId,
            ...(text ? { text } : {}),
            media: {
              url: uploaded.url,
              mediaType: uploaded.mediaType,
              ...(uploaded.mimeType ? { mimeType: uploaded.mimeType } : {}),
              ...(uploaded.fileName ? { fileName: uploaded.fileName } : {}),
              ...(text ? { caption: text } : {}),
              storagePolicy: 'ttl_15d'
            },
            idempotencyKey: requestId
          })
        })

        setMessageText('')
        clearSelectedAttachment()
        return
      }

      if (shouldSendContact) {
        if (!contactName || !contactWhatsapp) {
          throw new Error(tr('Nome e WhatsApp validos são obrigatorios para enviar contato.', 'Valid name and WhatsApp are required to send a contact.'))
        }

        const optimisticMessage: Message = {
          id: `temp-${requestId}`,
          type: 'contactMessage',
          text: contactDisplayName || contactName,
          timestampMs: now,
          chatId: selectedChatId,
          fromMe: true,
          origin: 'human_dashboard',
          requestId,
          pending: true,
          contact: {
            ...(contactDisplayName ? { displayName: contactDisplayName } : {}),
            contacts: [{ name: contactName, whatsapp: contactWhatsapp }]
          }
        }
        pushOptimisticMessage(optimisticMessage)
        updateChatLastMessage(selectedChatId, {
          text: contactDisplayName || contactName,
          type: 'contactMessage',
          timestampMs: now,
          fromMe: true
        })

        await fetchWithAuth('/api/conversations/messages/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: userId,
            chatId: selectedChatId,
            contact: {
              ...(contactDisplayName ? { displayName: contactDisplayName } : {}),
              contacts: [{ name: contactName, whatsapp: contactWhatsapp }]
            },
            idempotencyKey: requestId
          })
        })

        clearContactDraft()
        return
      }

      if (!text) {
        return
      }

      const optimisticMessage: Message = {
        id: `temp-${requestId}`,
        type: 'text',
        text,
        timestampMs: now,
        chatId: selectedChatId,
        fromMe: true,
        origin: 'human_dashboard',
        requestId,
        pending: true
      }
      pushOptimisticMessage(optimisticMessage)
      updateChatLastMessage(selectedChatId, {
        text,
        type: 'text',
        timestampMs: now,
        fromMe: true
      })

      setMessageText('')
      await fetchWithAuth('/api/conversations/messages/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: userId,
          chatId: selectedChatId,
          text,
          idempotencyKey: requestId
        })
      })
    } catch (sendError) {
      setUploadingAttachment(false)
      setUploadProgress(null)
      markSendFailed(requestId, sendError)
    } finally {
      setSendingComposer(false)
    }
  }

  const quickReplyQuery = useMemo(() => parseQuickReplyQuery(messageText), [messageText])
  const quickReplySuggestions = useMemo(() => {
    if (!selectedChatId || contactMode || quickReplyQuery === null) {
      return []
    }
    const source = quickReplies
      .filter((item) => (quickReplyQuery ? item.shortcut.startsWith(quickReplyQuery) : true))
      .slice(0, 8)
    return source
  }, [contactMode, quickReplies, quickReplyQuery, selectedChatId])

  useEffect(() => {
    if (!selectedChatId || contactMode || quickReplyQuery === null || quickReplySuggestions.length === 0) {
      setQuickReplySuggestionsOpen(false)
      setActiveQuickReplyIndex(0)
      return
    }

    setQuickReplySuggestionsOpen(true)
    setActiveQuickReplyIndex((prev) => {
      if (prev < 0 || prev >= quickReplySuggestions.length) {
        return 0
      }
      return prev
    })
  }, [contactMode, quickReplyQuery, quickReplySuggestions.length, selectedChatId])

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const hasSuggestions = quickReplySuggestionsOpen && quickReplySuggestions.length > 0
    if (hasSuggestions) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveQuickReplyIndex((prev) => (prev + 1) % quickReplySuggestions.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveQuickReplyIndex((prev) =>
          prev === 0 ? quickReplySuggestions.length - 1 : prev - 1
        )
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setQuickReplySuggestionsOpen(false)
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        const selectedQuickReply =
          quickReplySuggestions[activeQuickReplyIndex] ?? quickReplySuggestions[0]
        if (selectedQuickReply) {
          applyQuickReplySuggestion(selectedQuickReply)
        }
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSendMessage()
    }
  }

  const filteredChats = useMemo(() => {
    let result = chats

    if (hideGroupsInConversations) {
      result = result.filter((chat) => !isGroupChatEntry(chat))
    }

    if (activeFilter === 'unread') {
      result = result.filter((chat) => chat.unreadCount > 0 || chat.manualUnread === true)
    } else if (activeFilter === 'groups') {
      result = result.filter((chat) => isGroupChatEntry(chat))
    }

    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase()
      result = result.filter(
        (chat) => chat.name.toLowerCase().includes(search) || chat.id.toLowerCase().includes(search)
      )
    }
    return result.slice(0, 50)
  }, [chats, searchTerm, activeFilter, hideGroupsInConversations])

  const selectedChat = chats.find((chat) => chat.id === selectedChatId)
  const labelsTargetChat = chats.find((chat) => chat.id === labelsTargetChatId)
  const labelSelectionDraftIdSet = useMemo(
    () => new Set(labelSelectionDraftIds),
    [labelSelectionDraftIds]
  )
  const canManageLabelsCrud = !isSubaccount
  const selectedAssignedSubaccountUids = useMemo(
    () => normalizeUidArray(selectedChat?.assignedSubaccountUids),
    [selectedChat?.assignedSubaccountUids]
  )
  const selectedAssignedSubaccountLabels = useMemo(() => {
    if (selectedAssignedSubaccountUids.length === 0) {
      return []
    }
    const byUid = new Map(subaccounts.map((subaccount) => [subaccount.uid, subaccount]))
    return selectedAssignedSubaccountUids.map((uid) => {
      const subaccount = byUid.get(uid)
      if (!subaccount) {
        return uid
      }
      return formatSubaccountLabel(subaccount)
    })
  }, [selectedAssignedSubaccountUids, subaccounts])
  const assignmentDraftUidSet = useMemo(
    () => new Set(assignmentDraftSubaccountUids),
    [assignmentDraftSubaccountUids]
  )

  const handleDeleteChat = useCallback(async (chat: Chat) => {
    if (!userId || isSubaccount || deletingChatId) {
      return
    }

    const confirmed = confirm(
      tr(
        'Tem certeza que deseja excluir esta conversa? Todo o histórico de mensagens e mídias será apagado permanentemente.',
        'Are you sure you want to delete this conversation? The entire message and media history will be permanently removed.'
      )
    )
    if (!confirmed) {
      return
    }

    setDeletingChatId(chat.id)
    setChatActionsMenuChatId(null)

    try {
      await fetchWithAuth(
        `/api/conversations/chats/${encodeURIComponent(chat.id)}${buildSessionQuery({})}`,
        { method: 'DELETE' }
      )

      const deletedIndex = filteredChats.findIndex((entry) => entry.id === chat.id)
      const nextVisibleChats = filteredChats.filter((entry) => entry.id !== chat.id)
      const nextSelectedChatId =
        selectedChatId === chat.id
          ? (
              nextVisibleChats[deletedIndex]?.id ??
              nextVisibleChats[Math.max(0, deletedIndex - 1)]?.id ??
              nextVisibleChats[0]?.id ??
              null
            )
          : selectedChatId

      setChats((prev) => prev.filter((entry) => entry.id !== chat.id))
      setChatConfigs((prev) => {
        if (!(chat.id in prev)) {
          return prev
        }
        const next = { ...prev }
        delete next[chat.id]
        return next
      })

      if (selectedChatId === chat.id) {
        setMessages([])
        clearMediaCache()
        setSelectedChatId(nextSelectedChatId)
      }

      if (labelsTargetChatId === chat.id) {
        setLabelsTargetChatId(null)
        setLabelSelectionDraftIds([])
        setIsLabelsModalOpen(false)
      }

      if (selectedChatId === chat.id) {
        setIsAssignmentModalOpen(false)
        setAssignmentDraftSubaccountUids([])
        setAssignmentError(null)
      }

      setError(null)
      showToast(tr('Conversa excluída com sucesso.', 'Conversation deleted successfully.'))
    } catch (deleteError) {
      console.error('[ConversationsPanel] Failed to delete conversation', deleteError)
      showToast(tr('Falha ao excluir a conversa.', 'Failed to delete conversation.'))
    } finally {
      setDeletingChatId(null)
    }
  }, [
    buildSessionQuery,
    clearMediaCache,
    deletingChatId,
    fetchWithAuth,
    filteredChats,
    isSubaccount,
    labelsTargetChatId,
    selectedChatId,
    tr,
    userId
  ])

  const openAssignmentModal = useCallback(() => {
    setAssignmentError(null)
    setAssignmentDraftSubaccountUids(selectedAssignedSubaccountUids)
    setIsAssignmentModalOpen(true)
  }, [selectedAssignedSubaccountUids])

  const toggleAssignmentDraftSubaccount = useCallback((subaccountUid: string, checked: boolean) => {
    setAssignmentDraftSubaccountUids((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(subaccountUid)
      } else {
        next.delete(subaccountUid)
      }
      return Array.from(next)
    })
  }, [])

  const handleSaveAssignmentModal = async () => {
    if (isSubaccount || savingAssignment) {
      return
    }

    const chatId = selectedChatIdRef.current
    if (!chatId) {
      setIsAssignmentModalOpen(false)
      return
    }

    const ok = await saveChatAssignment(chatId, assignmentDraftSubaccountUids)
    if (ok) {
      setIsAssignmentModalOpen(false)
    }
  }

  const canSendComposer = useMemo(() => {
    if (!selectedChatId || sendingComposer || uploadingAttachment) {
      return false
    }
    if (selectedAttachmentFile) {
      return true
    }
    if (contactMode) {
      return Boolean(contactNameDraft.trim() && normalizeWhatsappDigits(contactWhatsappDraft))
    }
    return Boolean(messageText.trim())
  }, [
    selectedChatId,
    sendingComposer,
    uploadingAttachment,
    selectedAttachmentFile,
    contactMode,
    contactNameDraft,
    contactWhatsappDraft,
    messageText
  ])

  if (!userId) {
    return (
      <div className="bg-surface-light border border-surface-lighter rounded-2xl p-8 text-center text-gray-400">
        {tr('Selecione um usuario para carregar as conversas.', 'Select a user to load conversations.')}
      </div>
    )
  }

  return (
    <div className="flex h-full max-h-[820px] min-h-0 bg-surface-light border border-surface-lighter rounded-2xl overflow-hidden shadow-xl">
      {toast && (
        <div className="fixed top-12 right-6 z-[80] max-w-sm">
          <div className="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-900 px-4 py-3 shadow-lg">
            <AlertCircle className="w-5 h-5 text-amber-300" />
            <p className="text-sm text-amber-100">{toast.message}</p>
          </div>
        </div>
      )}
      {isAssignmentModalOpen && !isSubaccount ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={tr('Fechar modal de sub-contas', 'Close sub-accounts modal')}
            className="absolute inset-0 bg-black/70"
            onClick={() => {
              if (!savingAssignment) {
                setIsAssignmentModalOpen(false)
              }
            }}
          />
          <div className="relative w-full max-w-2xl rounded-2xl border border-surface-lighter bg-surface shadow-2xl overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-surface-lighter">
              <div>
                <p className="text-base font-semibold text-white">{tr('Atribuir sub-contas', 'Assign sub-accounts')}</p>
                <p className="text-xs text-gray-400">
                  {tr('Selecione quem pode acessar', 'Select who can access')} {selectedChat?.name || tr('esta conversa', 'this conversation')}.
                </p>
              </div>
              <span className="text-xs text-gray-400">
                {assignmentDraftSubaccountUids.length}/{subaccounts.length}
              </span>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-2">
              {loadingSubaccounts ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {tr('Carregando sub-contas...', 'Loading sub-accounts...')}
                </div>
              ) : subaccounts.length === 0 ? (
                <p className="text-xs text-gray-400">
                  {tr('Nenhuma subconta cadastrada em Configurações.', 'No sub-accounts registered in Settings.')}
                </p>
              ) : (
                subaccounts.map((subaccount) => {
                  const checked = assignmentDraftUidSet.has(subaccount.uid)
                  return (
                    <label
                      key={subaccount.uid}
                      className={cn(
                        'flex items-start gap-2 rounded-lg border border-surface-lighter bg-surface-light px-3 py-2 text-xs',
                        savingAssignment && 'opacity-80'
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-primary"
                        checked={checked}
                        disabled={savingAssignment}
                        onChange={(event) => {
                          toggleAssignmentDraftSubaccount(subaccount.uid, event.target.checked)
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-white">
                          {formatSubaccountLabel(subaccount)}
                        </span>
                        <span className="block truncate text-gray-400">{subaccount.email}</span>
                      </span>
                    </label>
                  )
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-surface-lighter bg-surface-light/70">
              {assignmentError ? (
                <p className="text-xs text-red-300">{assignmentError}</p>
              ) : (
                <span className="text-xs text-gray-400">
                  {tr('As alteracoes so seráo aplicadas ao clicar em Salvar.', 'Changes are only applied after clicking Save.')}
                </span>
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAssignmentModalOpen(false)}
                  disabled={savingAssignment}
                >
                  {tr('Cancelar', 'Cancel')}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void handleSaveAssignmentModal()
                  }}
                  disabled={savingAssignment}
                >
                  {savingAssignment ? <Loader2 className="w-4 h-4 animate-spin" /> : tr('Salvar', 'Save')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isQuickRepliesModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={tr('Fechar modal de respostas rápidas', 'Close quick replies modal')}
            className="absolute inset-0 bg-black/70"
            onClick={() => {
              if (!savingQuickReply && !deletingQuickReplyId) {
                closeQuickRepliesModal()
              }
            }}
          />
          <div className="relative w-full max-w-4xl rounded-2xl border border-surface-lighter bg-surface shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-surface-lighter px-5 py-4">
              <div>
                <p className="text-base font-semibold text-white">{tr('Respostas rápidas', 'Quick replies')}</p>
                <p className="text-xs text-gray-400">
                  {tr('Cadastre atalhos como', 'Create shortcuts like')} <span className="text-gray-200">/prices</span> {tr('para reutilizar respostas.', 'to reuse answers.')}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-gray-400"
                onClick={closeQuickRepliesModal}
                disabled={savingQuickReply || Boolean(deletingQuickReplyId)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[1.2fr,1fr]">
              <div className="rounded-xl border border-surface-lighter bg-surface-light p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">
                    {tr('Atalhos cadastrados', 'Saved shortcuts')} ({quickReplies.length}/50)
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resetQuickReplyDraft}
                    disabled={savingQuickReply || loadingQuickReplies || !canManageQuickReplies}
                  >
                    {tr('Novo', 'New')}
                  </Button>
                </div>
                {loadingQuickReplies ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tr('Carregando respostas rápidas...', 'Loading quick replies...')}
                  </div>
                ) : quickReplies.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    {tr('Nenhuma resposta rápida cadastrada.', 'No quick reply registered.')}
                  </p>
                ) : (
                  <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
                    {quickReplies.map((quickReply) => {
                      const isEditing = quickReplyDraftId === quickReply.id
                      const isDeleting = deletingQuickReplyId === quickReply.id
                      return (
                        <div
                          key={quickReply.id}
                          className={cn(
                            'rounded-lg border border-surface-lighter px-3 py-2',
                            isEditing && 'border-primary/60 bg-primary/10'
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white">/{quickReply.shortcut}</p>
                              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-gray-400">
                                {quickReply.content}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-300"
                                onClick={() => handleEditQuickReply(quickReply)}
                                disabled={savingQuickReply || isDeleting || !canManageQuickReplies}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-300"
                                onClick={() => {
                                  void handleDeleteQuickReply(quickReply)
                                }}
                                disabled={savingQuickReply || isDeleting || !canManageQuickReplies}
                              >
                                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-surface-lighter bg-surface-light p-4 space-y-3">
                <p className="text-sm font-medium text-white">
                  {quickReplyDraftId ? tr('Editar resposta rápida', 'Edit quick reply') : tr('Nova resposta rápida', 'New quick reply')}
                </p>
                <Input
                  value={quickReplyShortcutDraft}
                  onChange={(event) => setQuickReplyShortcutDraft(event.target.value)}
                  placeholder="/atalho"
                  className="bg-surface border-surface-lighter"
                  disabled={savingQuickReply || !canManageQuickReplies}
                />
                <Textarea
                  value={quickReplyContentDraft}
                  onChange={(event) => setQuickReplyContentDraft(event.target.value)}
                  placeholder={tr(
                    'Digite o conteudo que será aplicado ao usar o atalho.',
                    'Type the content applied when using this shortcut.'
                  )}
                  className="min-h-[190px] bg-surface border-surface-lighter"
                  disabled={savingQuickReply || !canManageQuickReplies}
                />
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>{tr('Atalho aceito: letras, números, _ ou -.', 'Shortcut: letters, numbers, _ or -.')}</span>
                  <span>{quickReplyContentDraft.length}/2000</span>
                </div>
                {quickReplyFormError ? (
                  <p className="text-xs text-red-300">{quickReplyFormError}</p>
                ) : null}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetQuickReplyDraft}
                    disabled={savingQuickReply || !canManageQuickReplies}
                  >
                    {tr('Limpar', 'Clear')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      void handleSaveQuickReply()
                    }}
                    disabled={savingQuickReply || !canManageQuickReplies}
                  >
                    {savingQuickReply ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : quickReplyDraftId ? (
                      tr('Atualizar', 'Update')
                    ) : (
                      tr('Salvar', 'Save')
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isLabelsModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={tr('Fechar modal de etiquetas', 'Close labels modal')}
            className="absolute inset-0 bg-black/70"
            onClick={closeLabelsModal}
          />
          <div className="relative w-full max-w-2xl rounded-2xl border border-surface-lighter bg-surface shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-surface-lighter px-5 py-4">
              <div>
                <p className="text-base font-semibold text-white">{tr('Etiquetar conversa', 'Label conversation')}</p>
                <p className="text-xs text-gray-400">
                  {labelsTargetChat?.name
                    ? `${tr('Selecione etiquetas para', 'Select labels for')} ${labelsTargetChat.name}.`
                    : tr('Selecione uma ou mais etiquetas para esta conversa.', 'Select one or more labels for this conversation.')}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-gray-400"
                onClick={closeLabelsModal}
                disabled={savingChatLabels || savingLabel || Boolean(deletingLabelId)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[1.2fr,1fr]">
              <div className="rounded-xl border border-surface-lighter bg-surface-light p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">{tr('Etiquetas', 'Labels')} ({labels.length}/20)</p>
                </div>
                {loadingLabels ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tr('Carregando etiquetas...', 'Loading labels...')}
                  </div>
                ) : labels.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    {tr('Nenhuma etiqueta cadastrada.', 'No label registered.')}
                  </p>
                ) : (
                  <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
                    {labels.map((label) => {
                      const checked = labelSelectionDraftIdSet.has(label.id)
                      const isDeleting = deletingLabelId === label.id
                      return (
                        <div
                          key={label.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-surface-lighter bg-surface px-3 py-2"
                        >
                          <label className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className="h-4 w-4 rounded-md border border-black/20"
                              style={{ backgroundColor: label.colorHex }}
                            />
                            <span className="truncate text-sm text-white">{label.name}</span>
                            <input
                              type="checkbox"
                              className="ml-auto accent-primary"
                              checked={checked}
                              disabled={savingChatLabels}
                              onChange={(event) => {
                                toggleLabelSelectionDraft(label.id, event.target.checked)
                              }}
                            />
                          </label>
                          {canManageLabelsCrud ? (
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-300"
                                onClick={() => handleEditLabel(label)}
                                disabled={savingLabel || isDeleting}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-300"
                                onClick={() => {
                                  void handleDeleteLabel(label)
                                }}
                                disabled={savingLabel || isDeleting}
                              >
                                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-surface-lighter bg-surface-light p-4 space-y-3">
                <p className="text-sm font-medium text-white">
                  {canManageLabelsCrud
                    ? labelDraftId
                      ? tr('Editar etiqueta', 'Edit label')
                      : tr('Nova etiqueta', 'New label')
                    : tr('Visualização', 'View only')}
                </p>
                {canManageLabelsCrud ? (
                  <>
                    <Input
                      value={labelNameDraft}
                      onChange={(event) => setLabelNameDraft(event.target.value)}
                      placeholder={tr('Nome da etiqueta', 'Label name')}
                      className="bg-surface border-surface-lighter"
                      disabled={savingLabel}
                    />
                    <div className="grid grid-cols-5 gap-2">
                      {CHAT_LABEL_COLORS.map((color) => {
                        const selected = labelColorDraft === color
                        return (
                          <button
                            key={color}
                            type="button"
                            className={cn(
                              'h-8 rounded-md border transition',
                              selected ? 'border-white/90' : 'border-surface-lighter'
                            )}
                            style={{ backgroundColor: color }}
                            onClick={() => setLabelColorDraft(color)}
                            disabled={savingLabel}
                            aria-label={tr(`Selecionar cor ${color}`, `Select color ${color}`)}
                          >
                            {selected ? <Check className="mx-auto h-4 w-4 text-white" /> : null}
                          </button>
                        )
                      })}
                    </div>
                    {labelFormError ? (
                      <p className="text-xs text-red-300">{labelFormError}</p>
                    ) : (
                      <p className="text-xs text-gray-400">
                        {tr('Escolha uma cor e um nome curto para identificar a conversa.', 'Choose a color and short name to identify this conversation.')}
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetLabelDraft}
                        disabled={savingLabel}
                      >
                        {tr('Limpar', 'Clear')}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          void handleSaveLabel()
                        }}
                        disabled={savingLabel}
                      >
                        {savingLabel ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : labelDraftId ? (
                          tr('Atualizar', 'Update')
                        ) : (
                          <>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            {tr('Criar', 'Create')}
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">
                    {tr(
                      'Sub-contas podem aplicar e remover etiquetas desta conversa, mas não criar ou editar etiquetas.',
                      'Sub-accounts can apply/remove labels on this conversation, but cannot create or edit labels.'
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-surface-lighter bg-surface-light/70">
              {labelsError ? (
                <p className="text-xs text-red-300">{labelsError}</p>
              ) : (
                <span className="text-xs text-gray-400">
                  {tr('As alteracoes so seráo aplicadas ao clicar em Salvar.', 'Changes are only applied after clicking Save.')}
                </span>
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeLabelsModal}
                  disabled={savingChatLabels || savingLabel || Boolean(deletingLabelId)}
                >
                  {tr('Cancelar', 'Cancel')}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void handleSaveChatLabels()
                  }}
                  disabled={savingChatLabels || loadingLabels || !labelsTargetChatId}
                >
                  {savingChatLabels ? <Loader2 className="h-4 w-4 animate-spin" /> : tr('Salvar', 'Save')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showAiSoftBlockModal && aiSoftBlockContext ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-surface-lighter bg-surface-light p-5">
            <h3 className="text-lg font-semibold text-white">
              {tr('Score de treinamento abaixo de 70', 'Training score below 70')}
            </h3>
            <p className="mt-2 text-sm text-gray-300">
              {tr(
                'Ativar a IA global agora pode reduzir qualidade e conversão. Revise os campos críticos antes de publicar.',
                'Enabling global AI now may reduce quality and conversion. Review critical fields before publishing.'
              )}
            </p>
            <div className="mt-3 rounded-xl border border-surface-lighter bg-surface px-3 py-2 text-sm text-yellow-200">
              {tr('Score atual', 'Current score')}: {aiSoftBlockContext.score.toFixed(1)} / 100
            </div>
            {aiSoftBlockContext.missingFields.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs uppercase tracking-wider text-gray-400">
                  {tr('Campos a reforçar', 'Fields to improve')}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-gray-200">
                  {aiSoftBlockContext.missingFields.slice(0, 6).map((field) => (
                    <li key={field} className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-300" />
                      <span>{getTrainingFieldLabel(field)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-300">
                {tr(
                  'Não foi possível listar os campos pendentes automaticamente. Revise o treinamento completo.',
                  'Could not list pending fields automatically. Review the full training.'
                )}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={toRoute('onboarding_setup', { query: { step: '3' } })}
                onClick={() => setShowAiSoftBlockModal(false)}
                className="inline-flex items-center rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-gray-200 hover:bg-surface-lighter/40"
              >
                {tr('Melhorar agora', 'Improve now')}
              </Link>
              <Button
                onClick={async () => {
                  const success = await persistGlobalAiToggle(true, true)
                  if (success) {
                    setShowAiSoftBlockModal(false)
                    setAiSoftBlockContext(null)
                  }
                }}
                disabled={loadingAi}
              >
                {loadingAi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {tr('Continuar mesmo assim', 'Continue anyway')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="w-full md:w-80 lg:w-96 flex flex-col border-r border-surface-lighter min-h-0">
        <div className="p-3 md:p-4 bg-surface border-b border-surface-lighter flex flex-col gap-3 md:gap-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg md:text-xl font-bold text-white">{tr('Conversas', 'Conversations')}</h2>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="text-gray-400">
                <MessageSquare className="w-5 h-5" />
              </Button>
              <div className="relative" ref={quickRepliesMenuRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('text-gray-400', quickRepliesMenuOpen && 'text-white')}
                  onClick={() => setQuickRepliesMenuOpen((prev) => !prev)}
                >
                  <MoreVertical className="w-5 h-5" />
                </Button>
                {quickRepliesMenuOpen ? (
                  <div className="absolute right-0 mt-1 w-56 rounded-xl border border-surface-lighter bg-surface-light p-2 shadow-xl z-20">
                    <button
                      type="button"
                      onClick={openQuickRepliesModal}
                      disabled={!canManageQuickReplies}
                      className={cn(
                        'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        !canManageQuickReplies
                          ? 'cursor-not-allowed text-gray-500'
                          : 'text-gray-200 hover:bg-surface-lighter/60'
                      )}
                    >
                      {tr('Respostas rápidas', 'Quick replies')}
                    </button>
                    <p className="px-3 pb-1 pt-2 text-[11px] text-gray-500">
                      {!canManageQuickReplies
                        ? tr('Permissão desativada pela conta principal.', 'Permission disabled by main account.')
                        : tr('Gerencie atalhos como /valores.', 'Manage shortcuts like /prices.')}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {!isSubaccount ? (
            <>
              <div
                ref={globalAiToggleRef}
                className={cn(
                  'flex items-center justify-between rounded-xl border border-surface-lighter bg-surface-lighter/50 p-2 md:p-3 transition-all',
                  isGuidedTargetActive('global_ai_toggle') &&
                    'relative z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                      isAiEnabled ? 'bg-primary/20 text-primary' : 'bg-gray-500/20 text-gray-500'
                    )}
                  >
                    <Brain className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">IA Global</p>
                    <p className="text-[10px] text-gray-400">
                      {isAiEnabled ? tr('Ativada para todos', 'Enabled for all') : tr('Desativada', 'Disabled')}
                    </p>
                  </div>
                </div>
                <Switch checked={isAiEnabled} onCheckedChange={handleAiToggle} disabled={loadingAi} />
              </div>
              <div className="grid gap-2">
                <div
                  ref={disableAllAiRef}
                  className={cn(
                    isGuidedTargetActive('disable_all') &&
                      'relative z-[210] rounded-xl border border-primary/80 p-0.5 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
                  )}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-center border-red-500/40 text-red-300 hover:bg-red-500/10"
                    onClick={() => void handleBulkAiUpdate(false)}
                    disabled={loadingAi || bulkAction !== null}
                  >
                    {bulkAction === 'disable' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {tr('Desligar IA em todas', 'Disable AI for all')}
                  </Button>
                </div>
                <div
                  ref={enableAllAiRef}
                  className={cn(
                    isGuidedTargetActive('enable_all') &&
                      'relative z-[210] rounded-xl border border-primary/80 p-0.5 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
                  )}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-center border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                    onClick={() => void handleBulkAiUpdate(true)}
                    disabled={loadingAi || bulkAction !== null}
                  >
                    {bulkAction === 'enable' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {tr('Ligar IA em todas', 'Enable AI for all')}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="p-2 md:p-3 space-y-2 md:space-y-3">
          <div
            ref={searchBlockRef}
            className={cn(
              'relative',
              isGuidedTargetActive('search') &&
                'z-[210] rounded-xl border border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
            )}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder={tr('Pesquisar conversa...', 'Search conversation...')}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-10 bg-surface border-surface-lighter text-sm focus-visible:ring-primary"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <Button
              variant={activeFilter === 'all' ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => setActiveFilter('all')}
              className={cn(
                'rounded-full text-xs py-0 h-7',
                activeFilter === 'all' ? 'bg-surface-lighter border-none' : 'text-gray-400'
              )}
            >
              {tr('Todas', 'All')}
            </Button>
            <Button
              variant={activeFilter === 'unread' ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => setActiveFilter('unread')}
              className={cn(
                'rounded-full text-xs py-0 h-7',
                activeFilter === 'unread' ? 'bg-surface-lighter border-none' : 'text-gray-400'
              )}
            >
              {tr('Não lidas', 'Unread')}
            </Button>
            {!hideGroupsInConversations ? (
              <Button
                variant={activeFilter === 'groups' ? 'outline' : 'ghost'}
                size="sm"
                onClick={() => setActiveFilter('groups')}
                className={cn(
                  'rounded-full text-xs py-0 h-7',
                  activeFilter === 'groups' ? 'bg-surface-lighter border-none' : 'text-gray-400'
                )}
              >
                {tr('Grupos', 'Groups')}
              </Button>
            ) : null}
          </div>
        </div>

        <div
          ref={contactsListRef}
          className={cn(
            'flex-1 overflow-y-auto',
            isGuidedTargetActive('contacts_list') &&
              'relative z-[210] rounded-xl border border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
          )}
        >
          {loadingChats ? (
            <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
              <p className="text-sm text-gray-400">
                {tr(
                  'Carregando suas conversas. Na primeira conexao em um novo computador, isso pode levar de 5 a 10 minutos.',
                  'Loading your conversations. On first connection in a new computer, this can take 5 to 10 minutes.'
                )}
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
              <p className="text-sm text-gray-400">{error}</p>
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <MessageSquare className="w-12 h-12 text-gray-500 mb-2" />
              <p className="text-sm text-gray-400">{tr('Nenhuma conversa encontrada', 'No conversations found')}</p>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <ChatItem
                key={chat.id}
                chat={chat}
                isEn={isEn}
                isSelected={selectedChatId === chat.id}
                onSelect={handleSelectChat}
                aiEnabled={chatConfigs[chat.id]?.aiEnabled ?? true}
                onAiToggle={handleChatAiToggle}
                showAiControls={!isSubaccount}
                isActionsOpen={chatActionsMenuChatId === chat.id}
                onToggleActions={handleToggleChatActionsMenu}
                onMarkRead={handleMarkChatAsRead}
                onMarkUnread={handleMarkChatAsUnread}
                onOpenLabels={handleOpenLabelsModal}
                onDeleteChat={handleDeleteChat}
                showDeleteAction={!isSubaccount}
                deleting={deletingChatId === chat.id}
                deleteDisabled={Boolean(deletingChatId)}
                actionsRef={chatActionsMenuRef}
                aiAutoOffReason={
                  chatConfigs[chat.id]?.aiAutoOffReason ??
                  resolveAutoOffReason(chatConfigs[chat.id]?.aiDisabledReason)
                }
              />
            ))
          )}
        </div>
      </div>

      <div
        ref={visualizerRef}
        className={cn(
          'hidden min-h-0 flex-1 flex-col overflow-hidden bg-surface md:flex',
          isGuidedTargetActive('visualizer') &&
            'relative z-[210] border border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
        )}
      >
        {selectedChat ? (
          <>
            <div className="p-4 bg-surface-light border-b border-surface-lighter flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-white leading-none">{selectedChat.name}</h3>
                  <span className="text-[10px] text-green-500">
                    {selectedChat.isGroup ? tr('Grupo', 'Group') : 'WhatsApp'}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="text-gray-400">
                  <Video className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="text-gray-400">
                  <Phone className="w-5 h-5" />
                </Button>
                <div className="w-[1px] h-6 bg-surface-lighter mx-1 self-center" />
                <Button variant="ghost" size="icon" className="text-gray-400">
                  <Search className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="text-gray-400">
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {!isSubaccount && subaccounts.length > 0 ? (
              <div className="px-4 py-3 border-b border-surface-lighter bg-surface-light/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{tr('Sub-contas atribuidas', 'Assigned sub-accounts')}</p>
                    <p className="text-xs text-gray-400">
                      {tr('Selecione quem pode acessar esta conversa.', 'Select who can access this conversation.')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {selectedAssignedSubaccountUids.length}/{subaccounts.length}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openAssignmentModal}
                      disabled={loadingSubaccounts || savingAssignment || subaccounts.length === 0}
                    >
                      {tr('Gerenciar sub-contas', 'Manage sub-accounts')}
                    </Button>
                  </div>
                </div>

                {loadingSubaccounts ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {tr('Carregando sub-contas...', 'Loading sub-accounts...')}
                  </div>
                ) : subaccounts.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    {tr('Nenhuma subconta cadastrada em Configurações.', 'No sub-accounts registered in Settings.')}
                  </p>
                ) : selectedAssignedSubaccountLabels.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    {tr('Nenhuma sub-conta atribuida a esta conversa.', 'No sub-account assigned to this conversation.')}
                  </p>
                ) : (
                  <p className="text-xs text-gray-300">
                    {tr('Atribuidas', 'Assigned')}: {selectedAssignedSubaccountLabels.join(', ')}
                  </p>
                )}

                {savingAssignment ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {tr('Salvando atribuicao...', 'Saving assignment...')}
                  </div>
                ) : null}

                {assignmentError ? (
                  <p className="text-xs text-red-300">{assignmentError}</p>
                ) : null}
              </div>
            ) : null}

            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-6 space-y-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-fixed opacity-90"
            >
              {loadingMessages ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageSquare className="w-12 h-12 text-gray-500 mb-2" />
                  <p className="text-sm text-gray-400">{tr('Nenhuma mensagem ainda', 'No messages yet')}</p>
                </div>
              ) : (
                <>
                  {messages.map((msg) => {
                    const isSent = msg.fromMe
                    const hasFailed = msg.failed || msg.status === 'failed'
                    const mediaType = msg.media?.mediaType ?? (isMediaType(msg.type) ? msg.type : null)
                    const mediaRef = msg.mediaRef?.trim() || null
                    const mediaEntry = mediaRef ? mediaState[mediaRef] : undefined
                    const caption = msg.text?.trim()
                    const fallbackText = formatMessageBody(msg, isEn)
                    const mediaError = describeMediaError(mediaEntry?.error, isEn)
                    const sizeLabel = formatFileSize(msg.media?.sizeBytes)
                    const durationLabel = formatDuration(msg.media?.durationSec)
                    const metaLabel = [sizeLabel, durationLabel].filter(Boolean).join(' · ')
                    const originLabel = isSent ? formatMessageOrigin(msg.origin, isEn) : null
                    const secondaryTextClass = isSent ? 'text-black/70' : 'text-gray-300'
                    const cardClass = cn(
                      'rounded-xl border p-3',
                      isSent ? 'border-black/10 bg-black/5' : 'border-surface-light bg-surface/40'
                    )
                    const retryButton = (
                      <button
                        type="button"
                        onClick={() => {
                          if (mediaRef) {
                            void ensureMediaLoaded(msg, true)
                          }
                        }}
                        className={cn(
                          'inline-flex items-center gap-1 text-xs underline underline-offset-2',
                          isSent ? 'text-black/70' : 'text-primary'
                        )}
                      >
                        <RotateCcw className="w-3 h-3" />
                        {tr('Tentar novamente', 'Try again')}
                      </button>
                    )

                    const renderMedia = () => {
                      if (mediaType === 'imageMessage') {
                        if (mediaEntry?.status === 'loaded' && mediaEntry.url) {
                          return (
                            <div className="space-y-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={mediaEntry.url}
                                alt={msg.media?.fileName ?? tr('Imagem', 'Image')}
                                className="max-w-[320px] max-h-[360px] rounded-xl object-cover"
                              />
                              {caption ? <p className={cn('text-sm whitespace-pre-wrap', secondaryTextClass)}>{caption}</p> : null}
                              {metaLabel ? <p className={cn('text-[11px]', secondaryTextClass)}>{metaLabel}</p> : null}
                            </div>
                          )
                        }

                        return (
                          <div
                            ref={(node) => registerImageTarget(mediaRef ?? undefined, node)}
                            className={cn(cardClass, 'min-w-[220px]')}
                          >
                            <div className="flex items-center gap-2">
                              {mediaEntry?.status === 'loading' ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ImageIcon className="w-4 h-4" />
                              )}
                              <span className="text-sm font-medium">{tr('Imagem', 'Image')}</span>
                            </div>
                            {caption ? <p className={cn('text-sm mt-2 whitespace-pre-wrap', secondaryTextClass)}>{caption}</p> : null}
                            {metaLabel ? <p className={cn('text-[11px] mt-1', secondaryTextClass)}>{metaLabel}</p> : null}
                            {mediaEntry?.status === 'error' ? (
                              <div className="mt-2 space-y-1">
                                <p className={cn('text-xs', secondaryTextClass)}>{mediaError}</p>
                                {retryButton}
                              </div>
                            ) : null}
                          </div>
                        )
                      }

                      if (mediaType === 'stickerMessage') {
                        if (mediaEntry?.status === 'loaded' && mediaEntry.url) {
                          return (
                            <div className="space-y-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={mediaEntry.url}
                                alt={tr('Sticker', 'Sticker')}
                                className="max-w-[220px] max-h-[220px] rounded-xl object-contain"
                              />
                              {metaLabel ? <p className={cn('text-[11px]', secondaryTextClass)}>{metaLabel}</p> : null}
                            </div>
                          )
                        }

                        return (
                          <div
                            ref={(node) => registerImageTarget(mediaRef ?? undefined, node)}
                            className={cn(cardClass, 'min-w-[180px]')}
                          >
                            <div className="flex items-center gap-2">
                              {mediaEntry?.status === 'loading' ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ImageIcon className="w-4 h-4" />
                              )}
                              <span className="text-sm font-medium">{tr('Sticker', 'Sticker')}</span>
                            </div>
                            {metaLabel ? <p className={cn('text-[11px] mt-1', secondaryTextClass)}>{metaLabel}</p> : null}
                            {mediaEntry?.status === 'error' ? (
                              <div className="mt-2 space-y-1">
                                <p className={cn('text-xs', secondaryTextClass)}>{mediaError}</p>
                                {retryButton}
                              </div>
                            ) : null}
                          </div>
                        )
                      }

                      if (mediaType === 'videoMessage') {
                        if (mediaEntry?.status === 'loaded' && mediaEntry.url) {
                          return (
                            <div className="space-y-2">
                              <video src={mediaEntry.url} controls className="max-w-[320px] rounded-xl" />
                              {caption ? <p className={cn('text-sm whitespace-pre-wrap', secondaryTextClass)}>{caption}</p> : null}
                              {metaLabel ? <p className={cn('text-[11px]', secondaryTextClass)}>{metaLabel}</p> : null}
                            </div>
                          )
                        }

                        return (
                          <div className={cn(cardClass, 'min-w-[220px] space-y-2')}>
                            <div className="flex items-center gap-2">
                              {mediaEntry?.status === 'loading' ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <PlayCircle className="w-4 h-4" />
                              )}
                              <span className="text-sm font-medium">{tr('Video', 'Video')}</span>
                            </div>
                            {caption ? <p className={cn('text-sm whitespace-pre-wrap', secondaryTextClass)}>{caption}</p> : null}
                            {metaLabel ? <p className={cn('text-[11px]', secondaryTextClass)}>{metaLabel}</p> : null}
                            {mediaEntry?.status === 'error' ? (
                              <div className="space-y-1">
                                <p className={cn('text-xs', secondaryTextClass)}>{mediaError}</p>
                                {retryButton}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (mediaRef) {
                                    void ensureMediaLoaded(msg)
                                  }
                                }}
                                className={cn(
                                  'inline-flex items-center gap-1 text-xs underline underline-offset-2',
                                  isSent ? 'text-black/70' : 'text-primary'
                                )}
                              >
                                {tr('Carregar video', 'Load video')}
                              </button>
                            )}
                          </div>
                        )
                      }

                      if (mediaType === 'audioMessage') {
                        if (mediaEntry?.status === 'loaded' && mediaEntry.url) {
                          return (
                            <div className="space-y-2 min-w-[240px]">
                              <audio src={mediaEntry.url} controls className="w-full" />
                              {caption ? <p className={cn('text-sm whitespace-pre-wrap', secondaryTextClass)}>{caption}</p> : null}
                              {metaLabel ? <p className={cn('text-[11px]', secondaryTextClass)}>{metaLabel}</p> : null}
                            </div>
                          )
                        }

                        return (
                          <div className={cn(cardClass, 'min-w-[220px] space-y-2')}>
                            <div className="flex items-center gap-2">
                              {mediaEntry?.status === 'loading' ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Volume2 className="w-4 h-4" />
                              )}
                              <span className="text-sm font-medium">{tr('Audio', 'Audio')}</span>
                            </div>
                            {metaLabel ? <p className={cn('text-[11px]', secondaryTextClass)}>{metaLabel}</p> : null}
                            {mediaEntry?.status === 'error' ? (
                              <div className="space-y-1">
                                <p className={cn('text-xs', secondaryTextClass)}>{mediaError}</p>
                                {retryButton}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (mediaRef) {
                                    void ensureMediaLoaded(msg)
                                  }
                                }}
                                className={cn(
                                  'inline-flex items-center gap-1 text-xs underline underline-offset-2',
                                  isSent ? 'text-black/70' : 'text-primary'
                                )}
                              >
                                {tr('Carregar audio', 'Load audio')}
                              </button>
                            )}
                          </div>
                        )
                      }

                      if (mediaType === 'documentMessage') {
                        const fileName = msg.media?.fileName?.trim() || tr('Documento', 'Document')
                        const loadedDocumentUrl = mediaEntry?.status === 'loaded' ? mediaEntry.url : undefined
                        return (
                          <div className={cn(cardClass, 'min-w-[240px] space-y-2')}>
                            <div className="flex items-center gap-2 min-w-0">
                              {mediaEntry?.status === 'loading' ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <FileText className="w-4 h-4" />
                              )}
                              <span className="text-sm font-medium truncate">{fileName}</span>
                            </div>
                            {caption ? <p className={cn('text-sm whitespace-pre-wrap', secondaryTextClass)}>{caption}</p> : null}
                            {metaLabel ? <p className={cn('text-[11px]', secondaryTextClass)}>{metaLabel}</p> : null}
                            {mediaEntry?.status === 'error' ? (
                              <div className="space-y-1">
                                <p className={cn('text-xs', secondaryTextClass)}>{mediaError}</p>
                                {retryButton}
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void openDocumentMessage(msg)
                                  }}
                                  className={cn(
                                    'inline-flex items-center gap-1 text-xs underline underline-offset-2',
                                    isSent ? 'text-black/70' : 'text-primary'
                                  )}
                                >
                                  {tr('Abrir', 'Open')}
                                </button>
                                {loadedDocumentUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const anchor = document.createElement('a')
                                      anchor.href = loadedDocumentUrl
                                      anchor.download = fileName
                                      anchor.rel = 'noreferrer'
                                      anchor.click()
                                    }}
                                    className={cn(
                                      'inline-flex items-center gap-1 text-xs underline underline-offset-2',
                                      isSent ? 'text-black/70' : 'text-primary'
                                    )}
                                  >
                                    <Download className="w-3 h-3" />
                                    {tr('Baixar', 'Download')}
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </div>
                        )
                      }

                      return null
                    }

                    const renderContact = () => {
                      if (!msg.contact) {
                        return null
                      }

                      const contacts = Array.isArray(msg.contact.contacts) ? msg.contact.contacts : []
                      const title = msg.contact.displayName?.trim() || tr('Contato', 'Contact')

                      return (
                        <div className={cn(cardClass, 'min-w-[220px] space-y-2')}>
                          <div className="flex items-center gap-2">
                            <ContactRound className="w-4 h-4" />
                            <span className="text-sm font-medium">{title}</span>
                          </div>
                          {contacts.length > 0 ? (
                            <div className="space-y-1">
                              {contacts.map((contact, index) => {
                                const name = contact.name?.trim() || `${tr('Contato', 'Contact')} ${index + 1}`
                                const phone = contact.whatsapp?.trim()
                                return (
                                  <div key={`${name}-${phone ?? index}`} className="rounded-lg border border-surface-light/70 px-2 py-1">
                                    <p className={cn('text-sm font-medium', secondaryTextClass)}>{name}</p>
                                    {phone ? <p className={cn('text-xs', secondaryTextClass)}>{phone}</p> : null}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p className={cn('text-xs', secondaryTextClass)}>{tr('Sem dados de contato.', 'No contact data.')}</p>
                          )}
                        </div>
                      )
                    }

                    const mediaContent = renderMedia()
                    const contactContent = renderContact()
                    const shouldShowFallbackText = !mediaContent && !contactContent

                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex flex-col max-w-[70%] space-y-1',
                          isSent ? 'ml-auto items-end' : 'items-start'
                        )}
                      >
                        <div
                          className={cn(
                            'rounded-2xl text-sm relative',
                            mediaContent || contactContent ? 'px-3 py-2' : 'px-4 py-2',
                            isSent ? 'bg-primary text-black rounded-tr-none' : 'bg-surface-lighter text-white rounded-tl-none'
                          )}
                        >
                          {originLabel ? (
                            <div className="mb-1">
                              <span
                                className={cn(
                                  'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                  isSent ? 'bg-black/10 text-black/70' : 'bg-surface-light text-gray-300'
                                )}
                              >
                                {originLabel}
                              </span>
                            </div>
                          ) : null}
                          {mediaContent}
                          {contactContent}
                          {shouldShowFallbackText ? fallbackText : null}
                          <div
                            className={cn(
                              'flex items-center justify-end gap-1 mt-1',
                              isSent ? 'text-black/60' : 'text-gray-400'
                            )}
                          >
                            {hasFailed ? (
                              <span className={cn('text-[10px] font-medium', isSent ? 'text-red-700' : 'text-red-300')}>
                                {tr('Falhou', 'Failed')}
                              </span>
                            ) : null}
                            <span className="text-[10px]">{formatMessageTime(msg.timestampMs, isEn)}</span>
                            {isSent && !hasFailed && (
                              msg.pending || msg.status === 'queued' || msg.status === 'sending' || msg.status === 'retrying' ? (
                                <Loader2 className={cn('w-3 h-3 animate-spin', isSent ? 'text-black/60' : 'text-gray-400')} />
                              ) : msg.status === 'read' ? (
                                <CheckCheck className="w-3 h-3 text-blue-600" />
                              ) : msg.status === 'delivered' ? (
                                <CheckCheck className={cn('w-3 h-3', isSent ? 'text-black/60' : 'text-gray-400')} />
                              ) : (
                                <Check className={cn('w-3 h-3', isSent ? 'text-black/60' : 'text-gray-400')} />
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {/* fim da lista de mensagens */}
                </>
              )}
            </div>

            <div className="p-4 bg-surface-light border-t border-surface-lighter space-y-3">
              <input
                ref={attachmentInputRef}
                type="file"
                className="hidden"
                accept="image/*,video/*,audio/*,application/pdf,.pdf"
                onChange={(event) => {
                  handleFilePicked(event.target.files?.[0] ?? null)
                }}
              />

              {attachmentMenuOpen && (
                <div className="max-w-6xl mx-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentMenuOpen(false)
                      attachmentInputRef.current?.click()
                    }}
                    className="rounded-lg border border-surface-lighter bg-surface px-3 py-1.5 text-xs text-gray-200 hover:bg-surface-lighter/40"
                  >
                    {tr('Arquivo', 'File')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentMenuOpen(false)
                      clearSelectedAttachment()
                      setContactMode(true)
                    }}
                    className="rounded-lg border border-surface-lighter bg-surface px-3 py-1.5 text-xs text-gray-200 hover:bg-surface-lighter/40"
                  >
                    {tr('Contato', 'Contact')}
                  </button>
                </div>
              )}

              {selectedAttachmentFile && (
                <div className="max-w-6xl mx-auto rounded-xl border border-surface-lighter bg-surface p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{selectedAttachmentFile.name}</p>
                      <p className="text-xs text-gray-400">
                        {(selectedAttachmentFile.size / (1024 * 1024)).toFixed(1)}MB · {(isEn ? messageTypeLabelsEn : messageTypeLabelsPt)[composerMediaTypeFromFile(selectedAttachmentFile)]}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearSelectedAttachment}
                      disabled={uploadingAttachment || sendingComposer}
                      className="text-gray-400"
                    >
                      {tr('Remover', 'Remove')}
                    </Button>
                  </div>
                  {uploadProgress !== null && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>Upload</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-surface-lighter overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.max(0, Math.min(100, uploadProgress))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {contactMode && (
                <div className="max-w-6xl mx-auto rounded-xl border border-surface-lighter bg-surface p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">{tr('Enviar contato', 'Send contact')}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearContactDraft}
                      disabled={sendingComposer}
                      className="text-gray-400"
                    >
                      {tr('Cancelar', 'Cancel')}
                    </Button>
                  </div>
                  <Input
                    value={contactDisplayNameDraft}
                    onChange={(event) => setContactDisplayNameDraft(event.target.value)}
                              placeholder={tr('Título do cartão (opcional)', 'Card title (optional)')}
                    className="bg-surface-lighter border-surface-light"
                    disabled={sendingComposer}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      value={contactNameDraft}
                      onChange={(event) => setContactNameDraft(event.target.value)}
                      placeholder={tr('Nome', 'Name')}
                      className="bg-surface-lighter border-surface-light"
                      disabled={sendingComposer}
                    />
                    <Input
                      value={contactWhatsappDraft}
                      onChange={(event) => setContactWhatsappDraft(event.target.value)}
                      placeholder={tr('WhatsApp (DDI + número)', 'WhatsApp (country code + number)')}
                      className="bg-surface-lighter border-surface-light"
                      disabled={sendingComposer}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 max-w-6xl mx-auto">
                <Button variant="ghost" size="icon" className="text-gray-400">
                  <Smile className="w-6 h-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('text-gray-400', (selectedAttachmentFile || contactMode) && 'text-primary')}
                  onClick={() => setAttachmentMenuOpen((prev) => !prev)}
                  disabled={!selectedChatId || sendingComposer || uploadingAttachment}
                >
                  <Paperclip className="w-6 h-6" />
                </Button>
                <div className="flex-1 relative">
                  {quickReplySuggestionsOpen && quickReplySuggestions.length > 0 ? (
                    <div className="absolute bottom-full mb-2 left-0 right-0 z-20 overflow-hidden rounded-xl border border-surface-lighter bg-surface-light shadow-2xl">
                      <div className="max-h-56 overflow-y-auto py-1">
                        {quickReplySuggestions.map((quickReply, index) => {
                          const active = index === activeQuickReplyIndex
                          return (
                            <button
                              key={quickReply.id}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => applyQuickReplySuggestion(quickReply)}
                              className={cn(
                                'w-full px-3 py-2 text-left transition-colors',
                                active ? 'bg-primary/20' : 'hover:bg-surface-lighter/70'
                              )}
                            >
                              <p className="text-sm font-semibold text-white">/{quickReply.shortcut}</p>
                              <p className="text-xs text-gray-400 truncate">{quickReply.content.replace(/\s+/g, ' ')}</p>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                  <Textarea
                    ref={composerTextareaRef}
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder={
                      contactMode
                        ? tr('Contato selecionado. O texto não será enviado neste envio.', 'Contact selected. Text will not be sent in this message.')
                        : selectedAttachmentFile
                          ? tr('Legenda (opcional)...', 'Caption (optional)...')
                          : tr('Digite uma mensagem...', 'Type a message...')
                    }
                    className="max-h-36 min-h-[58px] resize-none bg-surface border-none focus-visible:ring-1 focus-visible:ring-primary/50 pr-12 py-3"
                    disabled={!selectedChatId || sendingComposer || uploadingAttachment}
                  />
                  <div className="absolute right-2 bottom-2">
                    <Button
                      size="icon"
                      onClick={() => {
                        void handleSendMessage()
                      }}
                      className={cn(
                        'rounded-full w-9 h-9 transition-all',
                        canSendComposer
                          ? 'bg-primary hover:bg-primary/90'
                          : 'bg-gray-700 opacity-50'
                      )}
                      disabled={!canSendComposer}
                    >
                      {sendingComposer || uploadingAttachment ? (
                        <Loader2 className="w-4 h-4 text-black animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 text-black" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="w-24 h-24 bg-surface-lighter rounded-full flex items-center justify-center mb-4">
              <MessageSquare className="w-12 h-12 text-gray-500" />
            </div>
            <h2 className="text-2xl font-bold text-white">AutoWhats Web</h2>
            <p className="text-gray-400 max-w-sm">
              {tr('Selecione uma conversa para começar a responder seus clientes em tempo real.', 'Select a conversation to start replying to your customers in real time.')}
            </p>
          </div>
        )}
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
                    <h3 className="text-lg font-bold text-white">{tr('Tutorial concluído!', 'Tutorial completed!')}</h3>
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
