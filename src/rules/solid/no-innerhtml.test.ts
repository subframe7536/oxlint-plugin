import { RuleTester } from 'oxlint/plugins-dev'
import { noInnerHTMLRule as rule } from './no-innerhtml.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-innerhtml', rule, {
  valid: [
    // Static HTML string is allowed when allowStatic is true
    {
      code: `<div innerHTML="<p>Hello</p>" />`,
      options: [{ allowStatic: true }],
    },
    // Normal text content is fine
    { code: `<div>Hello world</div>` },
    // Other attributes are fine
    { code: `<div class="foo" id="bar" />` },
  ],
  invalid: [
    // Dynamic innerHTML is always dangerous
    {
      code: `<div innerHTML={userInput} />`,
      errors: [{ messageId: 'dangerous' }],
    },
    // Static HTML with existing children should conflict
    {
      code: `<div innerHTML="<p>hi</p>">child</div>`,
      options: [{ allowStatic: true }],
      errors: [{ messageId: 'conflict' }],
    },
    // Static innerHTML is flagged when allowStatic is explicitly set to false
    {
      code: `<div innerHTML="<p>safe</p>" />`,
      options: [{ allowStatic: false }],
      errors: [{ messageId: 'dangerous' }],
    },
    // Static string that is not HTML should suggest using innerText
    {
      code: `<div innerHTML="plain text" />`,
      options: [{ allowStatic: true }],
      errors: [{ messageId: 'notHtml' }],
    },
    // React-style dangerouslySetInnerHTML is also flagged and auto-fixed
    {
      code: `<div dangerouslySetInnerHTML={{ __html: content }} />`,
      errors: [{ messageId: 'dangerouslySetInnerHTML' }],
      output: `<div innerHTML={content} />`,
    },
  ],
})
