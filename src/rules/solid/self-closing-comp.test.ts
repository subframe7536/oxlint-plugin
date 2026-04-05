import { RuleTester } from 'oxlint/plugins-dev'
import { selfClosingCompRule as rule } from './self-closing-comp.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-self-closing-comp', rule, {
  valid: [
    // Component already self-closed
    { code: `<MyComp />` },
    // Element with content should not be self-closed
    { code: `<div>content</div>` },
    // Void element in self-close form (default: html:'all', but br is non-component)
    { code: `<br />` },
    // Non-void element not self-closed when html:'void'
    { code: `<div></div>`, options: [{ html: 'void' }] },
    // No element self-closed when html:'none'
    { code: `<div></div>`, options: [{ html: 'none' }] },
    // Component not self-closing when component:'none'
    { code: `<MyComp></MyComp>`, options: [{ component: 'none' }] },
  ],
  invalid: [
    // Component with no children should be self-closed
    {
      code: `<MyComp></MyComp>`,
      errors: [{ messageId: 'selfClose' }],
      output: `<MyComp />`,
    },
    // Empty div should be self-closed when html:'all'
    {
      code: `<div></div>`,
      options: [{ html: 'all' }],
      errors: [{ messageId: 'selfClose' }],
      output: `<div />`,
    },
    // Self-closing non-void when html:'void' should be expanded
    {
      code: `<div />`,
      options: [{ html: 'void' }],
      errors: [{ messageId: 'dontSelfClose' }],
      output: `<div></div>`,
    },
    // Empty span should be self-closed when html:'all'
    {
      code: `<span></span>`,
      options: [{ html: 'all' }],
      errors: [{ messageId: 'selfClose' }],
      output: `<span />`,
    },
  ],
})
