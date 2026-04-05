import { RuleTester } from 'oxlint/plugins-dev'
import { jsxNoScriptUrlRule as rule } from './jsx-no-script-url.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-jsx-no-script-url', rule, {
  valid: [
    // Normal URLs - safe
    { code: `<a href="https://example.com">link</a>` },
    { code: `<a href="/path">link</a>` },
    // Dynamic URL - can't be statically analyzed, not flagged
    { code: `<a href={url}>link</a>` },
    // Other attrs without javascript:
    { code: `<img src="https://example.com/img.png" />` },
    // Empty href
    { code: `<a href="#">link</a>` },
  ],
  invalid: [
    // javascript: URL in href
    {
      code: `<a href="javascript:void(0)">link</a>`,
      errors: [{ messageId: 'noJSURL' }],
    },
    // javascript: URL in src
    {
      code: `<iframe src="javascript:false"/>`,
      errors: [{ messageId: 'noJSURL' }],
    },
    // Case-insensitive match
    {
      code: `<a href="JAVASCRIPT:void(0)">link</a>`,
      errors: [{ messageId: 'noJSURL' }],
    },
    // With whitespace prefix
    {
      code: `<a href=" javascript:alert(1)">link</a>`,
      errors: [{ messageId: 'noJSURL' }],
    },
  ],
})
