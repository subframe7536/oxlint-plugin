import { RuleTester } from 'oxlint/plugins-dev'
import { jsxNoDuplicatePropsRule as rule } from './jsx-no-duplicate-props.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid/jsx-no-duplicate-props', rule, {
  valid: [
    { code: `<div class="a" id="b" />` },
    { code: `<div CLASS="a" class="b" />` },
    { code: `<div CLASS="a" class="b" />`, options: [{ ignoreCase: false }] },
  ],
  invalid: [
    {
      code: `<div id="a" id="b" />`,
      errors: [{ messageId: 'noDuplicateProps' }],
    },
    {
      code: `<div class="a" class="b" />`,
      errors: [{ messageId: 'noDuplicateClass' }],
    },
    {
      code: `<div CLASS="a" class="b" />`,
      options: [{ ignoreCase: true }],
      errors: [{ messageId: 'noDuplicateClass' }],
    },
  ],
})
