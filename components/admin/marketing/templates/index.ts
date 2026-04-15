import { HomeV2TemplateRenderer } from '@/components/admin/marketing/templates/home-v2-template-renderer'
import { InstitucionalOnepageTemplateRenderer } from '@/components/admin/marketing/templates/institucional-onepage-template-renderer'
import type { MarketingTemplateExportSize, MarketingTemplateSlideRendererProps } from '@/components/admin/marketing/templates/types'
import type { MarketingDeck } from '@/lib/marketing/deck-types'

type MarketingTemplateRenderer = (props: MarketingTemplateSlideRendererProps) => JSX.Element
type MarketingTemplateDefinition = {
  label: string
  renderer: MarketingTemplateRenderer
  exportSize: MarketingTemplateExportSize
  singleSlide?: boolean
}

export const DEFAULT_MARKETING_TEMPLATE_KEY = 'home-v2'
const DEFAULT_MARKETING_TEMPLATE_EXPORT_SIZE: MarketingTemplateExportSize = {
  widthPx: 1600,
  heightPx: 900
}

const MARKETING_TEMPLATE_DEFINITIONS: Record<string, MarketingTemplateDefinition> = {
  'home-v2': {
    label: 'Home V2 (multiplos slides)',
    renderer: HomeV2TemplateRenderer,
    exportSize: DEFAULT_MARKETING_TEMPLATE_EXPORT_SIZE
  },
  'institucional-onepage': {
    label: 'Institucional (1 pagina)',
    renderer: InstitucionalOnepageTemplateRenderer,
    exportSize: DEFAULT_MARKETING_TEMPLATE_EXPORT_SIZE,
    singleSlide: true
  }
}
// Para criar um novo template:
// 1) adicione um renderer em `components/admin/marketing/templates/*`
// 2) registre aqui com uma nova chave
// 3) salve `deck.templateKey` com essa chave

function normalizeTemplateKey(value: string | null | undefined) {
  if (!value) return ''
  return value.trim().toLowerCase()
}

export function resolveDeckTemplateKey(
  deck: MarketingDeck,
  options?: {
    templateKeyOverride?: string
    templateId?: string
    templateName?: string
  }
) {
  const candidates = [options?.templateKeyOverride, deck.templateKey, options?.templateId, options?.templateName]
  for (const candidate of candidates) {
    const normalized = normalizeTemplateKey(candidate)
    if (normalized && normalized in MARKETING_TEMPLATE_DEFINITIONS) {
      return normalized
    }
  }

  return DEFAULT_MARKETING_TEMPLATE_KEY
}

export function getMarketingTemplateRenderer(templateKey: string): MarketingTemplateRenderer {
  const fallback = MARKETING_TEMPLATE_DEFINITIONS[DEFAULT_MARKETING_TEMPLATE_KEY]
  return MARKETING_TEMPLATE_DEFINITIONS[templateKey]?.renderer ?? fallback.renderer
}

export function getMarketingTemplateExportSize(templateKey: string): MarketingTemplateExportSize {
  const fallback = MARKETING_TEMPLATE_DEFINITIONS[DEFAULT_MARKETING_TEMPLATE_KEY]?.exportSize ?? DEFAULT_MARKETING_TEMPLATE_EXPORT_SIZE
  const resolved = MARKETING_TEMPLATE_DEFINITIONS[templateKey]?.exportSize ?? fallback
  return {
    widthPx: resolved.widthPx,
    heightPx: resolved.heightPx
  }
}

export function isMarketingTemplateSingleSlide(templateKey: string) {
  return Boolean(MARKETING_TEMPLATE_DEFINITIONS[templateKey]?.singleSlide)
}

export function getMarketingTemplateOptions() {
  return Object.entries(MARKETING_TEMPLATE_DEFINITIONS).map(([key, definition]) => ({
    key,
    label: definition.label,
    singleSlide: Boolean(definition.singleSlide)
  }))
}
