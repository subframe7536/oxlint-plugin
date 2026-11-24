import { RuleTester } from 'oxlint/plugins-dev'
import { validateJsxNestingRule as rule } from './validate-jsx-nesting.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-validate-jsx-nesting', rule, {
  valid: [
    { code: `const el = <div><p>hello</p></div>;` },
    { code: `const el = <table><tbody><tr><td>cell</td></tr></tbody></table>;` },
    { code: `const el = <svg><g><rect /></g></svg>;` },
  ],
  invalid: [
    {
      code: `const el = <p><div /></p>;`,
      errors: [{ messageId: 'invalidNesting' }],
    },
    {
      code: `const el = <p>{ok && <div />}</p>;`,
      errors: [{ messageId: 'invalidNestingInserted' }],
    },
  ],
})
