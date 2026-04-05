import { RuleTester } from 'oxlint/plugins-dev'
import { preferForRule as rule } from './prefer-for.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid/prefer-for', rule, {
  valid: [
    { code: `<For each={items()}>{item => <div>{item}</div>}</For>` },
    { code: `const els = items.map(item => item * 2)` },
  ],
  invalid: [
    {
      code: `<>{items().map(item => <div>{item}</div>)}</>`,
      errors: [{ messageId: 'preferFor' }],
      output: `<><For each={items()}>{item => <div>{item}</div>}</For></>`,
    },
  ],
})
