'use client'

import { LucideIcon } from 'lucide-react'

interface PlaceholderSectionProps {
  title: string
  description: string
  icon: LucideIcon
}

export function PlaceholderSection({ title, description, icon: Icon }: PlaceholderSectionProps) {
  return (
    <div className="bg-surface-light border border-surface-lighter rounded-2xl min-h-[400px] overflow-hidden">
      <div className="border-b border-surface-lighter px-6 py-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" /> {title}
        </h2>
      </div>
      
      <div className="p-10 text-center">
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-20 h-20 bg-surface-lighter rounded-full flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-10 h-10 text-gray-500 animate-pulse" />
          </div>
          <h3 className="text-xl font-bold text-white">Funcionalidade em desenvolvimento</h3>
          <p className="text-gray-400 text-sm">
            Estamos trabalhando para trazer os dados reais de <strong>{title}</strong> o mais rápido possível.
          </p>
        </div>
      </div>
    </div>
  )
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
