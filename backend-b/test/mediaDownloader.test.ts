import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { downloadToBuffer } from '../src/sessions/mediaDownloader'

async function startServer(handler: http.RequestListener) {
  const server = http.createServer(handler)
  const sockets = new Set<import('node:net').Socket>()
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${address.port}`

  const close = async () => {
    for (const socket of sockets) {
      socket.destroy()
    }
    server.close()
    await once(server, 'close')
  }

  return { baseUrl, close }
}

test('downloadToBuffer downloads small response', async (t) => {
  const { baseUrl, close } = await startServer((req, res) => {
    if (req.url === '/ok') {
      const body = Buffer.from('hello')
      res.statusCode = 200
      res.setHeader('content-type', 'image/png')
      res.setHeader('content-length', String(body.byteLength))
      res.end(body)
      return
    }
    res.statusCode = 404
    res.end()
  })
  t.after(close)

  const result = await downloadToBuffer(`${baseUrl}/ok`, { timeoutMs: 1000, maxBytes: 1024 })
  assert.equal(result.contentType, 'image/png')
  assert.equal(result.buffer.toString('utf8'), 'hello')
})

test('downloadToBuffer rejects invalid URL schemes', async () => {
  await assert.rejects(() => downloadToBuffer('file:///etc/passwd', { timeoutMs: 1000, maxBytes: 1024 }), {
    message: 'media_url_invalid'
  })
})

test('downloadToBuffer times out', async (t) => {
  const { baseUrl, close } = await startServer((req, _res) => {
    if (req.url === '/hang') {
      return
    }
    _res.statusCode = 404
    _res.end()
  })
  t.after(close)

  await assert.rejects(() => downloadToBuffer(`${baseUrl}/hang`, { timeoutMs: 50, maxBytes: 1024 }), {
    message: 'media_download_timeout'
  })
})

test('downloadToBuffer enforces maxBytes via content-length', async (t) => {
  const { baseUrl, close } = await startServer((req, res) => {
    if (req.url === '/too-big') {
      const body = Buffer.alloc(11, 0)
      res.statusCode = 200
      res.setHeader('content-type', 'application/octet-stream')
      res.setHeader('content-length', String(body.byteLength))
      res.end(body)
      return
    }
    res.statusCode = 404
    res.end()
  })
  t.after(close)

  await assert.rejects(() => downloadToBuffer(`${baseUrl}/too-big`, { timeoutMs: 1000, maxBytes: 10 }), {
    message: 'media_download_too_large'
  })
})

test('downloadToBuffer enforces maxBytes while streaming', async (t) => {
  const { baseUrl, close } = await startServer((req, res) => {
    if (req.url === '/stream') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/octet-stream')
      res.write(Buffer.from('12345'))
      res.write(Buffer.from('6789012345'))
      res.end()
      return
    }
    res.statusCode = 404
    res.end()
  })
  t.after(close)

  await assert.rejects(() => downloadToBuffer(`${baseUrl}/stream`, { timeoutMs: 1000, maxBytes: 10 }), {
    message: 'media_download_too_large'
  })
})

test('downloadToBuffer rejects non-2xx responses with status code', async (t) => {
  const { baseUrl, close } = await startServer((req, res) => {
    if (req.url === '/forbidden') {
      res.statusCode = 403
      res.end('nope')
      return
    }
    res.statusCode = 404
    res.end()
  })
  t.after(close)

  await assert.rejects(() => downloadToBuffer(`${baseUrl}/forbidden`, { timeoutMs: 1000, maxBytes: 1024 }), {
    message: 'media_download_http_403'
  })
})

test('downloadToBuffer uses Firebase fallback on HTTP 403', async (t) => {
  const { baseUrl, close } = await startServer((req, res) => {
    if (req.url === '/forbidden') {
      res.statusCode = 403
      res.end('nope')
      return
    }
    res.statusCode = 404
    res.end()
  })
  t.after(close)

  const result = await downloadToBuffer(
    `${baseUrl}/forbidden`,
    { timeoutMs: 1000, maxBytes: 1024 },
    async () => ({
      downloaded: true,
      bucket: 'bucket',
      objectPath: 'users/session/transmissoes/file.jpg',
      buffer: Buffer.from('fallback-bytes'),
      contentType: 'image/jpeg'
    })
  )

  assert.equal(result.buffer.toString('utf8'), 'fallback-bytes')
  assert.equal(result.contentType, 'image/jpeg')
})

test('downloadToBuffer maps Firebase fallback too_large to media_download_too_large', async (t) => {
  const { baseUrl, close } = await startServer((req, res) => {
    if (req.url === '/forbidden') {
      res.statusCode = 403
      res.end('nope')
      return
    }
    res.statusCode = 404
    res.end()
  })
  t.after(close)

  await assert.rejects(
    () =>
      downloadToBuffer(
        `${baseUrl}/forbidden`,
        { timeoutMs: 1000, maxBytes: 1024 },
        async () => ({
          downloaded: false,
          bucket: 'bucket',
          objectPath: 'users/session/transmissoes/file.jpg',
          reason: 'too_large'
        })
      ),
    {
      message: 'media_download_too_large'
    }
  )
})

