import type { OxlintOverride } from 'oxlint'
export const FILES_TS_TSX: string[] = ['**/*.{ts,tsx}']

/**
 * Oxlint override config that enables all ported `solid-*` rules.
 *
 * ```ts
 * // oxlint.config.ts
 * import { defineConfig } from 'oxlint'
 * import { solidConfig } from '@subf/oxlint-plugin/config'
 *
 * export default defineConfig({
 *   extends: [solidConfig],
 * })
```
 */
export const solidConfig: OxlintOverride = {
  files: FILES_TS_TSX,
  jsPlugins: [{ name: 'subf', specifier: '@subf/oxlint-plugin' }],
  rules: {
    'subf/solid-components-return-once': 'warn',
    'subf/solid-event-handlers': 'warn',
    'subf/solid-imports': 'warn',
    'subf/solid-jsx-no-duplicate-props': 'error',
    'subf/solid-jsx-no-script-url': 'error',
    'subf/solid-jsx-no-undef': 'error',
    'subf/solid-jsx-uses-vars': 'warn',
    'subf/solid-no-destructure': 'error',
    'subf/solid-no-innerhtml': 'warn',
    'subf/solid-prefer-for': 'warn',
    'subf/solid-prefer-show': 'warn',
    'subf/solid-reactivity': 'error',
    'subf/solid-self-closing-comp': 'warn',
  },
}
