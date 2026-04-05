import { RuleTester } from 'oxlint/plugins-dev'
import { jsxNoUndefRule as rule } from './jsx-no-undef.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid/jsx-no-undef', rule, {
  valid: [
    { code: `import MyComp from './MyComp'; <MyComp />` },
    { code: `<div />` },
    { code: `function App() { return <div/> }` },
  ],
  invalid: [
    {
      code: `<MyComp />`,
      errors: [{ messageId: 'undefined' }],
    },
  ],
})
