import Link from 'next/link'
import { WHATSAPP_LINK } from '@/lib/contact'

export function WhatsAppFloat() {
  return (
    <div className="fixed bottom-5 right-5 z-[70] sm:bottom-6 sm:right-6">
      <Link
        href={WHATSAPP_LINK}
        target="_blank"
        rel="noreferrer noopener"
        aria-label="Falar no WhatsApp"
        title="Falar no WhatsApp"
        className="group relative inline-grid h-14 w-14 place-items-center overflow-hidden rounded-full border border-white/25 bg-[#25D366] text-white shadow-[0_12px_30px_rgba(37,211,102,0.45)] transition-transform duration-200 hover:scale-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117]"
      >
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-black/10" />
        <span aria-hidden className="pointer-events-none absolute -inset-1 -z-10 rounded-full bg-[#25D366]/45 blur-sm" />

        <span className="sr-only">Falar no WhatsApp</span>
        <span aria-hidden className="inline-grid h-7 w-7 place-items-center">
          <svg
            viewBox="0 0 24 24"
            preserveAspectRatio="xMidYMid meet"
            className="block h-7 w-7"
            fill="currentColor"
          >
            <path d="M20.52 3.48A11.5 11.5 0 0 0 3.47 20.54L2 22l1.52-.39A11.5 11.5 0 1 0 20.52 3.48zm-7.36 17.1a9.66 9.66 0 0 1-4.87-1.32l-.35-.2-2.9.75.77-2.83-.23-.36A9.65 9.65 0 1 1 13.16 20.58zm5.18-5.27c-.28-.14-1.64-.81-1.9-.9-.25-.1-.44-.14-.62.14-.18.28-.72.9-.89 1.08-.16.18-.33.2-.61.07-.28-.14-1.17-.43-2.23-1.37-.82-.74-1.38-1.65-1.54-1.92-.16-.28 0-.43.12-.56.12-.12.28-.3.41-.46.14-.16.18-.28.27-.46.1-.18.05-.36-.02-.5-.07-.14-.62-1.48-.86-2.03-.23-.55-.46-.47-.62-.48l-.52-.01c-.18 0-.47.07-.72.34s-.94.94-.94 2.29.97 2.67 1.11 2.85c.14.18 1.93 2.94 4.68 4.12.65.28 1.14.45 1.53.58.65.2 1.25.18 1.72.11.53-.08 1.64-.67 1.88-1.28.23-.62.23-1.16.16-1.28-.07-.12-.25-.18-.53-.32z" />
          </svg>
        </span>
      </Link>
    </div>
  )
}
