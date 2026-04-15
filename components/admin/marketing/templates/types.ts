import type { MarketingDeck, MarketingSlideV2 } from '@/lib/marketing/deck-types'

export type MarketingTemplateMode = 'preview' | 'export' | 'print'

export type MarketingTemplateExportSize = {
  widthPx: number
  heightPx: number
}

export type MarketingTemplateSlideRendererProps = {
  slide: MarketingSlideV2
  deck: MarketingDeck
  slideIndex: number
  totalSlides: number
  mode?: MarketingTemplateMode
  className?: string
  templateKeyOverride?: string
  templateId?: string
  templateName?: string
}
