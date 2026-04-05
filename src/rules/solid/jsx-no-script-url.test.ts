import { RuleTester } from 'oxlint/plugins-dev'
import { jsxNoScriptUrlRule as rule } from './jsx-no-script-url.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid/jsx-no-script-url', rule, {
  valid: [
    { code: `<a href="https://example.com">link</a>` },
    { code: `<a href="/path">link</a>` },
    { code: `<a href={url}>link</a>` },
  ],
  invalid: [
    {
      code: `<a href="javascript:void(0)">link</a>`,
      errors: [{ messageId: 'noJSURL' }],
    },
    {
      code: `<iframe src="javascript:false"/>`,
      errors: [{ messageId: 'noJSURL' }],
    },
  ],
})
