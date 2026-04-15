import type { LucideIcon } from 'lucide-react'

export type TutorialBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'steps'; startAt?: number; items: Array<{ title: string; description: string }> }
  | { type: 'links'; title?: string; links: Array<{ label: string; href: string; description?: string }> }
  | { type: 'callout'; variant: 'info' | 'tip' | 'warn'; title: string; text: string }
  | { type: 'image'; src: string; alt: string; caption?: string; size?: 'full' | 'half' }
  | {
      type: 'toggleCards'
      items: Array<{
        title: string
        statusKey?: string
        defaultState: 'on' | 'off' | 'choice'
        description: string
        note?: string
      }>
    }

export type TutorialSection = {
  id: string
  title: string
  blocks: TutorialBlock[]
}

export type TutorialTopic = {
  id: string
  title: string
  description: string
  tags: string[]
  icon: LucideIcon
  estimatedMinutes: number
  primaryCta?: { label: string; href: string }
  sections: TutorialSection[]
}
