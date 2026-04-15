import assert from 'node:assert/strict'
import test from 'node:test'
import { extractWhatsappFromJid } from '../src/whatsapp/ids'

test('extractWhatsappFromJid extracts phone digits from user JIDs', () => {
  assert.equal(extractWhatsappFromJid('5511999999999@s.whatsapp.net'), '5511999999999')
  assert.equal(extractWhatsappFromJid('5511999999999:12@s.whatsapp.net'), '5511999999999')
  assert.equal(extractWhatsappFromJid('5511999999999@c.us'), '5511999999999')
  assert.equal(extractWhatsappFromJid(' 5511999999999@c.us '), '5511999999999')
})

test('extractWhatsappFromJid returns null for non-user / non-phone identifiers', () => {
  assert.equal(extractWhatsappFromJid('status@broadcast'), null)
  assert.equal(extractWhatsappFromJid('120363012345678901@g.us'), null)
  assert.equal(extractWhatsappFromJid('abcdef@lid'), null)
  assert.equal(extractWhatsappFromJid('some-conversation-id'), null)
  assert.equal(extractWhatsappFromJid('12345678901234567890@s.whatsapp.net'), null)
})

