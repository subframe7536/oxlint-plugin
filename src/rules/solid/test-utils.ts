import type { Rule } from '@oxlint/plugins'
import { RuleTester } from 'oxlint/plugins-dev'
import { setMockTrackImportsForTesting } from './utils.ts'

export const tsOnly = Symbol('ts only')

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

export function run(
  name: string,
  rule: Rule,
  tests: { valid?: any[]; invalid?: any[] },
  options: { mockImports?: boolean } = {},
) {
  const mockImports = options.mockImports ?? true
  const prev = mockImports
  setMockTrackImportsForTesting(prev)
  try {
    ruleTester.run(name, rule, {
      valid: (tests.valid ?? []).map((t) => (typeof t === 'string' ? { code: t } : t)),
      invalid: tests.invalid ?? [],
    })
  } finally {
    setMockTrackImportsForTesting(false)
  }
  return tests
}
