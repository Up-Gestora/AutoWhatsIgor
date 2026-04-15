import assert from 'node:assert/strict'
import test from 'node:test'
import { extractFileDirectives, extractOrderedSendSequence, extractSendDirectives } from '../src/ai/fileDirective'

test('extractFileDirectives extracts multiple ids and cleans reply', () => {
  const input = `Perfeito. Vou te mandar o catálogo.\n\n[ENVIAR_ARQUIVO:file-1]\n[ENVIAR_ARQUIVO:file-2]\n`
  const result = extractFileDirectives(input)

  assert.deepEqual(result.fileIds, ['file-1', 'file-2'])
  assert.equal(result.cleanedReply, 'Perfeito. Vou te mandar o catálogo.')
})

test('extractFileDirectives de-duplicates ids while preserving order', () => {
  const input = `Oi\n[ENVIAR_ARQUIVO:a]\n[ENVIAR_ARQUIVO:a]\n[ENVIAR_ARQUIVO:b]\n[ENVIAR_ARQUIVO:a]\n`
  const result = extractFileDirectives(input)

  assert.deepEqual(result.fileIds, ['a', 'b'])
  assert.equal(result.cleanedReply, 'Oi')
})

test('extractSendDirectives extracts files and contacts together', () => {
  const input =
    'Claro!\n[ENVIAR_ARQUIVO:file-1]\n[ENVIAR_CONTATO:Comercial|5511988887777]\n[ENVIAR_CONTATO:Suporte|+55 (11) 97777-6666]\n'
  const result = extractSendDirectives(input)

  assert.deepEqual(result.fileIds, ['file-1'])
  assert.deepEqual(result.contacts, [
    { name: 'Comercial', whatsapp: '5511988887777' },
    { name: 'Suporte', whatsapp: '5511977776666' }
  ])
  assert.equal(result.cleanedReply, 'Claro!')
})

test('extractSendDirectives de-duplicates contacts and ignores invalid entries', () => {
  const input =
    'Segue:\n' +
    '[ENVIAR_CONTATO:Comercial|5511988887777]\n' +
    '[ENVIAR_CONTATO:Comercial repetido|+55 11 98888-7777]\n' +
    '[ENVIAR_CONTATO:Sem numero|]\n' +
    '[ENVIAR_CONTATO:|5511999999999]\n' +
    '[ENVIAR_CONTATO:Invalido|123]\n'
  const result = extractSendDirectives(input)

  assert.deepEqual(result.contacts, [{ name: 'Comercial', whatsapp: '5511988887777' }])
  assert.equal(result.cleanedReply, 'Segue:')
})

test('extractSendDirectives limits contact directives to 3 items', () => {
  const input =
    '[ENVIAR_CONTATO:A|5511000000001]\n' +
    '[ENVIAR_CONTATO:B|5511000000002]\n' +
    '[ENVIAR_CONTATO:C|5511000000003]\n' +
    '[ENVIAR_CONTATO:D|5511000000004]\n'
  const result = extractSendDirectives(input)

  assert.equal(result.contacts.length, 3)
  assert.deepEqual(result.contacts.map((item) => item.name), ['A', 'B', 'C'])
  assert.equal(result.cleanedReply, '')
})

test('extractOrderedSendSequence preserves text and file order for inline directives', () => {
  const input =
    'Mensagem 1\n' +
    '[SEPARAR]\n' +
    'Mensagem 2\n' +
    '[ENVIAR_ARQUIVO:audio-1]\n' +
    'Mensagem 3\n' +
    '**SEPARAR**\n' +
    'Mensagem 4\n' +
    '[ENVIAR_ARQUIVO:image-1]\n' +
    'Mensagem 5\n'

  const result = extractOrderedSendSequence(input)

  assert.deepEqual(result.fileIds, ['audio-1', 'image-1'])
  assert.deepEqual(result.items, [
    { type: 'text', text: 'Mensagem 1' },
    { type: 'text', text: 'Mensagem 2' },
    { type: 'file', fileId: 'audio-1' },
    { type: 'text', text: 'Mensagem 3' },
    { type: 'text', text: 'Mensagem 4' },
    { type: 'file', fileId: 'image-1' },
    { type: 'text', text: 'Mensagem 5' }
  ])
  assert.equal(result.cleanedReply, 'Mensagem 1\n\nMensagem 2\n\nMensagem 3\n\nMensagem 4\n\nMensagem 5')
})

test('extractOrderedSendSequence keeps legacy trailing file directives compatible', () => {
  const input = 'Claro.\n\n[ENVIAR_ARQUIVO:file-1]\n[ENVIAR_ARQUIVO:file-2]\n'

  const result = extractOrderedSendSequence(input)

  assert.deepEqual(result.items, [
    { type: 'text', text: 'Claro.' },
    { type: 'file', fileId: 'file-1' },
    { type: 'file', fileId: 'file-2' }
  ])
  assert.equal(result.cleanedReply, 'Claro.')
})

test('extractOrderedSendSequence de-duplicates repeated file ids while preserving first occurrence', () => {
  const input =
    'Antes\n' +
    '[ENVIAR_ARQUIVO:file-1]\n' +
    'Depois\n' +
    '[ENVIAR_ARQUIVO:file-1]\n' +
    'Fim\n'

  const result = extractOrderedSendSequence(input)

  assert.deepEqual(result.fileIds, ['file-1'])
  assert.deepEqual(result.items, [
    { type: 'text', text: 'Antes' },
    { type: 'file', fileId: 'file-1' },
    { type: 'text', text: 'Depois' },
    { type: 'text', text: 'Fim' }
  ])
})
