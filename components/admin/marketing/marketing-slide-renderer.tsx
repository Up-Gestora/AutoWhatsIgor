'use client'

import {
  getMarketingTemplateRenderer,
  resolveDeckTemplateKey
} from '@/components/admin/marketing/templates'
import type { MarketingTemplateSlideRendererProps } from '@/components/admin/marketing/templates/types'

export type MarketingSlideRendererProps = MarketingTemplateSlideRendererProps

export function MarketingSlideRenderer(props: MarketingSlideRendererProps) {
  const templateKey = resolveDeckTemplateKey(props.deck, {
    templateKeyOverride: props.templateKeyOverride,
    templateId: props.templateId,
    templateName: props.templateName
  })

  const TemplateRenderer = getMarketingTemplateRenderer(templateKey)
  return <TemplateRenderer {...props} />
}
