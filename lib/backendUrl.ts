type BackendUrlOptions = {
  productionFallback: string
  developmentFallback: string
}

export function getBackendUrl(options: BackendUrlOptions) {
  const raw = process.env.NEXT_PUBLIC_BACKEND_URL?.trim()
  const fallback =
    process.env.NODE_ENV === 'production'
      ? options.productionFallback
      : options.developmentFallback

  const value = (raw && raw.length > 0 ? raw : fallback).replace(/\/+$/, '')

  if (/^https?:\/\//i.test(value)) {
    return value
  }

  const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(value)
  const protocol = isLocal ? 'http' : 'https'

  return `${protocol}://${value}`
}
