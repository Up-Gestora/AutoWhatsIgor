import Image from 'next/image'
import { ArrowRight, Check } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getPublicHomePath, getPublicSignupPath } from '@/lib/public-site/paths'
import type { PublicGuide } from '@/lib/public-site/guides'
import type { PublicLocale } from '@/lib/public-site/types'
import type { TutorialBlock, TutorialSection } from '@/lib/tutorials/types'

function renderToggleStatus(locale: PublicLocale, state: 'on' | 'off' | 'choice') {
  if (state === 'on') return locale === 'en' ? 'On' : 'Ligado'
  if (state === 'off') return locale === 'en' ? 'Off' : 'Desligado'
  return locale === 'en' ? 'Choice' : 'Escolha'
}

function blockKey(block: TutorialBlock, index: number) {
  if (block.type === 'paragraph') return `paragraph-${index}`
  if (block.type === 'bullets') return `bullets-${index}`
  if (block.type === 'steps') return `steps-${index}`
  if (block.type === 'links') return `links-${index}`
  if (block.type === 'callout') return `callout-${index}`
  if (block.type === 'image') return `image-${index}-${block.src}`
  return `toggle-${index}`
}

function PublicGuideBlock({ block, locale }: { block: TutorialBlock; locale: PublicLocale }) {
  const isEn = locale === 'en'

  if (block.type === 'paragraph') {
    return <p className="leading-relaxed text-gray-300">{block.text}</p>
  }

  if (block.type === 'bullets') {
    return (
      <ul className="space-y-3">
        {block.items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-gray-300">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    )
  }

  if (block.type === 'steps') {
    const startAt = block.startAt ?? 1
    return (
      <ol className="space-y-4">
        {block.items.map((step, index) => (
          <li key={`${step.title}-${index}`} className="flex items-start gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-black">
              {startAt + index}
            </span>
            <div>
              <h3 className="font-semibold text-white">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-400">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    )
  }

  if (block.type === 'callout') {
    const toneClass =
      block.variant === 'warn'
        ? 'border-amber-500/30 bg-amber-500/10'
        : block.variant === 'tip'
          ? 'border-primary/25 bg-primary/10'
          : 'border-blue-500/30 bg-blue-500/10'

    return (
      <div className={cn('rounded-2xl border p-5', toneClass)}>
        <h3 className="font-semibold text-white">{block.title}</h3>
        <p className="mt-2 leading-relaxed text-gray-300">{block.text}</p>
      </div>
    )
  }

  if (block.type === 'image') {
    return (
      <figure className="overflow-hidden rounded-2xl border border-white/10 bg-surface-light/40">
        <Image
          src={block.src}
          alt={block.alt}
          width={1600}
          height={900}
          className="h-auto w-full object-contain"
        />
        {block.caption ? (
          <figcaption className="border-t border-white/5 px-4 py-3 text-sm text-gray-400">
            {block.caption}
          </figcaption>
        ) : null}
      </figure>
    )
  }

  if (block.type === 'links') {
    return (
      <div className="rounded-2xl border border-white/10 bg-surface-light/35 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
          {isEn ? 'Want to see this flow in practice?' : 'Quer ver esse fluxo na prática?'}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-300">
          {isEn
            ? `Inside the product, this step appears in: ${block.links.map((link) => link.label).join(' · ')}.`
            : `No produto, este passo aparece dentro de: ${block.links.map((link) => link.label).join(' · ')}.`}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <ButtonLink href={getPublicSignupPath(locale)} className="gap-2">
            {isEn ? 'Free trial' : 'Teste grátis'}
            <ArrowRight className="h-4 w-4" />
          </ButtonLink>
          <ButtonLink href={`${getPublicHomePath(locale)}${isEn ? '#product' : '#produto'}`} variant="outline">
            {isEn ? 'See product' : 'Ver o produto'}
          </ButtonLink>
        </div>
      </div>
    )
  }

  if (block.type === 'toggleCards') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {block.items.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-white/10 bg-surface-light/30 p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-white">{item.title}</h3>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                {renderToggleStatus(locale, item.defaultState)}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-gray-300">{item.description}</p>
            {item.note ? <p className="mt-3 text-xs text-gray-500">{item.note}</p> : null}
          </div>
        ))}
      </div>
    )
  }

  return null
}

function GuideSection({ section, locale }: { section: TutorialSection; locale: PublicLocale }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-surface/55 p-6 md:p-8">
      <h2 className="text-2xl font-bold text-white">{section.title}</h2>
      <div className="mt-5 space-y-5">
        {section.blocks.map((block, index) => (
          <PublicGuideBlock key={blockKey(block, index)} block={block} locale={locale} />
        ))}
      </div>
    </section>
  )
}

export function PublicGuideContent({ guide, locale }: { guide: PublicGuide; locale: PublicLocale }) {
  const isEn = locale === 'en'

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-surface/55 p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          {guide.topic.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/10 bg-surface-light/35 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-300"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            isEn ? `${guide.readingMinutes} min read` : `${guide.readingMinutes} min de leitura`,
            isEn ? 'Practical guide in English' : 'Guia prático em PT-BR',
            isEn ? 'With product screenshots' : 'Com screenshots do produto'
          ].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-white/10 bg-surface-light/30 px-4 py-3 text-sm text-gray-300"
            >
              <span className="inline-flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                {item}
              </span>
            </div>
          ))}
        </div>
      </section>

      {guide.sections.map((section) => (
        <GuideSection key={section.id} section={section} locale={locale} />
      ))}

      <section className="rounded-3xl border border-white/10 bg-surface/55 p-6 md:p-8">
        <h2 className="text-2xl font-bold text-white">{isEn ? 'Next step' : 'Próximo passo'}</h2>
        <p className="mt-3 max-w-3xl text-gray-300/80">
          {isEn
            ? 'If this flow makes sense for your operation, the fastest path is to start a free trial and see AI running inside your own WhatsApp.'
            : 'Se este fluxo faz sentido para sua operação, o caminho mais rápido é abrir um teste grátis e ver a IA no seu próprio WhatsApp.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href={getPublicSignupPath(locale)} className="gap-2">
            {isEn ? 'Free trial' : 'Teste grátis'}
            <ArrowRight className="h-4 w-4" />
          </ButtonLink>
          <ButtonLink href={`${getPublicHomePath(locale)}${isEn ? '#product' : '#produto'}`} variant="outline">
            {isEn ? 'See product' : 'Ver o produto'}
          </ButtonLink>
        </div>
      </section>
    </div>
  )
}
