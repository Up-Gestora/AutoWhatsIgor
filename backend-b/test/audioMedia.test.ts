import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAudioMediaOptions } from '../src/sessions/audioMedia'

test('resolveAudioMediaOptions normalizes audio/mp3 to audio/mpeg', () => {
  const result = resolveAudioMediaOptions(Buffer.from([0x49, 0x44, 0x33]), 'audio/mp3')
  assert.equal(result.mimeType, 'audio/mpeg')
  assert.equal(result.ptt, false)
})

test('resolveAudioMediaOptions forces opus metadata for ogg audio', () => {
  const oggHeader = Buffer.from('OggS____', 'ascii')
  const result = resolveAudioMediaOptions(oggHeader, 'audio/ogg')
  assert.equal(result.mimeType, 'audio/ogg; codecs=opus')
  assert.equal(result.ptt, true)
})

test('resolveAudioMediaOptions infers ogg opus from octet-stream content', () => {
  const oggHeader = Buffer.from('OggS____', 'ascii')
  const result = resolveAudioMediaOptions(oggHeader, 'application/octet-stream')
  assert.equal(result.mimeType, 'audio/ogg; codecs=opus')
  assert.equal(result.ptt, true)
})

test('resolveAudioMediaOptions infers mp4 audio from ftyp header', () => {
  const mp4Header = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20])
  const result = resolveAudioMediaOptions(mp4Header, undefined)
  assert.equal(result.mimeType, 'audio/mp4')
  assert.equal(result.ptt, false)
})
