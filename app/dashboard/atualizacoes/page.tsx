'use client'

import { Calendar, Sparkles, Star, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/client'
import { UPDATES, type LocalizedText, type UpdateEntry } from '@/lib/updates/content'

function pick<T>(isEn: boolean, value: LocalizedText<T>): T {
  return isEn ? value.en : value.pt
}

function changeKey(update: UpdateEntry, change: string) {
  return `${update.version}-${change}`
}

export default function UpdatesPage() {
  const { locale } = useI18n()
  const isEn = locale === 'en'

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-white md:text-3xl">
          <Sparkles className="h-8 w-8 text-primary" />
          {isEn ? 'Updates and news' : 'Atualizações e novidades'}
        </h1>
        <p className="text-gray-400">
          {isEn
            ? 'Track platform improvements and new features released across product, AI, CRM, and operations.'
            : 'Acompanhe melhorias e novos recursos entregues no produto, IA, CRM e operação.'}
        </p>
      </div>

      <div className="space-y-6">
        {UPDATES.map((update) => (
          <div
            key={update.version}
            className="overflow-hidden rounded-2xl border border-surface-lighter bg-surface-light card-hover"
          >
            <div className="flex flex-col justify-between gap-4 border-b border-surface-lighter p-6 md:flex-row md:items-center">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    'rounded-xl p-3',
                    update.type === 'feature' ? 'bg-primary/10' : 'bg-blue-400/10'
                  )}
                >
                  {update.type === 'feature' ? (
                    <Star className="h-6 w-6 text-primary" />
                  ) : (
                    <Zap className="h-6 w-6 text-blue-400" />
                  )}
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-3">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
                      {update.version}
                    </span>
                    <h3 className="text-lg font-bold text-white">{pick(isEn, update.title)}</h3>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar className="h-4 w-4" />
                    {pick(isEn, update.date)}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-6">
              <p className="leading-relaxed text-gray-300">{pick(isEn, update.description)}</p>

              <div className="space-y-3">
                <h4 className="text-sm font-bold uppercase tracking-wider text-white">
                  {isEn ? 'What changed:' : 'O que mudou:'}
                </h4>
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {pick(isEn, update.changes).map((change) => (
                    <li key={changeKey(update, change)} className="flex items-start gap-3 text-sm text-gray-400">
                      <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
        <p className="text-sm text-gray-400">
          {isEn ? 'Have a product suggestion?' : 'Tem alguma sugestão de melhoria?'}{' '}
          <button className="font-bold text-primary hover:underline">
            {isEn ? 'Talk to support' : 'Fale com nosso suporte'}
          </button>
        </p>
      </div>
    </div>
  )
}
