import { RuleTester } from 'oxlint/plugins-dev'
import { removedApiRule as rule } from './removed-api.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-removed-api', rule, {
  valid: [
    { code: `import { createSignal, onSettled } from 'solid-js';` },
    { code: `import { render } from '@solidjs/web';` },
  ],
  invalid: [
    {
      code: `import { render } from 'solid-js/web';`,
      output: `import { render } from '@solidjs/web';`,
      errors: [{ messageId: 'webMoved' }],
    },
    {
      code: `import { createStore } from 'solid-js/store';`,
      output: `import { createStore } from 'solid-js';`,
      errors: [{ messageId: 'storeChanged' }],
    },
    {
      code: `import { getListener } from 'solid-js';`,
      output: `import { getObserver } from 'solid-js';`,
      errors: [{ messageId: 'renamed' }],
    },
    {
      code: `<div classList={{ active: true }} />`,
      output: `<div class={{ active: true }} />`,
      errors: [{ messageId: 'classList' }],
    },
  ],
})
