'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { AlertTriangle, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MarketingSlideRenderer } from '@/components/admin/marketing/marketing-slide-renderer'
import {
  getMarketingTemplateOptions,
  getMarketingTemplateExportSize,
  isMarketingTemplateSingleSlide,
  resolveDeckTemplateKey
} from '@/components/admin/marketing/templates'
import { db } from '@/lib/firebase'
import { ensureDeckV2 } from '@/lib/marketing/deck-migrations'
import { exportMarketingDeckJpeg, exportMarketingDeckPdf } from '@/lib/marketing/pdf-export'
import type { MarketingDeck, MarketingDeckDoc, MarketingDeckStatus } from '@/lib/marketing/deck-types'
import { useAuth } from '@/providers/auth-provider'
import { cn } from '@/lib/utils'

type MarketingDeckTemplate = {
  id: string
  name: string
  status: MarketingDeckStatus
  deck: MarketingDeck
  updatedAtMs: number
  slideCount: number
}

type NoticeState = { kind: 'success' | 'error'; message: string } | null

function safeString(value: unknown, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function timestampToMs(value: unknown) {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }

  return 0
}

function sanitizeFileName(input: string) {
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()

  return normalized || 'marketing-template'
}

function fromFirestoreDoc(id: string, value: unknown): MarketingDeckTemplate {
  const docData = (value ?? {}) as Partial<MarketingDeckDoc>
  const deck = ensureDeckV2(docData.deck)

  return {
    id,
    name: safeString(docData.name, 'Template sem nome'),
    status: docData.status === 'ready' ? 'ready' : 'draft',
    deck,
    updatedAtMs: timestampToMs(docData.updatedAt),
    slideCount: deck.slides.length
  }
}

function sortTemplates(templates: MarketingDeckTemplate[]) {
  return [...templates].sort((a, b) => {
    const byUpdated = b.updatedAtMs - a.updatedAtMs
    if (byUpdated !== 0) {
      return byUpdated
    }
    return a.name.localeCompare(b.name)
  })
}

function formatDateTime(timestampMs: number) {
  if (!timestampMs) {
    return '--'
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestampMs))
}

