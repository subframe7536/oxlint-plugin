import { RuleTester } from 'oxlint/plugins-dev'
import { preferStructuredClassRule as rule } from './prefer-structured-class.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-prefer-structured-class', rule, {
  valid: [
    { code: `<div class="foo bar" />` },
    { code: `<div class={['foo', active() && 'bar']} />` },
    { code: `<div class={{ active: active() }} />` },
  ],
  invalid: [
    {
      code: '<div class={`foo ${active() ? "bar" : ""}`} />',
      errors: [{ messageId: 'manualClassString' }],
    },
    {
      code: `<div class={['foo', active() && 'bar'].filter(Boolean).join(' ')} />`,
      errors: [{ messageId: 'manualClassString' }],
    },
  ],
})
