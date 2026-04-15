import { setTimeout as delay } from 'node:timers/promises'

export async function openaiFetchJson(url, { apiKey, method = 'GET', headers = {}, body = null, retries = 3 } = {}) {
  let lastErr = null
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...headers
        },
        body
      })

      const text = await res.text()
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        // keep raw
      }

      if (!res.ok) {
        const msg =
          (json && (json.error?.message || json.message)) ||
          text ||
          `${method} ${url} failed with status ${res.status}`
        const err = new Error(msg)
        err.status = res.status
        err.payload = json || text
        throw err
      }

      return json
    } catch (err) {
      lastErr = err
      const status = err?.status
      const shouldRetry = status === 429 || (status >= 500 && status <= 599) || status == null
      if (attempt < retries && shouldRetry) {
        await delay(750 * attempt)
        continue
      }
      throw err
    }
  }
  throw lastErr || new Error('openaiFetchJson failed')
}

export async function openaiFetchBinary(url, { apiKey, headers = {}, retries = 3 } = {}) {
  let lastErr = null
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...headers
        }
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const err = new Error(text || `GET ${url} failed with status ${res.status}`)
        err.status = res.status
        throw err
      }

      const ab = await res.arrayBuffer()
      return Buffer.from(ab)
    } catch (err) {
      lastErr = err
      const status = err?.status
      const shouldRetry = status === 429 || (status >= 500 && status <= 599) || status == null
      if (attempt < retries && shouldRetry) {
        await delay(750 * attempt)
        continue
      }
      throw err
    }
  }
  throw lastErr || new Error('openaiFetchBinary failed')
}

