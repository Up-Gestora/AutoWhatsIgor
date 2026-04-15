type FbqFunction = (...args: unknown[]) => void

type QueuedEvent = {
  method: 'track' | 'trackCustom'
  event: string
  options?: Record<string, unknown>
}

const isFbqAvailable = () =>
  typeof window !== 'undefined' && typeof window.fbq === 'function'

const enqueueEvent = (method: QueuedEvent['method'], event: string, options?: Record<string, unknown>) => {
  if (typeof window === 'undefined') return
  window.__metaPixelQueue = window.__metaPixelQueue || []
  window.__metaPixelQueue.push({ method, event, options })
}

const flushQueueIfReady = () => {
  if (!isFbqAvailable()) return
  const queue = window.__metaPixelQueue || []
  queue.forEach(({ method, event, options }) => {
    if (options) {
      window.fbq!(method, event, options)
    } else {
      window.fbq!(method, event)
    }
  })
  window.__metaPixelQueue = []
}

export function track(event: string, options?: Record<string, unknown>) {
  if (!isFbqAvailable()) {
    enqueueEvent('track', event, options)
    return
  }
  flushQueueIfReady()
  if (options) {
    window.fbq!('track', event, options)
  } else {
    window.fbq!('track', event)
  }
}

export function trackCustom(event: string, options?: Record<string, unknown>) {
  if (!isFbqAvailable()) {
    enqueueEvent('trackCustom', event, options)
    return
  }
  flushQueueIfReady()
  if (options) {
    window.fbq!('trackCustom', event, options)
  } else {
    window.fbq!('trackCustom', event)
  }
}

declare global {
  interface Window {
    fbq?: FbqFunction
    __metaPixelQueue?: QueuedEvent[]
    __metaPixelLastPath?: string
  }
}
