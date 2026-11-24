import { RuleTester } from 'oxlint/plugins-dev'
import { noBooleanEnumeratedAttributeRule as rule } from './no-boolean-enumerated-attribute.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-boolean-enumerated-attribute', rule, {
  valid: [
    { code: `<div draggable="true" />` },
    { code: `<div draggable="false" />` },
    { code: `<div aria-expanded="false" />` },
    { code: `<div contenteditable={true} />` },
  ],
  invalid: [
    {
      code: `<div draggable={true} />`,
      output: `<div draggable="true" />`,
      errors: [{ messageId: 'booleanValue' }],
    },
    {
      code: `<div draggable={false} />`,
      output: `<div draggable="false" />`,
      errors: [{ messageId: 'booleanValue' }],
    },
    {
      code: `<button aria-expanded={false} />`,
      output: `<button aria-expanded="false" />`,
      errors: [{ messageId: 'booleanValue' }],
    },
  ],
})
