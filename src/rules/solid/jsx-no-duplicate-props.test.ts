import { RuleTester } from 'oxlint/plugins-dev'
import { jsxNoDuplicatePropsRule as rule } from './jsx-no-duplicate-props.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-jsx-no-duplicate-props', rule, {
  valid: [
    // No duplicates
    { code: `<div class="a" id="b" />` },
    // Case-sensitive (default) - CLASS and class are different
    { code: `<div CLASS="a" class="b" />` },
    // Explicit case-sensitive option
    { code: `<div CLASS="a" class="b" />`, options: [{ ignoreCase: false }] },
    // Multiple distinct props
    { code: `<input type="text" name="foo" value="bar" />` },
  ],
  invalid: [
    // Same non-class prop twice
    {
      code: `<div id="a" id="b" />`,
      errors: [{ messageId: 'noDuplicateProps' }],
    },
    // Same class prop twice
    {
      code: `<div class="a" class="b" />`,
      errors: [{ messageId: 'noDuplicateClass' }],
    },
    // className duplicate
    {
      code: `<div className="a" className="b" />`,
      errors: [{ messageId: 'noDuplicateProps' }],
    },
    // Case-insensitive mode treats CLASS and class as the same
    {
      code: `<div CLASS="a" class="b" />`,
      options: [{ ignoreCase: true }],
      errors: [{ messageId: 'noDuplicateClass' }],
    },
  ],
})
