import { RuleTester } from 'oxlint/plugins-dev'
import { selfClosingCompRule as rule } from './self-closing-comp.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid/self-closing-comp', rule, {
  valid: [
    { code: `<MyComp />` },
    { code: `<div>content</div>` },
    { code: `<br />` },
    { code: `<div></div>`, options: [{ html: 'void' }] },
    { code: `<div></div>`, options: [{ html: 'none' }] },
  ],
  invalid: [
    {
      code: `<MyComp></MyComp>`,
      errors: [{ messageId: 'selfClose' }],
      output: `<MyComp />`,
    },
    {
      code: `<div></div>`,
      options: [{ html: 'all' }],
      errors: [{ messageId: 'selfClose' }],
      output: `<div />`,
    },
    {
      code: `<div />`,
      options: [{ html: 'void' }],
      errors: [{ messageId: 'dontSelfClose' }],
      output: `<div ></div>`,
    },
  ],
})
