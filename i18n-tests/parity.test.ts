import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

type FlatDictionary = Record<string, unknown>

const ROOT_DIR = process.cwd()
const PT_DICTIONARY_PATH = path.join(ROOT_DIR, 'lib', 'i18n', 'dictionaries', 'pt-BR', 'common.json')
const EN_DICTIONARY_PATH = path.join(ROOT_DIR, 'lib', 'i18n', 'dictionaries', 'en', 'common.json')

function loadDictionary(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
}

function flattenDictionary(
  value: unknown,
  prefix = '',
  output: FlatDictionary = {}
): FlatDictionary {
  if (Array.isArray(value)) {
    output[prefix] = value
    return output
  }

  if (!value || typeof value !== 'object') {
    output[prefix] = value
    return output
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0 && prefix) {
    output[prefix] = value
    return output
  }

  for (const [key, child] of entries) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key
    flattenDictionary(child, nextPrefix, output)
  }
  return output
}

test('dictionaries pt-BR and en keep key parity', () => {
  const ptDictionary = loadDictionary(PT_DICTIONARY_PATH)
  const enDictionary = loadDictionary(EN_DICTIONARY_PATH)

  const ptFlat = flattenDictionary(ptDictionary)
  const enFlat = flattenDictionary(enDictionary)
  const ptKeys = Object.keys(ptFlat).sort()
  const enKeys = Object.keys(enFlat).sort()

  const missingInEn = ptKeys.filter((key) => !enKeys.includes(key))
  const missingInPt = enKeys.filter((key) => !ptKeys.includes(key))

  assert.equal(
    missingInEn.length + missingInPt.length,
    0,
    `Dictionary parity failed.\nMissing in en: ${missingInEn.join(', ') || '(none)'}\nMissing in pt-BR: ${
      missingInPt.join(', ') || '(none)'
    }`
  )

  for (const key of ptKeys) {
    const ptValue = ptFlat[key]
    const enValue = enFlat[key]
    assert.equal(
      typeof ptValue,
      typeof enValue,
      `Dictionary type mismatch at key "${key}": pt-BR=${typeof ptValue}, en=${typeof enValue}`
    )
  }
})
