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
    // Correct import sources
    { code: `import { createSignal } from 'solid-js'` },
    { code: `import { createMemo } from 'solid-js'` },
    { code: `import { render } from 'solid-js/web'` },
    { code: `import { hydrate } from 'solid-js/web'` },
    { code: `import { createStore } from 'solid-js/store'` },
    { code: `import { produce } from 'solid-js/store'` },
  ],
  invalid: [
    // render should come from 'solid-js/web', not 'solid-js'
    {
      code: `import { render } from 'solid-js'`,
      errors: [{ messageId: 'prefer-source' }],
      output: `import { render } from "solid-js/web";\n`,
    },
    // createSignal should come from 'solid-js', not 'solid-js/web'
    {
      code: `import { createSignal } from 'solid-js/web'`,
      errors: [{ messageId: 'prefer-source' }],
      output: `import { createSignal } from "solid-js";\n`,
    },
    // createStore should come from 'solid-js/store', not 'solid-js'
    {
      code: `import { createStore } from 'solid-js'`,
      errors: [{ messageId: 'prefer-source' }],
      output: `import { createStore } from "solid-js/store";\n`,
    },
  ],
})
