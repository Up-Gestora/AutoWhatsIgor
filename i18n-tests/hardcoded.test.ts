import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const ROOT_DIR = process.cwd()
const ALLOWLIST_PATH = path.join(ROOT_DIR, 'i18n-tests', 'hardcoded-allowlist.json')
const TARGET_FILES = [
  'app/login/page.tsx',
  'app/dashboard/layout-client.tsx',
  'components/dashboard/sidebar.tsx',
  'components/dashboard/topbar.tsx'
]

const IGNORED_JSX_ATTRS = new Set([
  'className',
  'id',
  'htmlFor',
  'type',
  'name',
  'src',
  'href',
  'target',
  'rel',
  'viewBox',
  'fill',
  'd',
  'value',
  'min',
  'max',
  'step'
])
const MESSAGE_SETTER_NAMES = new Set(['setError', 'setSuccess', 'setNotice'])

const TECHNICAL_TOKEN_REGEX = /^[a-z0-9_.:/?&=#%@+-]+$/
const HAS_LETTER_REGEX = /\p{L}/u

test('migrated files do not introduce new hardcoded user text', () => {
  const currentEntries = collectEntries()

  if (process.env.UPDATE_I18N_HARDCODED_ALLOWLIST === '1') {
    const payload = {
      targetFiles: TARGET_FILES,
      entries: currentEntries
    }
    fs.writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    return
  }

  if (!fs.existsSync(ALLOWLIST_PATH)) {
    throw new Error(
      `Allowlist file missing at "${toPosix(path.relative(ROOT_DIR, ALLOWLIST_PATH))}". ` +
        'Run with UPDATE_I18N_HARDCODED_ALLOWLIST=1 to generate it.'
    )
  }

  const raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')) as {
    entries?: string[]
  }
  const allowlist = new Set((raw.entries ?? []).sort())
  const current = new Set(currentEntries)

  const unexpected = [...current].filter((entry) => !allowlist.has(entry)).sort()
  const stale = [...allowlist].filter((entry) => !current.has(entry)).sort()

  assert.deepEqual(
    unexpected,
    [],
    `Hardcoded text regression detected. Add translations or explicitly allowlist entries:\n${unexpected.join('\n')}`
  )
  assert.deepEqual(
    stale,
    [],
    `Allowlist has stale entries no longer found in code:\n${stale.join('\n')}`
  )
})

function collectEntries(): string[] {
  const entries = new Set<string>()

  for (const relativePath of TARGET_FILES) {
    const absolutePath = path.join(ROOT_DIR, relativePath)
    const sourceText = fs.readFileSync(absolutePath, 'utf8')
    const sourceFile = ts.createSourceFile(
      absolutePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    )

    walk(sourceFile, (node) => {
      const candidate = extractTextCandidate(node)
      if (!candidate) {
        return
      }

      const normalized = normalizeText(candidate)
      if (!shouldTrackText(normalized)) {
        return
      }
      entries.add(`${toPosix(relativePath)}::${normalized}`)
    })
  }

  return [...entries].sort()
}

function extractTextCandidate(node: ts.Node): string | null {
  if (ts.isJsxText(node)) {
    return node.getText()
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    if (isDirectivePrologue(node)) {
      return null
    }

    if (isInsideTranslationCall(node)) {
      return null
    }

    if (isImportOrExportSpecifier(node)) {
      return null
    }

    if (isIgnoredJsxAttributeLiteral(node)) {
      return null
    }

    if (isRelevantJsxString(node) || isUiMessageSetterLiteral(node)) {
      return node.text
    }

    return null
  }

  return null
}

function isDirectivePrologue(node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral): boolean {
  const parent = node.parent
  if (!ts.isExpressionStatement(parent)) {
    return false
  }
  return ts.isSourceFile(parent.parent)
}

function isRelevantJsxString(node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral): boolean {
  if (isIgnoredJsxAttributeLiteral(node)) {
    return false
  }

  // String literal directly in JSX expression context.
  if (isInsideJsx(node)) {
    return true
  }

  // String literal in visible attributes (placeholder/title/aria-label/alt/etc).
  return ts.isJsxAttribute(node.parent)
}

function isUiMessageSetterLiteral(node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral): boolean {
  const parent = node.parent
  if (!ts.isCallExpression(parent)) {
    return false
  }

  const expression = parent.expression
  if (ts.isIdentifier(expression) && MESSAGE_SETTER_NAMES.has(expression.text)) {
    return true
  }
  return false
}

function isImportOrExportSpecifier(node: ts.Node): boolean {
  const parent = node.parent
  return (
    ts.isImportDeclaration(parent) ||
    ts.isExportDeclaration(parent) ||
    ts.isImportEqualsDeclaration(parent)
  )
}

function isInsideTranslationCall(node: ts.Node): boolean {
  let current: ts.Node | undefined = node
  while (current?.parent) {
    current = current.parent
    if (!ts.isCallExpression(current)) {
      continue
    }

    const expression = current.expression
    if (ts.isIdentifier(expression) && expression.text === 't') {
      return true
    }
    if (ts.isPropertyAccessExpression(expression) && expression.name.text === 't') {
      return true
    }
  }
  return false
}

function isIgnoredJsxAttributeLiteral(node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral): boolean {
  const parent = node.parent
  if (!ts.isJsxAttribute(parent)) {
    return false
  }
  const attrName = ts.isIdentifier(parent.name) ? parent.name.text : parent.name.getText()
  return IGNORED_JSX_ATTRS.has(attrName)
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function shouldTrackText(value: string): boolean {
  if (!value || !HAS_LETTER_REGEX.test(value)) {
    return false
  }
  if (value.length <= 1) {
    return false
  }
  if (/^\(min-width:\s*\d+px\)$/i.test(value)) {
    return false
  }
  if (TECHNICAL_TOKEN_REGEX.test(value)) {
    return false
  }
  if (isLikelyCssClassList(value)) {
    return false
  }
  return true
}

function isInsideJsx(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent
  while (current) {
    if (
      ts.isJsxElement(current) ||
      ts.isJsxFragment(current) ||
      ts.isJsxSelfClosingElement(current)
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

function isLikelyCssClassList(value: string): boolean {
  const tokens = value.split(/\s+/).filter(Boolean)
  if (tokens.length < 2) {
    return false
  }

  const classLike = tokens.every((token) => /^[a-z0-9_:/\-[\].]+$/i.test(token))
  const hasUtilityHints = tokens.some((token) => token.includes('-') || token.includes(':') || token.includes('/'))
  return classLike && hasUtilityHints
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/')
}