export function MarketingBuilder() {
  const { user, loading: authLoading } = useAuth()
  const [templates, setTemplates] = useState<MarketingDeckTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [templateKeyOverride, setTemplateKeyOverride] = useState<string | null>(null)
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState>(null)

  const templateOptions = useMemo(() => getMarketingTemplateOptions(), [])
  const templateLabelByKey = useMemo(
    () => new Map(templateOptions.map((item) => [item.key, item.label])),
    [templateOptions]
  )

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId]
  )

  const selectedTemplateKey = useMemo(() => {
    if (!selectedTemplate) {
      return null
    }

    return resolveDeckTemplateKey(selectedTemplate.deck, {
      templateKeyOverride: templateKeyOverride ?? undefined,
      templateId: selectedTemplate.id,
      templateName: selectedTemplate.name
    })
  }, [selectedTemplate, templateKeyOverride])

  const exportSlideSize = useMemo(() => {
    if (!selectedTemplateKey) {
      return null
    }
    return getMarketingTemplateExportSize(selectedTemplateKey)
  }, [selectedTemplateKey])

  const exportSlideStyle = useMemo(
    () =>
      exportSlideSize
        ? {
            width: `${exportSlideSize.widthPx}px`,
            height: `${exportSlideSize.heightPx}px`
          }
        : undefined,
    [exportSlideSize]
  )

  const isSingleSlideTemplate = useMemo(
    () => (selectedTemplateKey ? isMarketingTemplateSingleSlide(selectedTemplateKey) : false),
    [selectedTemplateKey]
  )

  const enabledSlides = useMemo(() => {
    if (!selectedTemplate) {
      return []
    }

    const activeSlides = selectedTemplate.deck.slides.filter((slide) => slide.enabled)
    if (!isSingleSlideTemplate) {
      return activeSlides
    }

    return activeSlides.length > 0 ? [activeSlides[0]] : []
  }, [isSingleSlideTemplate, selectedTemplate])

  useEffect(() => {
    setTemplateKeyOverride(null)
  }, [selectedTemplateId])

  const previewSlide = enabledSlides[previewSlideIndex] ?? null

  useEffect(() => {
    if (enabledSlides.length === 0) {
      setPreviewSlideIndex(0)
      return
    }

    setPreviewSlideIndex((current) => Math.min(current, enabledSlides.length - 1))
  }, [enabledSlides.length])

  const fetchTemplates = useCallback(async () => {
    if (!db || !user) {
      setLoading(false)
      return
    }

    setLoading(true)
    setErrorMessage(null)

    try {
      const templatesQuery = query(collection(db, 'settings'), where('type', '==', 'marketing_deck'))
      const snapshot = await getDocs(templatesQuery)
      const items = sortTemplates(snapshot.docs.map((item) => fromFirestoreDoc(item.id, item.data())))

      setTemplates(items)
      setSelectedTemplateId((current) =>
        current && items.some((template) => template.id === current) ? current : items[0]?.id ?? null
      )
    } catch (error) {
      console.error('Erro ao carregar templates de marketing:', error)
      setErrorMessage('Não foi possível carregar os templates de marketing.')
    } finally {
      setLoading(false)
    }
  }, [user])

  const handleExportPdf = useCallback(async () => {
    if (!selectedTemplate) {
      return
    }

    if (enabledSlides.length === 0) {
      setNotice({ kind: 'error', message: 'Não ha slides ativos para exportar em PDF.' })
      return
    }

    setBusyAction('export-pdf')
    setNotice(null)

    try {
      await exportMarketingDeckPdf({
        rootElementId: 'marketing-print-root',
        fileName: `${selectedTemplate.name}-${new Date().toISOString().slice(0, 10)}`
      })
      setNotice({ kind: 'success', message: 'PDF exportado com sucesso.' })
    } catch (error) {
      console.error('Erro ao exportar PDF de marketing:', error)
      setNotice({ kind: 'error', message: 'Falha ao exportar PDF.' })
    } finally {
      setBusyAction(null)
    }
  }, [enabledSlides.length, selectedTemplate])

  const handleExportJpeg = useCallback(async () => {
    if (!selectedTemplate) {
      return
    }

    if (enabledSlides.length === 0) {
      setNotice({ kind: 'error', message: 'Não ha slides ativos para exportar em JPEG.' })
      return
    }

    setBusyAction('export-jpeg')
    setNotice(null)

    try {
      await exportMarketingDeckJpeg({
        rootElementId: 'marketing-print-root',
        fileName: `${selectedTemplate.name}-${new Date().toISOString().slice(0, 10)}`
      })
      setNotice({
        kind: 'success',
        message:
          enabledSlides.length === 1 ? 'JPEG exportado com sucesso.' : 'JPEGs exportados com sucesso.'
      })
    } catch (error) {
      console.error('Erro ao exportar JPEG de marketing:', error)
      setNotice({ kind: 'error', message: 'Falha ao exportar JPEG.' })
    } finally {
      setBusyAction(null)
    }
  }, [enabledSlides.length, selectedTemplate])

  const handleExportJson = useCallback(() => {
    if (!selectedTemplate) {
      return
    }

    try {
      const payload = {
        id: selectedTemplate.id,
        name: selectedTemplate.name,
        status: selectedTemplate.status,
        updatedAtMs: selectedTemplate.updatedAtMs,
        deck: selectedTemplate.deck
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${sanitizeFileName(selectedTemplate.name)}-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setNotice({ kind: 'success', message: 'Arquivo JSON exportado com sucesso.' })
    } catch (error) {
      console.error('Erro ao exportar JSON do template:', error)
      setNotice({ kind: 'error', message: 'Falha ao exportar arquivo JSON.' })
    }
  }, [selectedTemplate])

  useEffect(() => {
    if (authLoading) {
      return
    }
    void fetchTemplates()
  }, [authLoading, fetchTemplates])

  if (loading || authLoading) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-gray-400">Carregando templates...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="no-print rounded-2xl border border-surface-lighter bg-surface-light p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
              <FileText className="h-6 w-6 text-primary" />
              Seletor de template
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Criação e edição de slides/textos são feitas somente via código.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExportJson} disabled={!selectedTemplate || busyAction !== null}>
              Exportar JSON
            </Button>
            <Button onClick={() => void handleExportPdf()} disabled={!selectedTemplate || enabledSlides.length === 0 || busyAction !== null}>
              {busyAction === 'export-pdf' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Exportar PDF
            </Button>
            <Button variant="outline" onClick={() => void handleExportJpeg()} disabled={!selectedTemplate || enabledSlides.length === 0 || busyAction !== null}>
              {busyAction === 'export-jpeg' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Exportar JPEG
            </Button>
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </div>
      ) : null}

      {notice ? (
        <div
          className={cn(
            'no-print rounded-xl border px-4 py-3 text-sm',
            notice.kind === 'success'
              ? 'border-green-500/30 bg-green-500/10 text-green-300'
              : 'border-red-500/30 bg-red-500/10 text-red-200'
          )}
        >
          {notice.message}
        </div>
      ) : null}

      <section className="no-print rounded-2xl border border-surface-lighter bg-surface-light p-4">
        <label htmlFor="marketing-template-visual-selector" className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-300">
          Template visual
        </label>
        <select
          id="marketing-template-visual-selector"
          value={templateKeyOverride ?? selectedTemplateKey ?? ''}
          onChange={(event) => {
            const value = event.target.value.trim()
            setTemplateKeyOverride(value.length > 0 ? value : null)
            setPreviewSlideIndex(0)
          }}
          className="h-11 w-full rounded-xl border border-surface-lighter bg-surface px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={templateOptions.length === 0 || !selectedTemplate}
        >
          {templateOptions.map((templateOption) => (
            <option key={templateOption.key} value={templateOption.key}>
              {templateOption.label}
            </option>
          ))}
        </select>

        {selectedTemplate ? (
          <div
            className={cn(
              'mt-3 rounded-xl border px-3 py-2 text-xs',
              selectedTemplate.status === 'ready'
                ? 'border-green-500/30 bg-green-500/10 text-green-200'
                : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200'
            )}
          >
            <p>Status: {selectedTemplate.status === 'ready' ? 'Pronto' : 'Rascunho'}</p>
            <p>Slides totais: {selectedTemplate.slideCount}</p>
            <p>Slides ativos: {enabledSlides.length}</p>
            <p>Template visual: {selectedTemplateKey ? templateLabelByKey.get(selectedTemplateKey) ?? selectedTemplateKey : '--'}</p>
            <p>Formato: {isSingleSlideTemplate ? 'Slide unico (1 pagina)' : 'Multiplos slides'}</p>
            <p>Atualizado: {formatDateTime(selectedTemplate.updatedAtMs)}</p>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
            <AlertTriangle className="h-4 w-4" />
            Nenhum template disponível no momento.
          </div>
        )}
      </section>

      <section className="no-print space-y-4 rounded-2xl border border-surface-lighter bg-surface-light p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-300">Preview dos slides</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewSlideIndex((value) => Math.max(value - 1, 0))}
              disabled={previewSlideIndex === 0}
            >
              Anterior
            </Button>
            <span className="text-sm text-gray-300">
              {enabledSlides.length === 0 ? '0/0' : `${previewSlideIndex + 1}/${enabledSlides.length}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewSlideIndex((value) => Math.min(value + 1, Math.max(enabledSlides.length - 1, 0)))}
              disabled={enabledSlides.length === 0 || previewSlideIndex >= enabledSlides.length - 1}
            >
              Próximo
            </Button>
          </div>
        </div>

        {previewSlide && selectedTemplate ? (
          <MarketingSlideRenderer
            slide={previewSlide}
            deck={selectedTemplate.deck}
            slideIndex={previewSlideIndex}
            totalSlides={enabledSlides.length}
            mode="preview"
            templateKeyOverride={selectedTemplateKey ?? undefined}
            templateId={selectedTemplate.id}
            templateName={selectedTemplate.name}
          />
        ) : (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-200">
            <AlertTriangle className="mb-2 h-6 w-6" />
            <p className="text-sm">Nenhum slide ativo para visualização.</p>
          </div>
        )}
      </section>

      <section id="marketing-print-root" className="marketing-export-root">
        {selectedTemplate
          ? enabledSlides.map((slide, index) => (
              <div
                key={slide.id}
                data-marketing-export-slide="1"
                data-marketing-export-width={exportSlideSize?.widthPx}
                data-marketing-export-height={exportSlideSize?.heightPx}
                className="marketing-export-slide"
                style={exportSlideStyle}
              >
                <MarketingSlideRenderer
                  slide={slide}
                  deck={selectedTemplate.deck}
                  slideIndex={index}
                  totalSlides={enabledSlides.length}
                  mode="export"
                  templateKeyOverride={selectedTemplateKey ?? undefined}
                  templateId={selectedTemplate.id}
                  templateName={selectedTemplate.name}
                />
              </div>
            ))
          : null}
      </section>
    </div>
  )
}

