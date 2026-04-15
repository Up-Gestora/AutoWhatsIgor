'use client'

import { ArrowRight, CheckCircle2, Clock3 } from 'lucide-react'
import { Button, ButtonLink } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type TutorialBlock, type TutorialSection, type TutorialTopic as Topic } from '@/lib/tutorials/content-en'
import { Callout } from '@/components/tutorials/callout'
import { Reveal } from '@/components/tutorials/reveal'

function BlockRenderer(props: { block: TutorialBlock; toggleStatusByKey?: Record<string, string> }) {
  const { block, toggleStatusByKey } = props

  if (block.type === 'paragraph') {
    return <p className="text-gray-300 leading-relaxed">{block.text}</p>
  }

  if (block.type === 'bullets') {
    return (
      <ul className="space-y-2">
        {block.items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-gray-300">
            <div className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            <span className="leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    )
  }

  if (block.type === 'steps') {
    const startAt = block.startAt ?? 1

    return (
      <ol className="space-y-3">
        {block.items.map((step, idx) => (
          <li key={`${step.title}-${idx}`} className="flex items-start gap-4">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary border border-primary flex items-center justify-center text-xs font-bold text-black">
              {startAt + idx}
            </span>
            <div>
              <p className="text-white font-semibold">{step.title}</p>
              <p className="text-sm text-gray-400 leading-relaxed">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    )
  }

  if (block.type === 'callout') {
    return (
      <Callout variant={block.variant} title={block.title}>
        {block.text}
      </Callout>
    )
  }

  if (block.type === 'image') {
    const figureSizeClass = block.size === 'half' ? 'w-full md:w-1/2 mx-auto' : 'w-full'

    return (
      <figure className={cn('rounded-2xl border border-primary/35 bg-gradient-to-r from-primary to-primary-dark p-2', figureSizeClass)}>
        <div className="overflow-hidden rounded-xl border border-primary/20 bg-surface">
          <img
            src={block.src}
            alt={block.alt}
            className="w-full h-auto object-contain"
            loading="lazy"
          />
        </div>
      </figure>
    )
  }

  if (block.type === 'links') {
    return (
      <div className="space-y-2">
        {block.title ? <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{block.title}</p> : null}
        <div className="flex flex-wrap gap-2">
          {block.links.map((link) => (
            <ButtonLink key={link.href} href={link.href} variant="outline" className="gap-2">
              {link.label}
              <ArrowRight className="w-4 h-4" />
            </ButtonLink>
          ))}
        </div>
        {block.links.some((l) => l.description) ? (
          <div className="space-y-1">
            {block.links
              .filter((l) => l.description)
              .map((l) => (
                <p key={`${l.href}-desc`} className="text-xs text-gray-500">
                  <span className="text-gray-300 font-semibold">{l.label}:</span> {l.description}
                </p>
              ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (block.type === 'toggleCards') {
    const fallbackStatus = (state: 'on' | 'off' | 'choice') => {
      if (state === 'on') return 'On'
      if (state === 'off') return 'Off'
      return 'Choose'
    }

    const statusStyles = (status: string) => {
      if (status === 'On' || status === 'Forward') return 'bg-primary/10 text-primary border-primary/25'
      if (status === 'Off' || status === 'Silence') return 'bg-surface-lighter/40 text-gray-300 border-surface-lighter'
      if (status === 'Mixed') return 'bg-amber-500/10 text-amber-300 border-amber-500/30'
      if (status === 'Soon' || status === 'No data' || status === 'No schedule' || status === 'Visible') {
        return 'bg-blue-500/10 text-blue-300 border-blue-500/20'
      }
      return 'bg-blue-500/10 text-blue-300 border-blue-500/20'
    }

    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
        {block.items.map((item) => {
          const statusKey = item.statusKey ?? item.title
          const status = toggleStatusByKey?.[statusKey] ?? fallbackStatus(item.defaultState)

          return (
            <div key={item.title} className="h-full min-h-[170px] bg-surface rounded-2xl border border-surface-lighter p-3.5 flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-white font-semibold leading-snug">{item.title}</p>
                <span
                  className={cn(
                    'shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                    statusStyles(status)
                  )}
                >
                  {status}
                </span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed flex-1">{item.description}</p>
            {item.note ? <p className="text-xs text-gray-500">{item.note}</p> : null}
            </div>
          )
        })}
      </div>
    )
  }

  return null
}

type SectionRenderItem =
  | { type: 'single'; block: TutorialBlock; key: string }
  | { type: 'pair'; blocks: [TutorialBlock, TutorialBlock]; key: string }

function buildSectionRenderItems(blocks: TutorialBlock[], pairStepImageBlocks: boolean): SectionRenderItem[] {
  if (!pairStepImageBlocks) {
    return blocks.map((block, idx) => ({ type: 'single', block, key: `single-${idx}` }))
  }

  const items: SectionRenderItem[] = []

  for (let idx = 0; idx < blocks.length; idx += 1) {
    const current = blocks[idx]
    const next = blocks[idx + 1]

    if (current.type === 'steps' && next?.type === 'image') {
      items.push({
        type: 'pair',
        blocks: [current, next],
        key: `pair-${idx}`,
      })
      idx += 1
      continue
    }

    items.push({ type: 'single', block: current, key: `single-${idx}` })
  }

  return items
}

function TutorialSectionCard(props: {
  section: TutorialSection
  pairStepImageBlocks?: boolean
  toggleStatusByKey?: Record<string, string>
}) {
  const renderItems = buildSectionRenderItems(props.section.blocks, Boolean(props.pairStepImageBlocks))

  return (
    <div className="bg-surface-light rounded-2xl border border-surface-lighter p-6 space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-white">{props.section.title}</h3>
      </div>
      <div className="space-y-4">
        {renderItems.map((item) => {
          if (item.type === 'pair') {
            return (
              <div key={`${props.section.id}-${item.key}`} className="rounded-2xl border border-surface-lighter bg-surface p-4 space-y-4">
                <BlockRenderer block={item.blocks[0]} toggleStatusByKey={props.toggleStatusByKey} />
                <BlockRenderer block={item.blocks[1]} toggleStatusByKey={props.toggleStatusByKey} />
              </div>
            )
          }

          return <BlockRenderer key={`${props.section.id}-${item.key}`} block={item.block} toggleStatusByKey={props.toggleStatusByKey} />
        })}
      </div>
    </div>
  )
}

export function TutorialTopicEn(props: {
  topic: Topic
  completed: boolean
  onToggleCompleted: () => void
  toggleStatusByKey?: Record<string, string>
}) {
  const Icon = props.topic.icon
  const pairStepImageBlocks = false

  return (
    <section id={props.topic.id} className="scroll-mt-24 space-y-6">
      <Reveal>
        <div className="bg-surface-light rounded-2xl border border-surface-lighter p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl md:text-2xl font-bold text-white">{props.topic.title}</h2>
                  {props.completed ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full animate-fade-in">
                      <CheckCircle2 className="w-4 h-4" />
                      Completed
                    </span>
                  ) : null}
                </div>
                <p className="text-gray-400 leading-relaxed">{props.topic.description}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 bg-surface border border-surface-lighter px-2 py-1 rounded-full">
                    <Clock3 className="w-3.5 h-3.5" />
                    {props.topic.estimatedMinutes} min
                  </span>
                  {props.topic.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-semibold uppercase tracking-wider text-gray-300 bg-surface border border-surface-lighter px-2 py-1 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              {props.topic.primaryCta ? (
                <ButtonLink href={props.topic.primaryCta.href} variant="outline" className="gap-2">
                  {props.topic.primaryCta.label}
                  <ArrowRight className="w-4 h-4" />
                </ButtonLink>
              ) : null}
              <Button
                type="button"
                onClick={props.onToggleCompleted}
                variant={props.completed ? 'outline' : 'default'}
                className="gap-2"
              >
                <CheckCircle2 className={cn('w-4 h-4', props.completed ? 'text-primary' : 'text-black')} />
                {props.completed ? 'Mark as not completed' : 'Mark as completed'}
              </Button>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="space-y-4">
        {props.topic.sections.map((section, idx) => (
          <Reveal key={section.id} delayClassName={idx === 0 ? 'delay-100' : idx === 1 ? 'delay-200' : undefined}>
            <TutorialSectionCard
              section={section}
              pairStepImageBlocks={pairStepImageBlocks}
              toggleStatusByKey={props.toggleStatusByKey}
            />
          </Reveal>
        ))}
      </div>
    </section>
  )
}
