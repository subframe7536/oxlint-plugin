import { RuleTester } from 'oxlint/plugins-dev'
import { jsxUsesVarsRule as rule } from './jsx-uses-vars.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-jsx-uses-vars', rule, {
  valid: [
    // Component used in JSX - should not be reported as unused
    { code: `import MyComp from './MyComp'; function App() { return <MyComp /> }` },
    // Multiple components used in JSX
    {
      code: `
import A from './A';
import B from './B';
function App() { return <><A /><B /></> }
      `,
    },
    // Solid built-ins
    {
      code: `
import { Show, For } from 'solid-js';
function App() {
  return <Show when={true}><For each={[]}>{item => item}</For></Show>
}
      `,
    },
  ],
  invalid: [],
})
