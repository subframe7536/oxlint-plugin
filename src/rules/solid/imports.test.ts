import { RuleTester } from 'oxlint/plugins-dev'
import { importsRule as rule } from './imports.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-imports', rule, {
  valid: [
    { code: `import { createSignal } from 'solid-js'` },
    { code: `import { createMemo } from 'solid-js'` },
    { code: `import { render } from 'solid-js/web'` },
    { code: `import { hydrate } from 'solid-js/web'` },
    { code: `import { createStore } from 'solid-js/store'` },
    { code: `import { createStore } from 'solid-js'` },
    { code: `import { produce } from 'solid-js/store'` },
    {
      code: `import { createStore, onFlush, until } from 'solid-js'`,
      settings: { solid: { version: 2 } },
    },
    {
      code: `import { render, dynamic } from '@solidjs/web'`,
      settings: { solid: { version: 2 } },
    },
    {
      code: `import type { JSX } from '@solidjs/web'`,
      settings: { solid: { version: 2 } },
    },
  ],
  invalid: [
    {
      code: `import { render } from 'solid-js'`,
      errors: [{ messageId: 'prefer-source' }],
      output: `import { render } from "solid-js/web";\n`,
    },
    {
      code: `import { createSignal } from 'solid-js/web'`,
      errors: [{ messageId: 'prefer-source' }],
      output: `import { createSignal } from "solid-js";\n`,
    },
    {
      code: `import { produce } from 'solid-js'`,
      errors: [{ messageId: 'prefer-source' }],
      output: `import { produce } from "solid-js/store";\n`,
    },
    {
      code: `import type { Signal } from 'solid-js/web'`,
      errors: [{ messageId: 'prefer-source' }],
      output: `import type { Signal } from "solid-js";\n`,
    },
    {
      code: `import { render } from 'solid-js'`,
      settings: { solid: { version: 2 } },
      errors: [{ messageId: 'prefer-source' }],
      output: `import { render } from "@solidjs/web";\n`,
    },
    {
      code: `import { createSignal } from '@solidjs/web'`,
      settings: { solid: { version: 2 } },
      errors: [{ messageId: 'prefer-source' }],
      output: `import { createSignal } from "solid-js";\n`,
    },
  ],
})
