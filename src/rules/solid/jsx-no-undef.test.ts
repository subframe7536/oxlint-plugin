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
    // When TypeScript checking is enabled, this rule defers to TypeScript
    { code: `<MyComp />`, options: [{ typescriptEnabled: true }] },
  ],
  invalid: [
    // Undefined component
    {
      code: `<MyComp />`,
      errors: [{ messageId: 'undefined' }],
    },
    // Auto-import missing common components from "solid-js"
    {
      code: `
function App() {
  const items = [1]
  return <For each={items}>{item => <div>{item}</div>}</For>
}
      `,
      errors: [{ messageId: 'autoImport' }],
      output: `import { For } from "solid-js";

function App() {
  const items = [1]
  return <For each={items}>{item => <div>{item}</div>}</For>
}
      `,
    },
    // When autoImport is disabled, missing components are reported as undefined
    {
      code: `
function App() {
  const items = [1]
  return <For each={items}>{item => <div>{item}</div>}</For>
}
      `,
      options: [{ autoImport: false }],
      errors: [{ messageId: 'undefined' }],
    },
  ],
})
