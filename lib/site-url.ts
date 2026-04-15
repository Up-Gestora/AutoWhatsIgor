const explicit = (process.env.NEXT_PUBLIC_SITE_URL || '').trim()
const vercel = (process.env.VERCEL_URL || '').trim()

const raw = explicit || (vercel ? `https://${vercel}` : 'http://127.0.0.1:3000')

export const SITE_URL = raw.replace(/\/$/, '')

