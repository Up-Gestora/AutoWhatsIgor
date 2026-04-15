import { Calendar, Sparkles, Star, Zap } from 'lucide-react'
import { UPDATES } from '@/lib/updates/content'
import type { PublicLocale } from '@/lib/public-site/types'

type PublicUpdatesFeedProps = {
  locale: PublicLocale
}

export function PublicUpdatesFeed({ locale }: PublicUpdatesFeedProps) {
  const isEn = locale === 'en'

  return (
    <div className="space-y-5">
      {UPDATES.map((update) => (
        <article
          key={update.version}
          className="rounded-3xl border border-white/10 bg-surface/55 p-6 md:p-8"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface-light/35 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-300">
                {update.type === 'feature' ? (
                  <Star className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Zap className="h-3.5 w-3.5 text-blue-300" />
                )}
                {update.type === 'feature'
                  ? isEn
                    ? 'New release'
                    : 'Nova entrega'
                  : isEn
                    ? 'Improvement'
                    : 'Melhoria'}
              </div>
              <h2 className="mt-4 text-2xl font-bold text-white">
                {isEn ? update.title.en : update.title.pt}
              </h2>
              <p className="mt-3 max-w-3xl leading-relaxed text-gray-300/80">
                {isEn ? update.description.en : update.description.pt}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-surface-light/30 px-4 py-3 text-sm text-gray-300">
              <div className="font-semibold text-white">{update.version}</div>
              <div className="mt-2 inline-flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                {isEn ? update.date.en : update.date.pt}
              </div>
            </div>
          </div>

          <ul className="mt-6 space-y-3">
            {(isEn ? update.changes.en : update.changes.pt).map((change) => (
              <li key={`${update.version}-${change}`} className="flex items-start gap-3 text-gray-300">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{change}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  )
}
