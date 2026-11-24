import { RuleTester } from 'oxlint/plugins-dev'
import { noSingleArgCreateEffectRule as rule } from './no-single-arg-create-effect.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-single-arg-create-effect', rule, {
  valid: [
    {
      code: `
import { createEffect } from 'solid-js';
createEffect(() => count(), (v) => console.log(v));
      `,
    },
  ],
  invalid: [
    {
      code: `
import { createEffect } from 'solid-js';
createEffect(() => console.log(count()));
      `,
      errors: [{ messageId: 'singleArgEffect' }],
    },
  ],
})
