import { RuleTester } from 'oxlint/plugins-dev'
import { jsxNoUndefRule as rule } from './jsx-no-undef.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-jsx-no-undef', rule, {
  valid: [
    // Imported component
    { code: `import MyComp from './MyComp'; <MyComp />` },
    // Built-in HTML elements are always defined
    { code: `<div />` },
    { code: `<span class="foo" />` },
    // Component defined in the same file
    { code: `function App() { return <div/> }` },
    // Local component definition
    {
      code: `
function MyComp() { return <div/> }
function App() { return <MyComp /> }
      `,
    },
  ],
  invalid: [
    // Undefined component
    {
      code: `<MyComp />`,
      errors: [{ messageId: 'undefined' }],
    },
  ],
})
