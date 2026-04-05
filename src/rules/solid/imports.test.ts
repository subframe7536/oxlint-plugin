import { RuleTester } from 'oxlint/plugins-dev'
import { importsRule as rule } from './imports.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid/imports', rule, {
  valid: [
    { code: `import { createSignal } from 'solid-js'` },
    { code: `import { render } from 'solid-js/web'` },
    { code: `import { createStore } from 'solid-js/store'` },
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
  ],
})
