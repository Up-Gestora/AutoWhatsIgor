import { AlertTriangle, Info, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'

type CalloutVariant = 'info' | 'tip' | 'warn'

const variantStyles: Record<
  CalloutVariant,
  { wrapper: string; icon: React.ComponentType<{ className?: string }>; title: string }
> = {
  info: {
    wrapper: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
    icon: Info,
    title: 'Info',
  },
  tip: {
    wrapper: 'border-primary/30 bg-primary/10 text-green-200',
    icon: Lightbulb,
    title: 'Dica',
  },
  warn: {
    wrapper: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200',
    icon: AlertTriangle,
    title: 'Atenção',
  },
}

export function Callout(props: { variant: CalloutVariant; title?: string; children: React.ReactNode }) {
  const config = variantStyles[props.variant]
  const Icon = config.icon
  return (
    <div className={cn('flex items-start gap-3 rounded-2xl border p-4', config.wrapper)}>
      <Icon className="w-5 h-5 mt-0.5 shrink-0" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">{props.title ?? config.title}</p>
        <div className="text-xs leading-relaxed opacity-90">{props.children}</div>
      </div>
    </div>
  )
}

