import { RuleTester } from 'oxlint/plugins-dev'
import { noInnerHTMLRule as rule } from './no-innerhtml.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid/no-innerhtml', rule, {
  valid: [
    {
      code: `<div innerHTML="<p>Hello</p>" />`,
      options: [{ allowStatic: true }],
    },
  ],
  invalid: [
    {
      code: `<div innerHTML={userInput} />`,
      errors: [{ messageId: 'dangerous' }],
    },
    {
      code: `<div dangerouslySetInnerHTML={{ __html: content }} />`,
      errors: [{ messageId: 'dangerouslySetInnerHTML' }],
      output: `<div innerHTML={content} />`,
    },
  ],
})
