import type { OxlintConfig, OxlintOverride } from 'oxlint'

export const FILES_TS_TSX: string[] = ['**/*.{ts,tsx}']

/**
 * Oxlint override config that enables recommended SolidJS `solid-*` rules (Solid 1.x / dual-version).
 *
 * ```ts
 * // oxlint.config.ts
 * import { defineConfig } from 'oxlint'
 * import { solidConfig } from '@subf/oxlint-plugin/config'
 *
 * export default defineConfig({
 *   extends: [solidConfig],
 * })
 * ```
 */
export const solidConfig: OxlintOverride = {
  files: FILES_TS_TSX,
  jsPlugins: [{ name: 'subf', specifier: '@subf/oxlint-plugin' }],
  rules: {
    'no-unassigned-vars': 'off',
    'subf/solid-components-return-once': 'warn',
    'subf/solid-event-handlers': 'warn',
    'subf/solid-imports': 'warn',
    'subf/solid-jsx-no-duplicate-props': 'error',
    'subf/solid-jsx-no-script-url': 'error',
    'subf/solid-jsx-no-undef': ['error', { typescriptEnabled: true }],
    'subf/solid-jsx-uses-vars': 'warn',
    'subf/solid-no-destructure': 'error',
    'subf/solid-no-innerhtml': 'warn',
    'subf/solid-no-react-specific-props': 'warn',
    'subf/solid-no-unassigned-vars': 'error',
    'subf/solid-prefer-for': 'warn',
    'subf/solid-prefer-show': 'warn',
    'subf/solid-reactivity': 'warn',
    'subf/solid-self-closing-comp': 'warn',
    'subf/solid-validate-jsx-nesting': 'error',
  },
}

/**
 * Oxlint config preset for Solid 2.0 projects (mirrors `eslint-plugin-solid/configs/v2`).
 * Sets `settings.solid.version: 2` and enables Solid 2.0 correctness & server function rules.
 *
 * ```ts
 * // oxlint.config.ts
 * import { defineConfig } from 'oxlint'
 * import { solidV2Config } from '@subf/oxlint-plugin/config'
 *
 * export default defineConfig({
 *   extends: [solidV2Config],
 * })
 * ```
 */
export const solidV2Config: OxlintConfig = {
  settings: {
    solid: { version: 2 },
  },
  overrides: [
    {
      files: FILES_TS_TSX,
      jsPlugins: [{ name: 'subf', specifier: '@subf/oxlint-plugin' }],
      rules: {
        ...solidConfig.rules,
        'subf/solid-event-handlers': 'error',
        'subf/solid-no-accessor-as-prop': 'error',
        'subf/solid-no-boolean-enumerated-attribute': 'error',
        'subf/solid-no-browser-globals-in-server-function': 'error',
        'subf/solid-no-invalid-server-capture': 'error',
        'subf/solid-no-react-specific-props': 'error',
        'subf/solid-no-single-arg-create-effect': 'error',
        'subf/solid-no-store-mutation-outside-setter': 'error',
        'subf/solid-no-unknown-namespaces': 'error',
        'subf/solid-no-unused-signal': 'warn',
        'subf/solid-no-write-in-pure-computation': 'error',
        'subf/solid-prefer-structured-class': 'warn',
        'subf/solid-removed-api': 'error',
        'subf/solid-require-async-server-function': 'error',
        'subf/solid-valid-use-server': 'error',
      },
    },
  ],
}

/**
 * Strict Solid 2.0 Oxlint config preset (mirrors `eslint-plugin-solid/configs/v2-strict`).
 * Enables all `solidV2Config` rules plus SSR/side-effect/style strictness rules.
 */
export const solidV2StrictConfig: OxlintConfig = {
  settings: {
    solid: { version: 2 },
  },
  overrides: [
    {
      files: FILES_TS_TSX,
      jsPlugins: [{ name: 'subf', specifier: '@subf/oxlint-plugin' }],
      rules: {
        ...solidV2Config.overrides![0].rules,
        'subf/solid-no-module-scope-reactive-primitive': 'error',
        'subf/solid-no-restated-default-options': 'error',
        'subf/solid-no-unused-signal': 'error',
        'subf/solid-prefer-onSettled-for-side-effects': 'warn',
        'subf/solid-prefer-structured-class': 'error',
      },
    },
  ],
}
